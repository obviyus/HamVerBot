use anyhow::Context;
use anyhow::Result;
use anyhow::anyhow;
use chrono::{Datelike, TimeZone, Utc};
use std::{collections::HashMap, env};

use log::{debug, info};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::{
    database::{next_event_filtered, EventType},
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

    let body = request.send().await?.text().await?;
    let data: T = serde_json::from_str(body.trim_start_matches('\u{feff}'))?;

    Ok(data)
}

fn parse_datetime(
    date: &str,
    offset: &str,
) -> Result<chrono::DateTime<chrono::Utc>, chrono::ParseError> {
    let datetime_string = format!("{} {}", date, offset);
    info!("Parsing datetime: {}", datetime_string);
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

    info!("Closest event: {:?}", closest_event);
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

            let time_to_event: i64 = closest_event_start_time
                .signed_duration_since(chrono::Utc::now())
                .num_minutes();
            info!("Time to event: {} minutes", time_to_event);

            if time_to_event > 0 && time_to_event <= 5 {
                Ok(Some(format!(
                    "🏎️ \x02{}: {}\x02 begins in 5 minutes.",
                    data.race.meeting_official_name, event.description
                )))
            } else {
                Ok(None)
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

                    let time_to_event: i64 = event_time
                        .signed_duration_since(chrono::Utc::now())
                        .num_minutes();
                    info!("Time to DB event: {} minutes", time_to_event);

                    if time_to_event > 0 && time_to_event <= 5 {
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
    let driver_list_path = format!("{}/{}DriverList.json", F1_SESSION_ENDPOINT, path);
    info!("Fetching driver list for {}", driver_list_path);
    let response_result: Result<HashMap<String, Value>, _> =
        fetch_json(driver_list_path.as_str(), None).await;

    match response_result {
        Ok(response) => {
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
        }
        Err(e) => {
            eprintln!("Failed to fetch driver list: {}", e);
            return Ok(());
        }
    };

    Ok(())
}

#[derive(Debug)]
struct EssentialDriverData {
    position: String,
    racing_number: String,
    best_lap_time: String,
    interval_to_position_ahead: Option<String>,
}

async fn extract_position_and_number(
    data: HashMap<String, Value>,
    pool: &SqlitePool,
) -> Result<Vec<F1APIDriverStanding>> {
    let lines = data.get("Lines")
        .and_then(Value::as_object)
        .context("Failed to extract lines")?;

    let extracted_data: Vec<EssentialDriverData> = lines
        .iter()
        .map(|(_, driver_data)| {
            let position = driver_data["Position"].as_str().unwrap_or_default().to_string();
            let racing_number = driver_data["RacingNumber"].as_str().unwrap_or_default().to_string();
            let best_lap_time = driver_data
                .get("BestLapTime")
                .and_then(|v| v.get("Value"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let interval_to_position_ahead = driver_data
                .get("Stats")
                .and_then(Value::as_array)
                .and_then(|stats| {
                    stats.iter().find_map(|stat| {
                        stat.get("TimeDifftoPositionAhead")
                            .and_then(Value::as_str)
                            .map(String::from)
                    })
                });

            EssentialDriverData {
                position,
                racing_number,
                best_lap_time,
                interval_to_position_ahead,
            }
        })
        .collect();

    let driver_list = sqlx::query!("SELECT tla, racing_number, team_name FROM driver_list")
        .fetch_all(pool)
        .await?;

    debug!("Driver list: {:?}", driver_list);
    debug!("Extracted data: {:?}", extracted_data);

    extracted_data
        .iter()
        .map(|data| {
            let driver = driver_list
                .iter()
                .find(|driver| {
                    driver.racing_number == data.racing_number.parse::<i64>().unwrap_or(-1)
                })
                .ok_or_else(|| anyhow!("Driver not found for racing number: {}", data.racing_number))?;

            let position = data.position.parse::<i8>()
                .map_err(|_| anyhow!("Invalid position: {}", data.position))?;

            Ok(F1APIDriverStanding {
                position,
                driver_name: driver.tla.clone(),
                team_name: driver.team_name.clone(),
                time: data.best_lap_time.clone(),
                difference: data.interval_to_position_ahead.clone(),
            })
        })
        .collect()
}

// Fetch results for a given path from the F1 API
pub async fn fetch_results(pool: &SqlitePool, path: &str) -> Result<String> {
    let result = sqlx::query!("SELECT data FROM results WHERE path = ?", path)
        .fetch_optional(pool)
        .await?;

    let session_result = match result {
        Some(previous_result) => {
            info!("Using cached results for {}", path);
            info!("Previous result: {}", previous_result.data);
            serde_json::from_str(&previous_result.data)
                .context("Failed to deserialize cached results")?
        }
        None => {
            debug!("Fetching TimingDataF1 for {}", path);
            let session = fetch_json::<HashMap<String, Value>>(
                format!("{}/{}TimingDataF1.json", F1_SESSION_ENDPOINT, path).as_str(),
                None,
            )
            .await
            .context("Failed to fetch TimingDataF1")?;

            debug!("Fetching SessionInfo for {}", path);
            let session_info: SessionInfo = fetch_json::<SessionInfo>(
                format!("{}/{}", F1_SESSION_ENDPOINT, "SessionInfo.json").as_str(),
                None,
            )
            .await
            .context("Failed to fetch SessionInfo")?;

            let standings = extract_position_and_number(session, pool)
                .await
                .context("Failed to extract position and number")?;

            let new_session_result = SessionResults {
                title: format!(
                    "{} {}",
                    session_info.meeting.official_name, session_info.name
                ),
                standings,
            };

            let json_result = serde_json::to_string(&new_session_result)
                .context("Failed to serialize new session result")?;
            sqlx::query!(
                "INSERT INTO results (path, data, event_id) VALUES (?, ?, (SELECT id FROM events WHERE start_time < unixepoch() AND event_type_id != 1 ORDER BY start_time DESC LIMIT 1))",
                path,
                json_result
            )
            .execute(pool)
            .await
            .context("Failed to insert new results into database")?;

            new_session_result
        }
    };

    let mut output = format!("🏎️ \x02{} Results\x02:", session_result.title);

    // Consider only the first 10 drivers sorted by the key "position" to avoid spamming
    let mut sorted_standings = session_result.standings;
    sorted_standings.sort_by_key(|standing| standing.position);

    for standing in sorted_standings.iter().take(10) {
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
    match fetch_json::<CurrentDriverStandings>(
        format!("{}/current/driverStandings.json", ERGAST_API_ENDPOINT).as_str(),
        None,
    )
    .await {
        Ok(standings) => {
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
        Err(e) => {
            eprintln!("Failed to fetch WDC standings: {}", e);
            Err(e)
        }
    }
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
    match fetch_json::<CurrentConstructorStandings>(
        format!("{}/current/constructorStandings.json", ERGAST_API_ENDPOINT).as_str(),
        None,
    )
    .await {
        Ok(standings) => {
            let json_standings = serde_json::to_string(&standings)?;

            sqlx::query!(
                "INSERT INTO championship_standings (data, type) VALUES (?, 1) ON CONFLICT (type) DO UPDATE SET data = ?, create_time = CURRENT_TIMESTAMP",
                json_standings,
                json_standings
            )
            .execute(pool)
            .await?;

            Ok(standings)
        }
        Err(e) => {
            eprintln!("Failed to fetch WCC standings: {}", e);
            Err(e)
        }
    }
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
        for (key, datetime_str) in race.sessions.iter() {
            if let Some(event_type) = EventType::from_str(key) {
                let datetime_str_with_millis =
                    if datetime_str.ends_with('Z') && !datetime_str.contains(".000Z") {
                        datetime_str.replace('Z', ".000Z")
                    } else {
                        datetime_str.to_string()
                    };

                match Utc.datetime_from_str(&datetime_str_with_millis, "%Y-%m-%dT%H:%M:%S%.3fZ") {
                    Ok(event_start_time) => {
                        let meeting_name = format!(
                            "{} FORMULA 1 {} GRAND PRIX {}",
                            event_type.to_emoji(),
                            race.name.to_uppercase(),
                            event_year
                        );
                        info!("{} -> {}", key, event_type.to_str());
                        info!("Inserting event: {}", meeting_name);

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
                        eprintln!("Can't parse date: {}: {}", &datetime_str, error)
                    }
                }
            } else {
                eprintln!("Unknown event type: {}", key);
            }
        }
    }

    Ok(())
}
