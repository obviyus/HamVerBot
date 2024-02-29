use std::{env, sync::Arc};

use ::futures::prelude::*;
use ::irc::client::prelude::*;
use chrono::{Datelike, Utc};

use log::{error, info, warn};
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use tokio::sync::mpsc;
use tokio_cron_scheduler::{Job, JobScheduler};

use crate::worker::JobType;

mod database;
mod fetch;
mod irc;
mod message;
mod models;
mod worker;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();

    // Configuration before startup
    let bot_config = match irc::load_config().await {
        Ok(config) => config,
        Err(err) => {
            return Err(err);
        }
    };

    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "./HamVerBot.db".to_string());

    info!("Connecting to SQLite DB at {}", database_url);
    let options = SqliteConnectOptions::new()
        .filename(&database_url)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await?;

    // Run migrations
    sqlx::migrate!().run(&pool).await?;

    let mut irc_client = Client::from_config(bot_config.irc).await?;

    let mut stream = irc_client.stream()?;
    let sender = irc_client.sender();

    // Perform SASL authentication
    irc::authenticate(&bot_config.nickname, &bot_config.password, &irc_client)?;

    // Fetch driver list and refresh calendar before anything else
    match fetch::read_current_event().await {
        Ok((path, _)) => {
            let previous_year = Utc::now().year() - 1;

            // fetch::fetch_driver_list(&path, &pool).await?;
            fetch::refresh_current_calendar(&pool, Some(previous_year)).await?;
            fetch::refresh_current_calendar(&pool, None).await?;
        }
        Err(e) => {
            error!("Failed to fetch driver list: {:?}", e);
        }
    }

    // Job scheduler for workers
    let scheduler = JobScheduler::new().await?;

    let (tx, mut rx) = mpsc::channel::<JobType>(2);

    info!("Scheduling workers...");
    scheduler
        .add(Job::new_async("0 */5 * * * * *", move |_, _| {
            let tx = tx.clone();
            info!("Running result worker...");

            Box::pin(async move {
                if tx.send(JobType::CalendarRefresh).await.is_err() {
                    warn!("Receiver dropped, cannot send CalendarRefresh job");
                }
                if tx.send(JobType::Result).await.is_err() {
                    warn!("Receiver dropped, cannot send Result job");
                }
                if tx.send(JobType::Alert).await.is_err() {
                    warn!("Receiver dropped, cannot send Alert job");
                }
                if tx.send(JobType::Wdc).await.is_err() {
                    warn!("Receiver dropped, cannot send Wdc job");
                }
                if tx.send(JobType::Wcc).await.is_err() {
                    warn!("Receiver dropped, cannot send Wcc job");
                }
            })
        })?)
        .await?;

    scheduler.start().await?;

    // Clone the pool and sender variables
    let pool_clone = Arc::new(pool.clone());
    let sender_clone = sender.clone();

    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if let Err(e) = worker::process_job(message, &pool_clone, &sender_clone).await {
                error!("Failed to handle job: {:?}", e);
            }
        }
    });

    while let Some(message) = stream.next().await.transpose()? {
        info!("Received message: {:?}", message.command);

        match message.command {
            Command::CAP(_, ref subcommand, _, _) => {
                if subcommand.to_str() == "ACK" {
                    sender.send_sasl_plain()?;
                }
            }
            Command::AUTHENTICATE(_) => {
                irc::handle_authenticate(&*bot_config.nickname, &*bot_config.password, &sender)
                    .await?;
            }
            Command::Response(code, _) => irc::handle_response(code, &sender).await?,
            Command::INVITE(ref _target, ref channel) => {
                irc::join_channel(channel, &pool, &sender).await?;
            }
            Command::PRIVMSG(ref target, ref msg) => {
                if msg.starts_with(&bot_config.command_prefix) {
                    let command = &msg[bot_config.command_prefix.len()..];
                    match message::handle_irc_message(&sender, &pool, command, target).await {
                        Ok(_) => {}
                        Err(e) => {
                            error!("Failed to handle message: {:?}", e);
                        }
                    };
                }
            }
            _ => {}
        }
    }

    info!("Connection to IRC server has been closed. Shutting down...");
    Ok(())
}
