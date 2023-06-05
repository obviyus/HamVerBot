use chrono::Utc;
use irc::client::Sender;
use log::info;
use sqlx::SqlitePool;

use crate::{database::is_event_delivered, fetch, irc::broadcast};

// Check if a new result is posted on th F1 API
// If so, fetch the results and broadcast them to channels
pub async fn result_worker(
    pool: &SqlitePool,
    sender: &Sender,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Checking for new results at {}", Utc::now());
    match fetch::read_current_event().await {
        Ok((path, completed)) => {
            let delivered = is_event_delivered(pool, &path).await?;

            if completed && !delivered {
                let standings = fetch::fetch_results(pool, &path).await?;
                broadcast(&standings, pool, sender).await?;
            }

            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}

// Check if the next scheduled is within 5 minutes
// If so, broadcast a message to channels
pub async fn alert_worker(
    pool: &SqlitePool,
    sender: &Sender,
) -> Result<(), Box<dyn std::error::Error>> {
    match fetch::fetch_next_event().await {
        Ok(event) => {
            if let Some(formatted_string) = event {
                broadcast(&formatted_string, pool, sender).await?;
            }

            Ok(())
        }
        Err(e) => Err(format!("Error: {}", e).into()),
    }
}
