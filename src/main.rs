mod authenticate;
mod config;
mod database;
mod fetch;
mod message;
mod models;
mod worker;
use crate::authenticate::authenticate;
use chrono::{Timelike, Utc};
use futures::StreamExt;
use irc::client::prelude::*;
use log::{error, info};
use std::{process::exit, sync::Arc, time::Duration};

#[tokio::main]
async fn main() -> irc::error::Result<()> {
    env_logger::init();

    let config = match config::load_config() {
        Ok(config) => config,
        Err(_e) => {
            exit(1);
        }
    };

    let mut client = Client::from_config(config.irc.clone()).await?;
    let mut stream = client.stream()?;
    let sender = client.sender();
    let channels = config.channels.clone();

    let client_clone = Arc::new(client);
    let db_pool = database::new(format!("{}.db", config.irc.nickname()?))
        .await
        .unwrap();

    // Perform SASL authentication
    match authenticate(&config.irc, client_clone.clone()) {
        Ok(_) => {
            info!("Authenticated successfully");
        }
        Err(e) => {
            error!("Failed to authenticate: {:?}", e);
            exit(1);
        }
    }

    // Thread to run background tasks every 5 minutes
    let thread_pool = db_pool.clone();
    let thread_client = client_clone.clone();
    tokio::spawn(async move {
        // Sleep until the start of the next 5th minute
        let time_to_sleep = (5 - (Utc::now().minute()) % 5) * 60 + (60 - Utc::now().second());
        info!("Sleeping worker threads for {} seconds.", time_to_sleep);

        tokio::time::sleep(Duration::from_secs(time_to_sleep.into())).await;

        // Perform checks every 5 minutes
        let mut interval = tokio::time::interval(Duration::from_secs(300));

        loop {
            interval.tick().await;
            match worker::worker(thread_pool.clone(), thread_client.clone(), channels.clone()).await
            {
                Ok(_) => {}
                Err(e) => {
                    error!("Failed to run worker: {:?}", e);
                }
            };
        }
    });

    while let Some(message) = stream.next().await.transpose()? {
        info!("Received message: {:?}", message.command);
        match message.command {
            Command::CAP(_, ref subcommand, _, _) => {
                if subcommand.to_str() == "ACK" {
                    info!("Received ACK for SASL authentication.");
                    sender.send_sasl_plain()?;
                }
            }

            Command::AUTHENTICATE(_) => {
                info!("Got signal to continue authenticating");
                sender.send(Command::AUTHENTICATE(base64::encode(format!(
                    "{}\x00{}\x00{}",
                    client_clone.clone().current_nickname(),
                    client_clone.clone().current_nickname(),
                    config.irc.password().to_string()
                ))))?;
                sender.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
            }

            Command::Response(code, _) => {
                if code == Response::RPL_SASLSUCCESS {
                    info!("Successfully authenticated");
                    sender.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
                }
            }

            Command::INVITE(ref _target, ref msg) => {
                sender.send_join(msg)?;
            }

            Command::PRIVMSG(ref target, ref msg) => {
                if msg.starts_with(&config.command_prefix) {
                    let command = &msg[config.command_prefix.len()..];
                    match message::handle_irc_message(
                        client_clone.clone(),
                        db_pool.clone(),
                        command,
                        target,
                    )
                    .await
                    {
                        Ok(_) => {}
                        Err(e) => {
                            error!("Failed to handle message: {:?}", e);
                        }
                    };
                }
            }

            _ => {}
        }
        // trace!("{}", message);
    }

    info!("Connection to IRC server has been closed");

    Ok(())
}
