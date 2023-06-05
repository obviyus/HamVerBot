use std::{env, sync::Arc};

use ::futures::prelude::*;
use ::irc::client::prelude::*;

use base64::{engine::general_purpose, Engine as _};
use log::{error, info};
use sqlx::SqlitePool;
use tokio_cron_scheduler::{Job, JobScheduler};

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
            return Err(err.into());
        }
    };

    let pool = SqlitePool::connect(
        &(env::var("DATABASE_URL").unwrap_or("sqlite:HamVerBot.db".to_string())),
    )
    .await?;

    let mut irc_client = Client::from_config(bot_config.irc).await?;

    let mut stream = irc_client.stream()?;
    let sender = irc_client.sender();

    // Perform SASL authentication
    irc::authenticate(&bot_config.nickname, &bot_config.password, &irc_client)?;

    // Job scheduler for workers
    let scheduler = JobScheduler::new().await?;

    // Clone the pool and sender variables
    let pool_clone = Arc::new(pool.clone());
    let sender_clone = sender.clone();

    info!("Starting workers...");

    scheduler
        .add(Job::new_async("0 1/5 * * * *", move |_, _| {
            let pool_clone = pool_clone.clone();
            let sender_clone = sender_clone.clone();

            Box::pin(async move {
                match worker::result_worker(&pool_clone, &sender_clone).await {
                    Ok(_) => {}
                    Err(e) => {
                        error!("Failed to handle result: {:?}", e);
                    }
                };

                match worker::alert_worker(&pool_clone, &sender_clone).await {
                    Ok(_) => {}
                    Err(e) => {
                        error!("Failed to handle alert: {:?}", e);
                    }
                };
            })
        })?)
        .await?;

    scheduler.start().await?;

    while let Some(message) = stream.next().await.transpose()? {
        // info!("Received message: {:?}", message.command);

        match message.command {
            Command::CAP(_, ref subcommand, _, _) => {
                if subcommand.to_str() == "ACK" {
                    info!("Received ACK for SASL authentication.");
                    sender.send_sasl_plain()?;
                }
            }

            Command::AUTHENTICATE(_) => {
                info!("Got signal to continue authenticating");
                sender.send(Command::AUTHENTICATE(general_purpose::STANDARD.encode(
                    format!(
                        "{}\x00{}\x00{}",
                        bot_config.nickname, bot_config.nickname, bot_config.password
                    ),
                )))?;
                sender.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
            }

            Command::Response(code, _) => {
                if code == Response::RPL_SASLSUCCESS {
                    info!("Successfully authenticated");
                    sender.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
                }
            }

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
