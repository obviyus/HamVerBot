mod database;
mod event_results;
mod models;
mod next_event;

use futures::prelude::*;
use irc::client::prelude::*;
use log::{error, info};
use std::time::Duration;

#[tokio::main]
async fn main() -> irc::error::Result<()> {
    env_logger::init();

    let config = Config::load("./config.toml").unwrap();

    info!("🏎️ Revving up {}... ", config.nickname.as_ref().unwrap());

    let command_prefix = match config.options.get("command_prefix") {
        Some(prefix) => prefix.to_string(),
        None => "!".to_string(),
    };
    info!("Command prefix: {}", command_prefix);

    match database::init_db() {
        Ok(_) => info!("Database initialized successfully."),
        Err(e) => error!("Error initializing database: {}", e),
    }

    let mut client = Client::from_config(config.clone()).await?;

    // Handle SASL authentication manually
    // https://github.com/aatxe/irc/issues/218
    client.send_cap_req(&[Capability::Sasl])?;
    client.send(Command::PASS(config.password.as_ref().unwrap().to_string()))?;
    client.send(Command::NICK(config.nickname.as_ref().unwrap().to_string()))?;
    client.send(Command::USER(
        config.nickname()?.to_string(),
        "0".to_owned(),
        config.nickname()?.to_string(),
    ))?;

    // Separate sender for tasks that need to be run in the background
    let sender = client.sender();

    tokio::spawn(async move {
        // Small buffer to give the bot enough time to connect
        tokio::time::sleep(Duration::from_secs(10)).await;

        // Perform checks every 5 minutes
        let mut interval = tokio::time::interval(Duration::from_secs(300));

        loop {
            interval.tick().await;

            // Read the latest result; only deliver it if "path" is not present in the database
            match event_results::read_result().await {
                Ok(result_string) => {
                    if let Some(result_string) = result_string {
                        sender.send_privmsg("#obviyus", &result_string);
                    }
                }
                Err(e) => {
                    error!("Error reading result: {}", e);
                }
            }

            // Load upcoming events into the database. If the next event is within 5 minutes
            // send a message to the channel. If no event is found, poll API for a new list.
            match database::next_event() {
                Some((formatted_string, _event_name, event_time)) => {
                    if event_time - chrono::Utc::now() < chrono::Duration::minutes(5) {
                        sender.send_privmsg("#obviyus", formatted_string);
                    }
                }
                None => match next_event::fetch_events().await {
                    Ok(_) => todo!(),
                    Err(e) => {
                        error!("Error fetching events: {}", e);
                    }
                },
            }
        }
    });

    let mut stream = client.stream()?;
    while let Some(message) = stream.next().await.transpose()? {
        info!("{}", message);
        match message.command {
            Command::CAP(_, ref subcommand, _, _) => {
                if subcommand.to_str() == "ACK" {
                    info!("Received ack for sasl");
                    client.send_sasl_plain()?;
                }
            }
            Command::AUTHENTICATE(_) => {
                info!("Got signal to continue authenticating");
                client.send(Command::AUTHENTICATE(base64::encode(format!(
                    "{}\x00{}\x00{}",
                    config.nickname()?.to_string(),
                    config.nickname()?.to_string(),
                    config.password().to_string()
                ))))?;
                client.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
            }
            Command::Response(code, _) => {
                if code == Response::RPL_SASLSUCCESS {
                    info!("Successfully authenticated");
                    client.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
                }
            }
            Command::INVITE(ref _target, ref msg) => {
                client.send_join(msg)?;
            }
            Command::PRIVMSG(ref target, ref msg) => {
                if msg.starts_with(&command_prefix) {
                    let command = &msg[command_prefix.len()..];
                    match command {
                        "ping" => {
                            client.send_privmsg(target, "pong")?;
                        }
                        "countdown" => match database::next_event() {
                            Some((_formatted_string, event_name, event_time)) => {
                                let time_left = event_time - chrono::Utc::now();
                                let time_left_string: String;

                                if time_left.num_days() > 0 {
                                    let day_string_ending =
                                        if time_left.num_days() > 1 { "s" } else { "" };
                                    time_left_string = format!(
                                        "{} day{}",
                                        time_left.num_days(),
                                        day_string_ending
                                    );
                                } else if time_left.num_hours() > 0 {
                                    let hour_string_ending =
                                        if time_left.num_hours() > 1 { "s" } else { "" };
                                    time_left_string = format!(
                                        "{} hour{}",
                                        time_left.num_hours(),
                                        hour_string_ending
                                    );
                                } else if time_left.num_minutes() > 0 {
                                    let minute_string_ending =
                                        if time_left.num_minutes() > 1 { "s" } else { "" };
                                    time_left_string = format!(
                                        "{} minute{}",
                                        time_left.num_minutes(),
                                        minute_string_ending
                                    );
                                } else {
                                    time_left_string = "0 seconds.".to_string();
                                }

                                client.send_privmsg(
                                    target,
                                    format!(
                                        "🏎️ \x02{}\x02 begins in {}",
                                        event_name, time_left_string
                                    ),
                                )?;
                            }
                            None => {
                                client.send_privmsg(target, "No upcoming events found.")?;
                            }
                        },
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    Ok(())
}
