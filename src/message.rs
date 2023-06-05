use chrono::TimeZone;
use irc::client::Sender;
use log::trace;
use sqlx::SqlitePool;

use crate::{
    database::{self, EventType},
    fetch,
};

pub async fn handle_irc_message(
    sender: &Sender,
    pool: &SqlitePool,
    message: &str,
    target: &String,
) -> Result<(), Box<dyn std::error::Error>> {
    match message.to_lowercase().as_str().trim() {
        "ping" => {
            sender.send_privmsg(target, "pong")?;
        }

        "n" | "next" => {
            let (meeting_name, event_type, start_time) =
                match database::next_event_filtered(pool, None).await? {
                    Some(event) => event,
                    None => {
                        sender.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            sender.send_privmsg(
                target,
                string_builder(
                    format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                    start_time,
                ),
            )?;
        }

        "wr" | "whenrace" => {
            let (meeting_name, event_type, start_time) =
                match database::next_event_filtered(pool, Some(EventType::Race)).await? {
                    Some(event) => event,
                    None => {
                        sender.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            sender.send_privmsg(
                target,
                string_builder(
                    format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                    start_time,
                ),
            )?;
        }

        "wq" | "whenquali" => {
            let (meeting_name, event_type, start_time) =
                match database::next_event_filtered(pool, Some(EventType::Qualifying)).await? {
                    Some(event) => event,
                    None => {
                        sender.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            sender.send_privmsg(
                target,
                string_builder(
                    format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                    start_time,
                ),
            )?;
        }

        "ws" | "whensprint" => {
            let (meeting_name, event_type, start_time) =
                match database::next_event_filtered(pool, Some(EventType::Sprint)).await? {
                    Some(event) => event,
                    None => {
                        sender.send_privmsg(target, "No upcoming events found.")?;
                        return Ok(());
                    }
                };

            sender.send_privmsg(
                target,
                string_builder(
                    format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                    start_time,
                ),
            )?;
        }

        "p" | "prev" => {
            let path = match database::get_latest_path(pool).await? {
                Some(event) => event,
                None => {
                    sender.send_privmsg(target, "No previous events found.")?;
                    return Ok(());
                }
            };

            sender.send_privmsg(target, fetch::fetch_results(pool, &path).await?)?;
        }

        "d" | "drivers" => {
            let standings: String = match fetch::return_wdc_standings(pool).await {
                Ok(standings) => standings,
                Err(e) => {
                    sender.send_privmsg(target, "Failed to fetch standings.")?;
                    return Err(e);
                }
            };

            sender.send_privmsg(target, standings)?;
        }

        "c" | "constructors" => {
            let standings: String = match fetch::return_wcc_standings(pool).await {
                Ok(standings) => standings,
                Err(e) => {
                    sender.send_privmsg(target, "Failed to fetch standings.")?;
                    return Err(e);
                }
            };

            sender.send_privmsg(target, standings)?;
        }
        _ => {}
    }

    trace!("{}", message);
    Ok(())
}

// Human readable time until event_time
fn string_builder(event_name: &str, event_time: i64) -> String {
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

    format!("\x02{}\x02 begins in {}.", event_name, time_left_string)
}
