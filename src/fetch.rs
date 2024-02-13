use anyhow::Result;
use chrono::{Datelike, TimeZone, Utc};
use std::{collections::HashMap, env};

use log::debug;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::{
    database::{EventType, next_event_filtered},
    models::{
        CalendarEvents, CurrentConstructorStandings, CurrentDriverStandings, DriverList,
        EventTracker, F1APIDriverStanding, SessionInfo, SessionResults,
    },
};

const F1_API_ENDPOINT: &str = "https://api.formula1.com/v1/event-tracker";
const F1_SESSION_ENDPOINT: &str = "https://livetiming.formula1.com/static";
const ERGAST_API_ENDPOINT: &str = "https://ergast.com/api/f1";

pub async fn fetch_json<T: serde::de::DeserializeOwned>(
    url: &str,
    headers: Option<reqwest::header::HeaderMap>,
) -> Result<T> {
    let client = reqwest::Client::new();
    let mut request = client.get(url);

    if let Some(headers) = headers {
        request = request.headers(headers);
    }

    let body = request.send().await?.text_with_charset("utf-8-sig").await?;
    let data: T = serde_json::from_str(body.trim_start_matches('\u{feff}'))?;

    Ok(data)
}

fn parse_datetime(
    date: &str,
    offset: &str,
) -> Result<chrono::DateTime<chrono::Utc>, chrono::ParseError> {
    let datetime_string = format!("{} {}", date, offset);
    chrono::DateTime::parse_from_str(&datetime_string, "%Y-%m-%dT%H:%M:%S %z")
        .map(|dt| dt.with_timezone(&chrono::Utc)) // Convert to Utc for universal comparison
}

// Fetch the next closest event from the F1 API
pub async fn fetch_next_event(pool: &SqlitePool) -> Result<Option<String>> {
    let data = fetch_json::<EventTracker>(
        F1_API_ENDPOINT,
        Some({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "apiKey",
                env::var("F1_API_KEY")
                    .expect("F1_API_KEY environment variable not set")
                    .parse()?,
            );
            headers.insert("locale", reqwest::header::HeaderValue::from_static("en"));

            headers
        }),
    )
    .await?;

    let closest_event = data
        .season_context
        .timetables
        .into_iter()
        .filter(|event| event.state == "upcoming")
        .min_by(|a, b| {
            let start_time_a = match parse_datetime(&a.start_time, &a.gmt_offset) {
                Ok(time) => time,
                Err(e) => {
                    eprintln!("Failed to parse start time for event a: {}", e);
                    return std::cmp::Ordering::Equal;
                }
            };
            let start_time_b = match parse_datetime(&b.start_time, &b.gmt_offset) {
                Ok(time) => time,
                Err(e) => {
                    eprintln!("Failed to parse start time for event b: {}", e);
                    return std::cmp::Ordering::Equal;
                }
            };
            start_time_a.cmp(&start_time_b)
        });

    match closest_event {
        Some(event) => {
            let closest_event_start_time =
                match parse_datetime(&event.start_time, &event.gmt_offset) {
                    Ok(time) => time,
                    Err(e) => {
                        eprintln!("Failed to parse start time for event: {}", e);
                        return Ok(None);
                    }
                };

            if closest_event_start_time
                .signed_duration_since(chrono::Utc::now())
                .num_minutes()
                <= 5
            {
                Ok(Some(format!(
                    "🏎️ \x02{}: {}\x02 begins in 5 minutes.",
                    data.race.meeting_official_name, event.description
                )))
            } else {
                match next_event_filtered(pool, None).await {
                    Ok(event) => match event {
                        Some((meeting_name, event_name, start_time)) => {
                            let event_time = Utc
                                .timestamp_opt(start_time, 0)
                                .single()
                                .ok_or("Invalid timestamp")
                                .unwrap();

                            if event_time
                                .signed_duration_since(chrono::Utc::now())
                                .num_minutes()
                                <= 5
                            {
                                Ok(Some(format!(
                                    "🏎️ \x02{}: {}\x02 begins in 5 minutes.",
                                    meeting_name,
                                    event_name.to_str()
                                )))
                            } else {
                                Ok(None)
                            }
                        }
                        None => Ok(None),
                    },
                    Err(_) => Ok(None),
                }
            }
        }
        None => match next_event_filtered(pool, None).await {
            Ok(event) => match event {
                Some((meeting_name, event_name, start_time)) => {
                    let event_time = Utc
                        .timestamp_opt(start_time, 0)
                        .single()
                        .ok_or("Invalid timestamp")
                        .unwrap();

                    if event_time
                        .signed_duration_since(chrono::Utc::now())
                        .num_minutes()
                        <= 5
                    {
                        Ok(Some(format!(
                            "🏎️ \x02{}: {}\x02 begins in 5 minutes.",
                            meeting_name,
                            event_name.to_str()
                        )))
                    } else {
                        Ok(None)
                    }
                }
                None => Ok(None),
            },
            Err(_) => Ok(None),
        },
    }
}

