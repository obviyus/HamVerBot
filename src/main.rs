mod authenticate;
mod config;
mod database;
mod fetch;
mod message;
mod models;
use crate::{authenticate::authenticate, database::Event};
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
        Err(e) => {
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

            // Read the latest result; only deliver it if "path" is not present in the database
            match fetch::read_current_event().await {
                Ok((path, completed)) => {
                    let delivered = database::is_event_delivered(thread_pool.clone(), &path)
                        .await
                        .unwrap();
                    if completed && !delivered {
                        let standings = fetch::driver_standings(path).await.unwrap();

                        // Send the result to all channels
                        for channel in channels.iter() {
                            thread_client.send_privmsg(channel, &standings).unwrap();
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to read current event: {}", e);
                }
            };

            // Load upcoming events into the database. If the next event is within 5 minutes
            // send a message to the channels. If no event is found, poll API for a new list.
            match database::next_event(thread_pool.clone()).await.unwrap() {
                Some((name, description, start_time)) => {
                    if (start_time - Utc::now().timestamp()) < 300 {
                        for channel in channels.iter() {
                            thread_client.send_privmsg(
                                channel,
                                message::string_builder(
                                    format!("{}: {}", name, description).as_str(),
                                    start_time,
                                ),
                            );
                        }
                    }
                }
                None => match fetch::fetch_events().await.unwrap() {
                    Some(events) => {
                        for (name, description, start_time) in events {
                            database::insert_event(
                                thread_pool.clone(),
                                Event {
                                    id: 0,
                                    meeting_name: name,
                                    description,
                                    start_time,
                                },
                            );
                        }
                    }
                    None => {
                        error!("No events found.");
                    }
                },
            }
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
                    message::handle_irc_message(
                        client_clone.clone(),
                        db_pool.clone(),
                        command,
                        target,
                    )
                    .await;
                }
            }

            _ => {}
        }
        // trace!("{}", message);
    }

    info!("Connection to IRC server has been closed");

    Ok(())
}
