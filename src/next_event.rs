use std::env;

use crate::{
    database,
    models::{Root, Timetable},
};

const F1_API_ENDPOINT: &str = "https://api.formula1.com/v1/event-tracker";

pub async fn fetch_events() -> Result<Option<()>, reqwest::Error> {
    println!("FETCHING EVENTS");
    let client = reqwest::Client::new();

    let body = client
        .get(F1_API_ENDPOINT)
        .header("apiKey", env::var("F1_API_KEY").unwrap())
        .header("locale", "en")
        .send()
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    let session: Root = serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();
    let upcoming_sessions = session
        .season_context
        .timetables
        .iter()
        .filter(|&event| event.state == "upcoming")
        .collect::<Vec<&Timetable>>();

    println!("FOUND: {:?}", upcoming_sessions.len());

    if !upcoming_sessions.is_empty() {
        database::insert_events(&session.race.meeting_official_name, upcoming_sessions);
        Ok(Some(()))
    } else {
        Ok(None)
    }
}
