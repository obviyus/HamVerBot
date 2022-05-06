use crate::models::{DriverStanding, Root, SPFeed, SessionInfo, Timetable};
use log::{error, info};
use std::env;

const F1_API_ENDPOINT: &str = "https://api.formula1.com/v1/event-tracker";
const F1_SESSION_ENDPOINT: &str = "https://livetiming.formula1.com/static";

// Fetch driver standings of the given Path
pub async fn driver_standings(path: &str) -> Result<String, reqwest::Error> {
    let body = reqwest::get(format!("{}/{}SPFeed.json", F1_SESSION_ENDPOINT, &path))
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    // Strip BOM from UTF-8-SIG
    let session: SPFeed = serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();
    let mut standings = session
        .free
        .data
        .dr
        .iter()
        .map(|dr| {
            let driver_name = dr.f.0.to_string();
            let team_name = dr.f.2.to_string();
            let time = dr.f.1.to_string();
            let difference = dr.f.4.to_string();
            let position = dr.f.3.to_string();

            DriverStanding {
                position: position.parse::<i8>().unwrap(),
                driver_name,
                team_name,
                time,
                difference,
            }
        })
        .collect::<Vec<DriverStanding>>();

    standings.sort_by(|a, b| a.position.cmp(&b.position));

    info!(
        "Fetched results for {}: {}",
        session.free.data.r, session.free.data.s
    );

    let mut output = format!(
        "🏎️ \x02{}: {} Results\x02:",
        session.free.data.r, session.free.data.s
    );

    // Consider only the first 10 drivers to avoid spamming
    for standing in standings.iter().take(10) {
        output.push_str(&format!(
            " {}. {} - \x0303[{}]\x03",
            standing.position, standing.driver_name, standing.time
        ));
    }

    Ok(output)
}

// Fetch the path of the current event from the F1 API
pub async fn read_current_event() -> Result<(String, bool), reqwest::Error> {
    let body = reqwest::get(format!("{}/{}", F1_SESSION_ENDPOINT, "SessionInfo.json"))
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    // Strip BOM from UTF-8-SIG
    let session: SessionInfo = serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();

    Ok((session.path, session.archive_status.status == "Complete"))
}

// Fetch a list of events from the F1 API and store them in the database
pub async fn fetch_events() -> Result<Option<Vec<(String, String, i64)>>, Box<dyn std::error::Error>>
{
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

    if !upcoming_sessions.is_empty() {
        let mut events: Vec<(String, String, i64)> = Vec::with_capacity(5);

        upcoming_sessions.iter().for_each(|timetable| {
            return match chrono::DateTime::parse_from_str(
                &format!("{} {}", timetable.start_time, timetable.gmt_offset),
                "%Y-%m-%dT%H:%M:%S %:z",
            ) {
                Ok(start_time) => events.push((
                    session.race.meeting_official_name.clone(),
                    timetable.description.clone(),
                    start_time.naive_utc().timestamp(),
                )),
                Err(e) => {
                    error!("Error parsing start_time: {}", e);
                }
            };
        });

        Ok(Some(events))
    } else {
        Ok(None)
    }
}
