use chrono::{Duration, TimeZone, Utc};

use irc::client::Sender;
use log::trace;
use sqlx::SqlitePool;

use crate::{
    database::{self, EventType},
    fetch,
};

pub struct CommandHandler<'a> {
    sender: &'a Sender,
    pool: &'a SqlitePool,
    target: &'a String,
}

impl<'a> CommandHandler<'a> {
    async fn handle_ping(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.sender.send_privmsg(self.target, "pong")?;
        Ok(())
    }

    async fn handle_next(&self) -> Result<(), Box<dyn std::error::Error>> {
        let (meeting_name, event_type, start_time) =
            match database::next_event_filtered(self.pool, None).await? {
                Some(event) => event,
                None => {
                    self.sender
                        .send_privmsg(self.target, "No upcoming events found.")?;
                    return Ok(());
                }
            };

        self.sender.send_privmsg(
            self.target,
            string_builder(
                format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                start_time,
            )?,
        )?;

        Ok(())
    }

    async fn handle_prev(&self) -> Result<(), Box<dyn std::error::Error>> {
        match database::get_latest_path(self.pool).await? {
            Some(path) => {
                self.sender
                    .send_privmsg(self.target, fetch::fetch_results(self.pool, &path).await?)?;
            }
            None => {
                self.sender
                    .send_privmsg(self.target, "No previous events found.")?;
                return Ok(());
            }
        };

        Ok(())
    }

    async fn handle_wdc(&self) -> Result<(), Box<dyn std::error::Error>> {
        let standings: String = match fetch::return_wdc_standings(self.pool).await {
            Ok(standings) => standings,
            Err(e) => {
                self.sender
                    .send_privmsg(self.target, "Failed to fetch standings.")?;
                return Err(e.into());
            }
        };

        self.sender.send_privmsg(self.target, standings)?;

        Ok(())
    }

    async fn handle_wcc(&self) -> Result<(), Box<dyn std::error::Error>> {
        let standings: String = match fetch::return_wcc_standings(self.pool).await {
            Ok(standings) => standings,
            Err(e) => {
                self.sender
                    .send_privmsg(self.target, "Failed to fetch standings.")?;
                return Err(e.into());
            }
        };

        self.sender.send_privmsg(self.target, standings)?;

        Ok(())
    }

    async fn handle_when(
        &self,
        event_type: Option<&&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let event_type = match event_type {
            Some(event_type) => EventType::from_str(event_type),
            None => None,
        };

        let (meeting_name, event_type, start_time) =
            match database::next_event_filtered(self.pool, event_type).await? {
                Some(event) => event,
                None => {
                    self.sender
                        .send_privmsg(self.target, "No upcoming events found.")?;
                    return Ok(());
                }
            };

        self.sender.send_privmsg(
            self.target,
            string_builder(
                format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                start_time,
            )?,
        )?;

        Ok(())
    }
}

pub async fn handle_irc_message(
    sender: &Sender,
    pool: &SqlitePool,
    message: &str,
    target: &String,
) -> Result<(), Box<dyn std::error::Error>> {
    trace!("{}", message);
    let message = message.to_lowercase();
    let args = message.split_whitespace().collect::<Vec<&str>>();

    let mut commands = args.iter();
    let handler = CommandHandler {
        sender,
        pool,
        target,
    };

    if let Some(command) = commands.next() {
        match *command {
            "ping" => handler.handle_ping().await?,
            "n" | "next" => handler.handle_next().await?,
            "w" | "when" => handler.handle_when(commands.next()).await?,
            "p" | "prev" => handler.handle_prev().await?,
            "d" | "drivers" => handler.handle_wdc().await?,
            "c" | "constructors" => handler.handle_wcc().await?,
            _ => {}
        }
    }

    Ok(())
}

fn pluralize(s: &str, count: i64) -> String {
    format!("{}{}", s, if count == 1 { "" } else { "s" })
}

fn format_duration(duration: Duration) -> Result<String, &'static str> {
    if duration.num_seconds() <= 0 {
        return Ok("0 seconds".to_string());
    }

    let days = duration.num_days();
    let hours = duration.num_hours() % 24;
    let minutes = duration.num_minutes() % 60;

    let mut duration_strings = Vec::new();

    if days > 0 {
        duration_strings.push(format!("{} {}", days, pluralize("day", days)));
    }
    if hours > 0 || !duration_strings.is_empty() {
        duration_strings.push(format!("{} {}", hours, pluralize("hour", hours)));
    }
    if minutes > 0 || !duration_strings.is_empty() {
        duration_strings.push(format!("{} {}", minutes, pluralize("minute", minutes)));
    }

    Ok(duration_strings.join(" and "))
}

fn string_builder(event_name: &str, event_time: i64) -> Result<String, &'static str> {
    let event_time = Utc
        .timestamp_opt(event_time, 0)
        .single()
        .ok_or("Invalid timestamp")?;
    let time_left = event_time - Utc::now();

    let time_left_string = format_duration(time_left)?;
    Ok(format!(
        "\x02{}\x02 begins in {}.",
        event_name, time_left_string
    ))
}
