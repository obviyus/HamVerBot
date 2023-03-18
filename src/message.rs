use std::sync::Arc;

use chrono::TimeZone;
use irc::client::Client;
use log::trace;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

use crate::{database, fetch};

pub async fn handle_irc_message(
    client: Arc<Client>,
    pool: Pool<SqliteConnectionManager>,
    message: &str,
    target: &String,
) -> Result<(), Box<dyn std::error::Error>> {
    match message.to_lowercase().as_str().trim() {
        "ping" => {
            client.send_privmsg(target, "pong")?;
        }

        "n" | "next" => {
            let (name, description, start_time) = match database::next_event(pool).await? {
                Some(event) => event,
                None => {
                    client.send_privmsg(target, "No upcoming events found.")?;
                    return Ok(());
                }
            };

            client.send_privmsg(
                target,
                string_builder(format!("{}: {}", name, description).as_str(), start_time),
            )?;
        }

        "wr" | "whenrace" => {
            let (name, description, start_time) =
                match database::next_event_by_description(pool, database::Description::GrandPrix)
                    .await?
                {
                    Some(event) => event,
                    None => {
                        client.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            client.send_privmsg(
                target,
                string_builder(format!("{}: {}", name, description).as_str(), start_time),
            )?;
        }

        "wq" | "whenquali" => {
            let (name, description, start_time) =
                match database::next_event_by_description(pool, database::Description::Qualifying)
                    .await?
                {
                    Some(event) => event,
                    None => {
                        client.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            client.send_privmsg(
                target,
                string_builder(format!("{}: {}", name, description).as_str(), start_time),
            )?;
        }

        "ws" | "whensprint" => {
            let (name, description, start_time) =
                match database::next_event_by_description(pool, database::Description::Sprint)
                    .await?
                {
                    Some(event) => event,
                    None => {
                        client.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            client.send_privmsg(
                target,
                string_builder(format!("{}: {}", name, description).as_str(), start_time),
            )?;
        }

        "p" | "prev" => {
            let path = match database::previous_result(pool).await? {
                Some(event) => event,
                None => {
                    client.send_privmsg(target, "No previous events found.")?;
                    return Ok(());
                }
            };

            client.send_privmsg(target, fetch::path_driver_standings(&path).await?)?;
        }

        "d" | "drivers" => {
            let standings: String = match fetch::fetch_wdc_standings().await {
                Ok(standings) => standings,
                Err(e) => {
                    client.send_privmsg(target, "Failed to fetch standings.")?;
                    return Err(e);
                }
            };

            client.send_privmsg(target, standings)?;
        }

        "c" | "constructors" => {
            let standings: String = match fetch::fetch_wcc_standings().await {
                Ok(standings) => standings,
                Err(e) => {
                    client.send_privmsg(target, "Failed to fetch standings.")?;
                    return Err(e);
                }
            };

            client.send_privmsg(target, standings)?;
        }
        _ => {}
    }

    trace!("{}", message);
    Ok(())
}

// Human readable time until event_time
pub(crate) fn string_builder(event_name: &str, event_time: i64) -> String {
    let parsed_time = chrono::Utc.timestamp_opt(event_time, 0);

    let time_left = parsed_time.single().unwrap() - chrono::Utc::now();
    let mut time_left_string: String;

    if time_left.num_days() > 0 {
        let day_string_ending = if time_left.num_days() > 1 { "s" } else { "" };
        time_left_string = format!("{} day{}", time_left.num_days(), day_string_ending);

        time_left_string.push_str(&format!(
            " and {} hour{}",
            time_left.num_hours() % 24,
            if time_left.num_hours() > 1 { "s" } else { "" }
        ));
    } else if time_left.num_hours() > 0 {
        let hour_string_ending = if time_left.num_hours() > 1 { "s" } else { "" };
        time_left_string = format!("{} hour{}", time_left.num_hours(), hour_string_ending);

        time_left_string.push_str(&format!(
            " and {} minute{}",
            time_left.num_minutes() % 60 + 1,
            if time_left.num_minutes() > 1 { "s" } else { "" }
        ));
    } else if time_left.num_minutes() > 0 {
        let minute_string_ending = if time_left.num_minutes() > 1 { "s" } else { "" };
        time_left_string = format!("{} minute{}", time_left.num_minutes(), minute_string_ending);
    } else {
        time_left_string = "0 seconds.".to_string();
    }

    format!("🏎️ \x02{}\x02 begins in {}.", event_name, time_left_string)
}
