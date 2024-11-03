use chrono::{DateTime, Duration, FixedOffset, TimeZone, Utc};

use irc::client::Sender;
use log::{info, trace};
use sqlx::SqlitePool;
use std::str::FromStr;

use crate::{
    database::{self, EventType},
    fetch,
};

#[derive(Debug)]
struct TimezoneArg {
    offset: FixedOffset,
}

impl TimezoneArg {
    fn parse(arg: &str) -> Option<Self> {
        // Early return for invalid prefixes
        if !arg.starts_with("utc") && !arg.starts_with("gmt") {
            return None;
        }

        // Handle UTC/GMT+0 case
        let offset_str = &arg[3..];
        if offset_str.is_empty() {
            return Some(TimezoneArg {
                offset: FixedOffset::east_opt(0).unwrap(),
            });
        }

        // Parse sign and offset
        let (sign, offset_str) = match offset_str.chars().next()? {
            '+' => (1, &offset_str[1..]),
            '-' => (-1, &offset_str[1..]),
            _ => return None,
        };

        // Parse hours and optional minutes
        let parts: Vec<&str> = offset_str.split(':').collect();
        let seconds = match parts.as_slice() {
            [hours] => i32::from_str(hours).ok()? * 3600,
            [hours, minutes] => {
                let h = i32::from_str(hours).ok()?;
                let m = i32::from_str(minutes).ok()?;
                h * 3600 + m * 60
            }
            _ => return None,
        } * sign;

        FixedOffset::east_opt(seconds).map(|offset| TimezoneArg { offset })
    }
}

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

    async fn handle_next(&self, timezone: Option<&&str>) -> Result<(), Box<dyn std::error::Error>> {
        let (meeting_name, event_type, start_time) =
            match database::next_event_filtered(self.pool, None).await? {
                Some(event) => event,
                None => {
                    self.sender
                        .send_privmsg(self.target, "No upcoming events found.")?;
                    return Ok(());
                }
            };

        let timezone = timezone.copied().and_then(TimezoneArg::parse);

        self.sender.send_privmsg(
            self.target,
            string_builder(
                format!("{}: {}", meeting_name, event_type.to_str()).as_str(),
                start_time,
                timezone.as_ref(),
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
        timezone: Option<&&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let event_type = event_type.map(|&s| EventType::from_str(s)).flatten();
        info!("timezone_arg={:?}", timezone);
        let timezone = timezone.copied().and_then(TimezoneArg::parse);
        info!("timezone_parsed={:?}", timezone);

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
                timezone.as_ref(),
            )?,
        )?;

        Ok(())
    }
}

fn string_builder(
    event_name: &str,
    event_time: i64,
    timezone: Option<&TimezoneArg>,
) -> Result<String, &'static str> {
    let utc_time = Utc
        .timestamp_opt(event_time, 0)
        .single()
        .ok_or("Invalid timestamp")?;

    if let Some(tz) = timezone {
        let local_time: DateTime<FixedOffset> = utc_time.with_timezone(&tz.offset);
        let tz_str = if tz.offset.local_minus_utc() >= 0 {
            format!(
                "+{:02}:{:02}",
                tz.offset.local_minus_utc() / 3600,
                (tz.offset.local_minus_utc() % 3600) / 60
            )
        } else {
            format!(
                "-{:02}:{:02}",
                (tz.offset.local_minus_utc() / 3600).abs(),
                ((tz.offset.local_minus_utc() % 3600) / 60).abs()
            )
        };

        Ok(format!(
            "\x02{}\x02 starts at {} UTC{}",
            event_name,
            local_time.format("%H:%M"),
            tz_str
        ))
    } else {
        let time_left = utc_time - Utc::now();
        let time_left_string = format_duration(time_left)?;
        Ok(format!(
            "\x02{}\x02 begins in {}",
            event_name, time_left_string
        ))
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
            "n" | "next" => {
                let timezone = commands.next();
                handler.handle_next(timezone).await?
            }
            "w" | "when" => {
                let event_type = commands.next();
                let timezone = commands.next();
                handler.handle_when(event_type, timezone).await?
            }
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
