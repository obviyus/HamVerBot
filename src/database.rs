use sqlx::SqlitePool;

use crate::fetch::fetch_results;

pub enum EventType {
    LiveryReveal = 1,
    FreePractice1 = 2,
    FreePractice2 = 3,
    FreePractice3 = 4,
    Qualifying = 5,
    Sprint = 6,
    Race = 7,
}

impl EventType {
    fn from_str(s: &str) -> Option<EventType> {
        match s {
            "Livery Reveal" => Some(EventType::LiveryReveal),
            "Practice 1" => Some(EventType::FreePractice1),
            "Practice 2" => Some(EventType::FreePractice2),
            "Practice 3" => Some(EventType::FreePractice3),
            "Qualifying" => Some(EventType::Qualifying),
            "Sprint" => Some(EventType::Sprint),
            "Race" => Some(EventType::Race),
            _ => None,
        }
    }

    pub fn to_str(&self) -> &str {
        match self {
            EventType::LiveryReveal => "Livery Reveal",
            EventType::FreePractice1 => "Practice 1",
            EventType::FreePractice2 => "Practice 2",
            EventType::FreePractice3 => "Practice 3",
            EventType::Qualifying => "Qualifying",
            EventType::Sprint => "Sprint",
            EventType::Race => "Race",
        }
    }

    fn from_i64(value: i64) -> EventType {
        match value {
            1 => EventType::LiveryReveal,
            2 => EventType::FreePractice1,
            3 => EventType::FreePractice2,
            4 => EventType::FreePractice3,
            5 => EventType::Qualifying,
            6 => EventType::Sprint,
            7 => EventType::Race,
            _ => panic!("Invalid event type"),
        }
    }
}

pub async fn is_event_delivered(
    pool: &SqlitePool,
    path: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let result = sqlx::query!("SELECT TRUE FROM results WHERE path = ?", path)
        .fetch_optional(pool)
        .await?;

    Ok(result.is_some())
}

pub async fn next_event_filtered(
    pool: &SqlitePool,
    event_type: Option<EventType>,
) -> Result<Option<(String, EventType, i64)>, Box<dyn std::error::Error>> {
    match event_type {
        Some(event_type) => {
            let event_type_id = event_type as i64;
            let result = sqlx::query!(
                "SELECT meeting_name, event_type_id, start_time
                FROM events
                WHERE start_time > unixepoch()
                AND event_type_id = ?
                ORDER BY start_time
                LIMIT 1;",
                event_type_id,
            )
            .fetch_optional(pool)
            .await?;

            match result {
                Some(data) => {
                    let meeting_name = data.meeting_name.unwrap();
                    let event_name = EventType::from_i64(data.event_type_id.unwrap());
                    let start_time = data.start_time.unwrap();

                    Ok(Some((meeting_name, event_name, start_time)))
                }
                None => Ok(None),
            }
        }
        None => {
            let result = sqlx::query!(
                "SELECT meeting_name, event_type_id, start_time
                FROM events
                WHERE start_time > unixepoch()
                ORDER BY start_time
                LIMIT 1;",
            )
            .fetch_optional(pool)
            .await?;

            match result {
                Some(data) => {
                    let meeting_name = data.meeting_name.unwrap();
                    let event_name = EventType::from_i64(data.event_type_id.unwrap());
                    let start_time = data.start_time.unwrap();

                    Ok(Some((meeting_name, event_name, start_time)))
                }
                None => Ok(None),
            }
        }
    }
}

// Get latest path in the past
pub async fn get_latest_path(
    pool: &SqlitePool,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let row = sqlx::query!("SELECT path FROM results ORDER BY id DESC LIMIT 1",)
        .fetch_optional(pool)
        .await?;

    match row {
        Some(path) => {
            let data = fetch_results(pool, &path.path).await?;
            Ok(Some(data))
        }
        None => Ok(None),
    }
}
