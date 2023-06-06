use std::{env, error::Error};

use sqlx::SqlitePool;

use crate::models::{
    CurrentConstructorStandings, CurrentDriverStandings, EventTracker, F1APIDriverStanding, SPFeed,
    SessionInfo, SessionResults,
};

const F1_API_ENDPOINT: &str = "https://api.formula1.com/v1/event-tracker";
const F1_SESSION_ENDPOINT: &str = "https://livetiming.formula1.com/static";
const ERGAST_API_ENDPOINT: &str = "https://ergast.com/api/f1";

// Fetch the next closest event from the F1 API
pub async fn fetch_next_event() -> Result<Option<String>, Box<dyn Error + Sync + Send>> {
    let client = reqwest::Client::new();
    let body = client
        .get(F1_API_ENDPOINT)
        .headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "apiKey",
                env::var("F1_API_KEY")
                    .expect("F1_API_KEY environment variable not set")
                    .parse()?,
            );
            headers.insert("locale", reqwest::header::HeaderValue::from_static("en"));

            headers
        })
        .send()
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    // Strip BOM from UTF-8-SIG
    let data: EventTracker = serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();

    let closest_event = data
        .season_context
        .timetables
        .into_iter()
        .filter(|event| event.state == "upcoming")
        .min_by(|a, b| {
            let start_time_string = format!("{} {}", a.start_time, a.gmt_offset);
            let start_time =
                chrono::DateTime::parse_from_str(&start_time_string, "%Y-%m-%dT%H:%M:%S %z")
                    .unwrap();

            start_time.cmp(
                &chrono::DateTime::parse_from_str(
                    &format!("{} {}", b.start_time, b.gmt_offset),
                    "%Y-%m-%dT%H:%M:%S %z",
                )
                .unwrap(),
            )
        });

    match closest_event {
        Some(event) => {
            let closest_event_start_time = chrono::DateTime::parse_from_str(
                &format!("{} {}", event.start_time, event.gmt_offset),
                "%Y-%m-%dT%H:%M:%S %z",
            );

            // Check if start time is within 5 minutes
            if closest_event_start_time
                .unwrap()
                .signed_duration_since(chrono::Utc::now())
                .num_minutes()
                <= 5
            {
                Ok(Some(format!(
                    "🏎️ \x02{}: {}\x02 begins in 5 minutes.",
                    data.race.meeting_official_name, event.description
                )))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

// Fetch results for a given path from the F1 API
pub async fn fetch_results(
    pool: &SqlitePool,
    path: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let result = sqlx::query!("SELECT data FROM results WHERE path = ?", path)
        .fetch_optional(pool)
        .await?;

    let session_result: SessionResults;

    match result {
        Some(previous_result) => {
            session_result = serde_json::from_str(&previous_result.data).unwrap();
        }
        None => {
            let url = format!("{}/{}SPFeed.json", F1_SESSION_ENDPOINT, path);
            let body = reqwest::get(&url)
                .await?
                .text_with_charset("utf-8-sig")
                .await?;

            // Strip BOM from UTF-8-SIG
            let session: SPFeed =
                serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();

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

                    F1APIDriverStanding {
                        position: position.parse::<i8>().unwrap(),
                        driver_name,
                        team_name,
                        time,
                        difference,
                    }
                })
                .collect::<Vec<F1APIDriverStanding>>();

            standings.sort_by(|a, b| a.position.cmp(&b.position));

            let session_title = format!("{}: {}", session.free.data.r, session.free.data.s);
            session_result = SessionResults {
                title: session_title,
                standings,
            };

            let json_result = serde_json::to_string(&session_result)?;
            sqlx::query!(
                "INSERT INTO results (path, data, event_id) VALUES (?, ?, (SELECT id FROM events WHERE start_time < unixepoch() ORDER BY start_time DESC LIMIT 1))",
                path,
                json_result
            )
            .execute(pool)
            .await?;
        }
    }

    let mut output = format!("🏎️ \x02{} Results\x02:", session_result.title,);

    // Consider only the first 10 drivers to avoid spamming
    for standing in session_result.standings.iter().take(10) {
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

async fn fetch_wdc_standings(
    pool: &SqlitePool,
) -> Result<CurrentDriverStandings, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let body = client
        .get(format!(
            "{}/current/driverStandings.json",
            ERGAST_API_ENDPOINT
        ))
        .send()
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    let standings: CurrentDriverStandings =
        serde_json::from_str(body.trim_start_matches('\u{feff}'))?;

    let json_standings = serde_json::to_string(&standings)?;

    sqlx::query!(
        "INSERT INTO drivers_standings (data) VALUES (?)",
        json_standings
    )
    .execute(pool)
    .await?;

    Ok(standings)
}

// Get current WDC standings
pub async fn return_wdc_standings(pool: &SqlitePool) -> Result<String, Box<dyn std::error::Error>> {
    let row = sqlx::query!("SELECT data FROM drivers_standings ORDER BY id DESC LIMIT 1")
        .fetch_optional(pool)
        .await?;

    let standings: CurrentDriverStandings = match row {
        Some(row) => serde_json::from_str(&row.data).unwrap(),
        None => fetch_wdc_standings(pool).await?,
    };

    let mut output = format!(
        "🏆 \x02 FORMULA 1 {} WDC Standings\x02:",
        standings.mrdata.standings_table.season
    );

    standings
        .mrdata
        .standings_table
        .standings_lists
        .first()
        .unwrap()
        .driver_standings
        .iter()
        .take(10)
        .for_each(|standing| {
            output.push_str(&format!(
                " {}. {} - \x0303[{}]\x03",
                standing.position, standing.driver.code, standing.points
            ));
        });

    Ok(output)
}

async fn fetch_wcc_standings(
    pool: &SqlitePool,
) -> Result<CurrentConstructorStandings, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let body = client
        .get(format!(
            "{}/current/constructorStandings.json",
            ERGAST_API_ENDPOINT
        ))
        .send()
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    let standings: CurrentConstructorStandings =
        serde_json::from_str(body.trim_start_matches('\u{feff}'))?;

    let json_standings = serde_json::to_string(&standings)?;

    sqlx::query!(
        "INSERT INTO constructors_standings (data) VALUES (?)",
        json_standings
    )
    .execute(pool)
    .await?;

    Ok(standings)
}

// Get the current WCC standings
pub async fn return_wcc_standings(pool: &SqlitePool) -> Result<String, Box<dyn std::error::Error>> {
    let row = sqlx::query!("SELECT data FROM constructors_standings ORDER BY id DESC LIMIT 1")
        .fetch_optional(pool)
        .await?;

    let standings: CurrentConstructorStandings = match row {
        Some(row) => serde_json::from_str(&row.data).unwrap(),
        None => fetch_wcc_standings(pool).await?,
    };

    let mut output = format!(
        "🔧 \x02 FORMULA 1 {} WCC Standings\x02:",
        standings.mrdata.standings_table.season
    );

    standings
        .mrdata
        .standings_table
        .standings_lists
        .first()
        .unwrap()
        .constructor_standings
        .iter()
        .take(10)
        .for_each(|standing| {
            output.push_str(&format!(
                " {}. {} - \x0303[{}]\x03",
                standing.position, standing.constructor.name, standing.points
            ));
        });

    Ok(output)
}
