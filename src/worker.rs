use chrono::Utc;
use irc::client::Client;
use log::error;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::sync::Arc;

use crate::{
    database::{self, Event},
    fetch,
};

pub async fn worker(
    thread_pool: Pool<SqliteConnectionManager>,
    thread_client: Arc<Client>,
    channels: Vec<String>,
) -> irc::error::Result<()> {
    // Read the latest result; only deliver it if "path" is not present in the database
    match fetch::read_current_event().await {
        Ok((path, completed)) => {
            let delivered = database::is_event_delivered(thread_pool.clone(), &path)
                .await
                .unwrap();

            if completed && !delivered {
                let standings = fetch::path_driver_standings(&path).await.unwrap();

                // Send the result to all channels
                for channel in channels.iter() {
                    thread_client.send_privmsg(channel, &standings)?;
                }

                // Mark the event as delivered
                match database::insert_result(thread_pool.clone(), &path) {
                    Ok(_) => {}
                    Err(e) => error!("Failed to insert result for {}: {}", path, e),
                };
            }
        }
        Err(e) => {
            error!("Failed to read current event: {}", e);
        }
    };

    // Load upcoming events into the database. If the next event is within 5 minutes
    // send a message to the channels. If no event is found, poll API for a new list.
    match database::next_event(thread_pool.clone()).await.unwrap() {
        Some((name, description, start_time)) => {
            if (start_time - Utc::now().timestamp()) <= 300 {
                for channel in channels.iter() {
                    thread_client.send_privmsg(
                        channel,
                        format!("🏎️ \x02{}: {}\x02 begins in 5 minutes.", name, description),
                    )?;
                }
            }
        }
        None => match fetch::fetch_events().await.unwrap() {
            Some(events) => {
                for (name, description, start_time) in events {
                    match database::insert_event(
                        thread_pool.clone(),
                        Event {
                            _id: 0,
                            meeting_name: name,
                            description,
                            start_time,
                        },
                    ) {
                        Ok(_) => {}
                        Err(e) => {
                            error!("Failed to insert event: {}", e);
                        }
                    };
                }
            }
            None => {
                error!("No events found.");
            }
        },
    }

    Ok(())
}
