use std::{result, str::FromStr};

use chrono::DateTime;
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY,
            meeting_name TEXT NOT NULL,
            description TEXT NOT NULL,
            start_time INTEGER NOT NULL
         )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            end_time INTEGER NOT NULL
         )",
        [],
    )?;

    Ok(())
}

pub fn insert_events(meeting_name: &str, timetable: Vec<&Timetable>) -> Result<(), ()> {
    let conn = Connection::open("hamverbot.db").unwrap();

    timetable
        .iter()
        .map(|event| {
            let start_time = chrono::DateTime::parse_from_str(
                &format!("{} {}", &event.start_time, &event.gmt_offset),
                "%Y-%m-%dT%H:%M:%S %:z",
            )
                .unwrap();

            conn.execute(
                "INSERT INTO events (meeting_name, description, start_time) VALUES (?1, ?2, ?3)",
                params![meeting_name, event.description, start_time.timestamp()],
            )
        })
        .last();

    Ok(())
}

pub fn next_event() -> Result<Option<(String, String, chrono::DateTime<chrono::Utc>)>, Error> {
    let conn = Connection::open("hamverbot.db").unwrap();

    let timestamp_now = chrono::Utc::now().timestamp();
    let mut stmt =
        conn.prepare("SELECT *, MIN(start_time - ?1) FROM events WHERE start_time > ?2")?;
    let mut event_iter = stmt.query_map(
        params![timestamp_now, timestamp_now], |row| {
            Ok(Event {
                id: row.get(0)?,
                meeting_name: row.get(1)?,
                description: row.get(2)?,
                start_time: row.get(3)?,
            })
        })?;

    if let Some(event) = event_iter.next() {
        return match event {
            Ok(event) => {
                Ok(Some((
                    format!(
                        "🏎️ \x02{}\x02: {} begins in 5 minutes.",
                        event.meeting_name, event.description
                    ),
                    format!("{}: {}", event.meeting_name, event.description),
                    DateTime::from_utc(
                        chrono::NaiveDateTime::from_timestamp(event.start_time, 0),
                        chrono::Utc,
                    ),
                )))
            }
            Err(e) => {
                println!("ERROR: {:?}", e);
                Ok(None)
            }
        }
    }

    Ok(None)
}

pub fn insert_result(path: &str, end_time: chrono::DateTime<chrono::Utc>) -> Result<(), ()> {
    let conn = Connection::open("hamverbot.db").unwrap();
    println!("SAVING: {:?}", path);

    conn.execute(
        "INSERT INTO results (path, end_time) VALUES (?1, ?2)",
        params![path, end_time.timestamp()],
    )
        .unwrap();

    println!("SAVING: {:?}", path);

    Ok(())
}

pub fn is_result_sent(path: &str) -> Result<bool, Error> {
    println!("SEARCHING: {:?}", path);
    let conn = Connection::open("hamverbot.db").unwrap();

    let count: Option<i64> = conn
        .query_row(
            "SELECT COUNT(id) FROM results WHERE path = ?1",
            &[path],
            |r| r.get(0),
        )
        .expect("select failed");

    Ok(count.unwrap_or(0) > 0)
}
