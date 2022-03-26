use crate::{
    database,
    models::{DriverStanding, SPFeed, SessionInfo},
};
use chrono::DateTime;
use log::{error, info};
use reqwest::Client;

const F1_SESSION_ENDPOINT: &str = "https://livetiming.formula1.com/static";

pub async fn read_result() -> Result<Option<String>, reqwest::Error> {
    let client = reqwest::Client::new();

    let body = client
        .get(format!("{}/{}", F1_SESSION_ENDPOINT, "SessionInfo.json"))
        .send()
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    // Strip BOM from UTF-8-SIG
    let session: SessionInfo = serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();

    if !database::is_result_sent(&session.path) && session.archive_status.status == "Complete" {
        // TODO: Do we really need to store the end_time?
        let end_time = match chrono::DateTime::parse_from_str(
            &format!("{} +{}", &session.end_date, &session.gmt_offset),
            "%Y-%m-%dT%H:%M:%S %:z:00",
        ) {
            Ok(end_time) => end_time,
            Err(e) => {
                error!("Failed to parse end_time: {}", e);
                return Ok(None);
            }
        };

        // TODO: Update the topic of the IRC channel with data for the next event

        match database::insert_result(
            &session.path,
            DateTime::from_utc(end_time.naive_utc(), chrono::Utc),
        ) {
            Ok(_) => {
                info!("Saving result for {}", &session.path);
            }
            Err(e) => {
                error!("Failed to insert result: {}", e);
                return Ok(None);
            }
        };

        return match driver_standings(client, session.path.clone()).await {
            Ok(formatting_string) => {
                info!("Delivering result for {}", session.path);
                Ok(Some(formatting_string))
            }
            Err(e) => {
                error!("Failed to get driver standings: {}", e);
                Ok(None)
            }
        };
    } else {
        Ok(None)
    }
}

async fn driver_standings(client: Client, path: String) -> Result<String, reqwest::Error> {
    let body = client
        .get(format!("{}/{}SPFeed.json", F1_SESSION_ENDPOINT, &path))
        .send()
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
        "Pulled results for {}: {}",
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