pub async fn fetch_driver_list(path: &str, pool: &SqlitePool) -> Result<()> {
    let response: HashMap<String, Value> = fetch_json(
        format!("{}/{}DriverList.json", F1_SESSION_ENDPOINT, path).as_str(),
        None,
    )
    .await
    .unwrap();

    for driver_value in response.values() {
        let driver: DriverList = serde_json::from_value(driver_value.clone())?;
        sqlx::query!("INSERT INTO driver_list (racing_number, reference, first_name, last_name, full_name, broadcast_name, tla, country_code, team_name, team_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (racing_number) DO UPDATE SET reference = ?, first_name = ?, last_name = ?, full_name = ?, broadcast_name = ?, tla = ?, country_code = ?, team_name = ?, team_color = ?",
            driver.racing_number,
            driver.reference,
            driver.first_name,
            driver.last_name,
            driver.full_name,
            driver.broadcast_name,
            driver.tla,
            driver.country_code,
            driver.team_name,
            driver.team_color,
            driver.reference,
            driver.first_name,
            driver.last_name,
            driver.full_name,
            driver.broadcast_name,
            driver.tla,
            driver.country_code,
            driver.team_name,
            driver.team_color,
        ).execute(pool).await?;
    }

    Ok(())
}

async fn extract_position_and_number(
    data: HashMap<String, Value>,
    pool: &SqlitePool,
) -> Result<Vec<F1APIDriverStanding>> {
    #[derive(Debug)]
    struct DriverData {
        position: String,
        racing_number: String,
        last_lap_time: String,
        interval_to_position_ahead: String,
    }

    if let Some(Value::Object(lines)) = data.get("Lines") {
        let mut extracted_data: Vec<DriverData> = Vec::new();

        for (_, driver_data) in lines.iter() {
            if let (
                Some(position),
                Some(racing_number),
                Some(last_lap_time),
                Some(interval_to_position_ahead),
            ) = (
                driver_data.get("Position").and_then(|v| v.as_str()),
                driver_data.get("RacingNumber").and_then(|v| v.as_str()),
                driver_data
                    .get("LastLapTime")
                    .and_then(|v| v.get("Value"))
                    .and_then(|v| v.as_str()),
                driver_data
                    .get("IntervalToPositionAhead")
                    .and_then(|v| v.get("Value"))
                    .and_then(|v| v.as_str()),
            ) {
                let current_driver_data = DriverData {
                    position: position.to_string(),
                    racing_number: racing_number.to_string(),
                    last_lap_time: last_lap_time.to_string(),
                    interval_to_position_ahead: interval_to_position_ahead.to_string(),
                };

                extracted_data.push(current_driver_data);
            } else {
                println!("Missing or invalid data for a driver: {:?}", driver_data);
            }
        }

        // Get driver TLA from driver list by racing number
        let driver_list = sqlx::query!("SELECT tla, racing_number, team_name FROM driver_list")
            .fetch_all(pool)
            .await?;

        debug!("Driver list: {:?}", driver_list);
        debug!("Extracted data: {:?}", extracted_data);

        let data_with_tla = extracted_data
            .iter()
            .map(|data| {
                let driver = driver_list
                    .iter()
                    .find(|driver| {
                        driver.racing_number
                            == i64::from_str_radix(&data.racing_number, 10).unwrap()
                    })
                    .unwrap();

                F1APIDriverStanding {
                    position: i8::from_str_radix(&data.position, 10).unwrap(),
                    driver_name: driver.tla.clone(),
                    team_name: driver.team_name.clone(),
                    time: data.last_lap_time.clone(),
                    difference: data.interval_to_position_ahead.clone(),
                }
            })
            .collect::<Vec<F1APIDriverStanding>>();

        Ok(data_with_tla)
    } else {
        Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Invalid data",
        ))
        .into())
    }
}

