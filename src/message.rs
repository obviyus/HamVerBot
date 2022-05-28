use std::sync::Arc;

use chrono::TimeZone;
use irc::client::Client;
use log::trace;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

use crate::database;

pub async fn handle_irc_message(
    client: Arc<Client>,
    pool: Pool<SqliteConnectionManager>,
    message: &str,
    target: &String,
) -> Result<(), Box<dyn std::error::Error>> {
    match message.to_lowercase().as_str() {
        "ping" => {
            client.send_privmsg(target, "pong")?;
        }

        "next" => {
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
        _ => {}
    }

    trace!("{}", message);
    Ok(())
}

// Human readable time until event_time
pub(crate) fn string_builder(event_name: &str, event_time: i64) -> String {
    let parsed_time = chrono::Utc.timestamp(event_time, 0);

    let time_left = parsed_time - chrono::Utc::now();
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
