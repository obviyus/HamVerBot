use std::{any::Any, sync::Arc};

use chrono::Utc;
use fetch::{fetch_wcc_standings, fetch_wdc_standings};
use irc::client::Sender;
use log::info;
use serde::ser::StdError;
use sqlx::SqlitePool;

use crate::{database::is_event_delivered, fetch, irc::broadcast};

#[derive(Debug)]
pub enum JobType {
    Result,
    Alert,
    Wcc,
    Wdc,
}

pub async fn process_job(
    job_type: JobType,
    pool: &Arc<SqlitePool>,
    sender: &Sender,
) -> Result<Box<dyn Any + Send>, Box<dyn StdError>> {
    match job_type {
        JobType::Result => Ok(Box::new(result_worker(&*pool, sender).await?)),
        JobType::Alert => Ok(Box::new(alert_worker(&*pool, sender).await?)),
        JobType::Wdc => Ok(Box::new(fetch_wdc_standings(&*pool).await?)),
        JobType::Wcc => Ok(Box::new(fetch_wcc_standings(&*pool).await?)),
    }
}

// Check if a new result is posted on th F1 API
// If so, fetch the results and broadcast them to channels
async fn result_worker(
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
async fn alert_worker(
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