// Fetch results for a given path from the F1 API
pub async fn fetch_results(pool: &SqlitePool, path: &str) -> Result<String> {
    let result = sqlx::query!("SELECT data FROM results WHERE path = ?", path)
        .fetch_optional(pool)
        .await?;

    let session_result: SessionResults;

    match result {
        Some(previous_result) => {
            session_result = serde_json::from_str(&previous_result.data).unwrap();
        }
        None => {
            debug!("Fetching TimingDataF1 for {}", path);
            let session = fetch_json::<HashMap<String, Value>>(
                format!("{}/{}TimingDataF1.json", F1_SESSION_ENDPOINT, path).as_str(),
                None,
            )
            .await
            .unwrap();

            debug!("Fetching SessionInfo for {}", path);
            let session_info = fetch_json::<SessionInfo>(
                format!("{}/{}", F1_SESSION_ENDPOINT, "SessionInfo.json").as_str(),
                None,
            )
            .await
            .unwrap();

            let standings = extract_position_and_number(session, pool).await?;

            session_result = SessionResults {
                title: session_info.meeting.official_name,
                standings,
            };

            let json_result = serde_json::to_string(&session_result)?;
            sqlx::query!(
                "INSERT INTO results (path, data, event_id) VALUES (?, ?, (SELECT id FROM events WHERE start_time < unixepoch() AND event_type_id != 1 ORDER BY start_time DESC LIMIT 1))",
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
pub async fn read_current_event() -> Result<(String, bool)> {
    let session = fetch_json::<SessionInfo>(
        format!("{}/{}", F1_SESSION_ENDPOINT, "SessionInfo.json").as_str(),
        None,
    )
    .await
    .unwrap();

    Ok((session.path, session.archive_status.status == "Complete"))
}

pub async fn fetch_wdc_standings(pool: &SqlitePool) -> Result<CurrentDriverStandings> {
    let standings = fetch_json::<CurrentDriverStandings>(
        format!("{}/current/driverStandings.json", ERGAST_API_ENDPOINT).as_str(),
        None,
    )
    .await
    .unwrap();

    let json_standings = serde_json::to_string(&standings)?;

    sqlx::query!(
        "INSERT INTO championship_standings (data, type) VALUES (?, 0) ON CONFLICT (type) DO UPDATE SET data = ?, create_time = CURRENT_TIMESTAMP",
        json_standings,
        json_standings
    )
    .execute(pool)
    .await?;

    Ok(standings)
}

// Get current WDC standings
pub async fn return_wdc_standings(pool: &SqlitePool) -> Result<String> {
    let row = sqlx::query!("SELECT data FROM championship_standings WHERE type = 0 LIMIT 1",)
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

pub async fn fetch_wcc_standings(pool: &SqlitePool) -> Result<CurrentConstructorStandings> {
    let standings = fetch_json::<CurrentConstructorStandings>(
        format!("{}/current/constructorStandings.json", ERGAST_API_ENDPOINT).as_str(),
        None,
    )
    .await
    .unwrap();

    let json_standings = serde_json::to_string(&standings)?;

    sqlx::query!(
        "INSERT INTO championship_standings (data, type) VALUES (?, 1) ON CONFLICT (type) DO UPDATE SET data = ?, create_time = CURRENT_TIMESTAMP",
        json_standings,
        json_standings,
    )
    .execute(pool)
    .await?;

    Ok(standings)
}

// Get the current WCC standings
pub async fn return_wcc_standings(pool: &SqlitePool) -> Result<String> {
    let row = sqlx::query!("SELECT data FROM championship_standings WHERE type = 1 LIMIT 1")
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

// Fetch the current community F1 calendar
pub async fn refresh_current_calendar(pool: &SqlitePool, year: Option<i32>) -> Result<()> {
    let event_year = match year {
        Some(year) => year,
        None => Utc::now().year(),
    };

    let calendar_events = fetch_json::<CalendarEvents>(
        format!(
            "https://raw.githubusercontent.com/sportstimes/f1/main/_db/f1/{}.json",
            event_year
        )
        .as_str(),
        None,
    )
    .await
    .unwrap();

    for race in calendar_events.races {
        for (key, value) in race.sessions.iter() {
            if let Some(event_type) = EventType::from_str(key) {
                let event_start_time = chrono::DateTime::parse_from_str(
                    format!("{} +00:00", &value).as_str(),
                    "%Y-%m-%dT%H:%M:%SZ %z",
                );
                match event_start_time {
                    Ok(event_start_time) => {
                        let meeting_name = format!(
                            "{} FORMULA 1 {} GRAND PRIX {}",
                            event_type.to_emoji(),
                            race.name.to_uppercase(),
                            event_year
                        );

                        let slug = format!("{}-{}-{}", event_year, race.slug, key);
                        let event_type_id = event_type as i64;
                        let start_timestamp = event_start_time.timestamp();

                        sqlx::query!(
                            "INSERT INTO events (meeting_name, event_type_id, start_time, event_slug) VALUES (?, ?, ?, ?) ON CONFLICT (event_slug) DO UPDATE SET start_time = ?;",
                            meeting_name, 
                            event_type_id, 
                            start_timestamp, 
                            slug, 
                            start_timestamp
                        ).execute(pool).await?;
                    }
                    Err(error) => {
                        eprintln!("{}", error)
                    }
                }
            }
        }
    }

    Ok(())
}
