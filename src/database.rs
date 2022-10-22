use r2d2::Pool;
extern crate r2d2;
extern crate r2d2_sqlite;
use log::info;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Error};

const EVENTS: &str = "CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    meeting_name TEXT NOT NULL,
    description TEXT NOT NULL,
    start_time INTEGER NOT NULL
 )";

const RESULTS: &str = "CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    end_time INTEGER NOT NULL
 )";

// Event describes a meeting that is scheduled for a certain time. It is
// a representation of a row in the `events` table.
pub struct Event {
    pub(crate) _id: i32,
    pub(crate) meeting_name: String,
    pub(crate) description: String,
    pub(crate) start_time: i64,
}

// EventResult describes a meeting that has been completed, with a path
// to access the standings. It is a representation of a row in the `results`
// table.
pub struct EventResult {
    _id: i32,
    _path: String,
    _end_time: i64,
}

pub async fn new(database_name: String) -> Result<Pool<SqliteConnectionManager>, Error> {
    let manager = SqliteConnectionManager::file(database_name);
    let pool = r2d2::Pool::new(manager).unwrap();

    pool.get().unwrap().execute(EVENTS, params![])?;
    pool.get().unwrap().execute(RESULTS, params![])?;

    info!("Database initialized");

    Ok(pool)
}

// Get the next event from the database. Can potentially have no events recorded.
pub async fn next_event(
    pool: Pool<SqliteConnectionManager>,
) -> Result<Option<(String, String, i64)>, Error> {
    let conn = pool.get().unwrap();
    let mut stmt =
        conn.prepare("SELECT * FROM events WHERE start_time > ?1 ORDER BY start_time ASC LIMIT 1")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let mut rows = stmt.query_map(params![now], |row| {
        Ok(Event {
            _id: row.get(0)?,
            meeting_name: row.get(1)?,
            description: row.get(2)?,
            start_time: row.get(3)?,
        })
    })?;

    if let Some(event) = rows.next() {
        let event = event?;
        info!(
            "Next event: {} {} at {}",
            event.meeting_name, event.description, event.start_time
        );
        Ok(Some((
            event.meeting_name,
            event.description,
            event.start_time,
        )))
    } else {
        Ok(None)
    }
}

// Given a path, checks if the message has been delivered.
pub async fn is_event_delivered(
    pool: Pool<SqliteConnectionManager>,
    path: &str,
) -> Result<bool, Error> {
    let conn = pool.get().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM results WHERE path = ?1")?;

    let mut rows = stmt.query_map(params![path], |row| {
        Ok(EventResult {
            _id: row.get(0)?,
            _path: row.get(1)?,
            _end_time: row.get(2)?,
        })
    })?;

    Ok(rows.next().is_some())
}

// Given an Event with a meeting_name and a vector of Timetables, insert each timetable
// for the given meeting_name into the database.
pub fn insert_event(pool: Pool<SqliteConnectionManager>, event: Event) -> Result<(), Error> {
    let conn = pool.get().unwrap();
    let mut stmt = conn.prepare(
        "INSERT INTO events (meeting_name, description, start_time) VALUES (?1, ?2, ?3)",
    )?;

    stmt.execute(params![
        event.meeting_name,
        event.description,
        event.start_time
    ])?;

    Ok(())
}

// Given an EventResult with a path and an end_time, insert the result into the database.
pub fn insert_result(pool: Pool<SqliteConnectionManager>, path: &str) -> Result<(), Error> {
    let conn = pool.get().unwrap();
    let mut stmt = conn.prepare("INSERT INTO results (path, end_time) VALUES (?1, ?2)")?;

    // FIXME: Add migration to drop end_time column
    stmt.execute(params![path, 0])?;

    Ok(())
}
