mod database;
mod event_results;
mod models;
mod next_event;

use futures::prelude::*;
use irc::client::prelude::*;
use std::time::Duration;
use serde::__private::de::IdentifierDeserializer;

#[tokio::main]
async fn main() -> irc::error::Result<()> {
    let config = Config::load("./config.toml").unwrap();

    let command_prefix = match config.options.get("command_prefix") {
        Some(prefix) => prefix.to_string(),
        None => "!".to_string(),
    };

    println!("PREFIX: {}", command_prefix);

    database::init_db();

    let mut client = Client::from_config(config).await?;
    client.identify()?;

    let sender = client.sender();

    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        let mut interval = tokio::time::interval(Duration::from_secs(300));

        loop {
            interval.tick().await;

            match event_results::read_result().await {
                Ok(result_string) => {
                    if let Some(result_string) = result_string {
                        sender.send_privmsg("#obviyus", &result_string);
                    }
                }
                Err(e) => {
                    sender.send_privmsg("#obviyus", e);
                }
            }

            println!("RESULT READ; CHECKING EVENTS");

            match database::next_event() {
                Ok(event) => match event {
                    Some((formatted_string, _event_name, event_time)) => {
                        if event_time - chrono::Utc::now() < chrono::Duration::minutes(5) {
                            sender.send_privmsg("#obviyus", formatted_string);
                        }
                    }
                    None => {
                        next_event::fetch_events().await;
                    }
                },
                Err(e) => {
                    sender.send_privmsg("#obviyus", e);
                }
            }
        }
    });

    let mut stream = client.stream()?;
    while let Some(message) = stream.next().await.transpose()? {
        print!("{}", message);

        match message.command {
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
                        "countdown" => {
                            match database::next_event() {
                                Ok(event) => match event {
                                    Some((_formatted_string, event_name, event_time)) => {
                                        let time_left = event_time - chrono::Utc::now();
                                        let time_left_string: String;

                                        if time_left.num_days() > 0 {
                                            let day_string_ending = if time_left.num_days() > 1 { "s" } else { "" };
                                            time_left_string = format!(
                                                "{} day{}",
                                                time_left.num_days(),
                                                day_string_ending
                                            );
                                        } else if time_left.num_hours() > 0 {
                                            let hour_string_ending = if time_left.num_hours() > 1 { "s" } else { "" };
                                            time_left_string = format!(
                                                "{} hour{}",
                                                time_left.num_hours(),
                                                hour_string_ending
                                            );
                                        } else if time_left.num_minutes() > 0 {
                                            let minute_string_ending = if time_left.num_minutes() > 1 { "s" } else { "" };
                                            time_left_string = format!(
                                                "{} minute{}",
                                                time_left.num_minutes(),
                                                minute_string_ending
                                            );
                                        } else {
                                            time_left_string = "0 seconds.".to_string();
                                        }

                                        client.send_privmsg(target, format!(
                                            "🏎️ \x02{}\x02 begins in {}",
                                            event_name,
                                            time_left_string
                                        ))?;
                                    }
                                    None => {
                                        client.send_privmsg(target, "No upcoming events found.")?;
                                    }
                                },
                                Err(e) => {
                                    client.send_privmsg(target, e)?;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    Ok(())
}
