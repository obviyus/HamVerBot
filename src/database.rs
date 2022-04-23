use chrono::DateTime;
use log::error;
use rusqlite::{params, Connection, Error};

use crate::models::Timetable;

#[derive(Debug)]
struct Event {
    id: i32,
    meeting_name: String,
    description: String,
    start_time: i64,
}

#[derive(Debug)]
struct EventResult {
    id: i32,
    path: String,
    end_time: i64,
}

pub fn init_db() -> Result<(), Error> {
    let conn = Connection::open("hamverbot.db")?;

    match conn.execute(
        "CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY,
            meeting_name TEXT NOT NULL,
            description TEXT NOT NULL,
            start_time INTEGER NOT NULL
         )",
        [],
    ) {
        Ok(_) => {}
        Err(e) => return Err(e),
    };

    match conn.execute(
        "CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            end_time INTEGER NOT NULL
         )",
        [],
    ) {
        Ok(_) => {}
        Err(e) => return Err(e),
    };

    Ok(())
}

pub fn insert_events(meeting_name: &str, timetable: Vec<&Timetable>) {
    let conn = Connection::open("hamverbot.db").unwrap();

    timetable
        .iter()
        .map(|event| {
            let start_time = match chrono::DateTime::parse_from_str(
                &format!("{} {}", &event.start_time, &event.gmt_offset),
                "%Y-%m-%dT%H:%M:%S %:z",
            ) {
                Ok(start_time) => start_time.naive_utc(),
                Err(e) => {
                    error!("Failed to parse start_time: {}", e);
                    return;
                }
            };

            match conn.execute(
                "INSERT INTO events (meeting_name, description, start_time) VALUES (?1, ?2, ?3)",
                params![meeting_name, event.description, start_time.timestamp()],
            ) {
                Ok(_) => {}
                Err(e) => {
                    error!("Failed to insert event: {}", e);
                }
            };
        })
        .last();
}

pub fn next_event() -> Option<(String, String, chrono::DateTime<chrono::Utc>)> {
    let conn = Connection::open("hamverbot.db").unwrap();

    let timestamp_now = chrono::Utc::now().timestamp();

    let mut stmt =
        match conn.prepare("SELECT *, MIN(start_time - ?1) FROM events WHERE start_time > ?2") {
            Ok(stmt) => stmt,
            Err(e) => {
                error!("Error preparing statement: {}", e);
                return None;
            }
        };

    let mut event_iter = stmt
        .query_map(params![timestamp_now, timestamp_now], |row| {
            Ok(Event {
                id: row.get(0)?,
                meeting_name: row.get(1)?,
                description: row.get(2)?,
                start_time: row.get(3)?,
            })
        })
        .unwrap();

    return if let Some(event) = event_iter.next() {
        match event {
            Ok(event) => Some((
                format!(
                    "🏎️ \x02{}\x02: {} begins in 5 minutes.",
                    event.meeting_name, event.description
                ),
                format!("{}: {}", event.meeting_name, event.description),
                DateTime::from_utc(
                    chrono::NaiveDateTime::from_timestamp(event.start_time, 0),
                    chrono::Utc,
                ),
            )),
            Err(e) => {
                error!("Failed to get next event: {}", e);
                return None;
            }
        }
    } else {
        None
    };
}

pub fn insert_result(
    path: &str,
    end_time: chrono::DateTime<chrono::Utc>,
) -> Result<(), reqwest::Error> {
    let conn = Connection::open("hamverbot.db").unwrap();

    return match conn.execute(
        "INSERT INTO results (path, end_time) VALUES (?1, ?2)",
        params![path, end_time.timestamp()],
    ) {
        Ok(_) => Ok(()),
        Err(e) => {
            error!("Failed saving result to DB: {}", e);
            Ok(())
        }
    };
}

pub fn is_result_sent(path: &str) -> bool {
    let conn = Connection::open("hamverbot.db").unwrap();

    conn.query_row(
        "SELECT COUNT(id) FROM results WHERE path = ?1",
        &[path],
        |r| r.get(0),
    )
    .unwrap_or(0)
        > 0
}
