use crate::{
    database,
    models::{DriverStanding, SPFeed, SessionInfo},
};
use chrono::DateTime;
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

    let session: SessionInfo = serde_json::from_str(body.trim_start_matches('\u{feff}')).unwrap();
    println!("FOUND: {:?}", session.path);

    match database::is_result_sent(&session.path) {
        Ok(false) => {
            if session.archive_status.status == "Complete" {
                println!("{} {}", &session.end_date, &session.gmt_offset);

                let end_time = chrono::DateTime::parse_from_str(
                    &format!("{} +{}", &session.end_date, &session.gmt_offset),
                    "%Y-%m-%dT%H:%M:%S %:z:00",
                )
                .unwrap();

                database::insert_result(
                    &session.path,
                    DateTime::from_utc(end_time.naive_utc(), chrono::Utc),
                )
                .unwrap();

                let result_string = driver_standings(client, session.path).await.unwrap();
                return Ok(Some(result_string));
            };

            return Ok(None);
        }
        Ok(true) => {
            println!("SKIPPING: {:?}", session.path);
            return Ok(None);
        }
        Err(e) => {
            println!("ERROR_READ_RESULT: {:?}", e);
            return Ok(None);
        }
    };
}

async fn driver_standings(client: Client, path: String) -> Result<String, reqwest::Error> {
    let body = client
        .get(format!("{}/{}SPFeed.json", F1_SESSION_ENDPOINT, &path))
        .send()
        .await?
        .text_with_charset("utf-8-sig")
        .await?;

    println!("FOUND: {:?}", body);
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

    let mut output = format!(
        "🏎️ \x02{}: {} Results\x02:",
        session.free.data.r, session.free.data.s
    );

    for standing in standings.iter().take(10) {
        let rank = format!(
            " {}. {} - \x0303[{}]\x03",
            standing.position, standing.driver_name, standing.time
        );

        output.push_str(&rank);
    }

    Ok(output)
}
