use std::{error::Error, ops::Deref};

use base64::{engine::general_purpose, Engine};
use irc::{
    client::{prelude::Config, Client, Sender},
    proto::{Capability, Command, Response},
};
use log::{error, info};
use sqlx::SqlitePool;

pub struct HamVerBotConfig {
    pub irc: Config,
    pub command_prefix: String,
    pub nickname: String,
    pub password: String,
}

pub async fn handle_authenticate(
    username: &str,
    password: &str,
    sender: &Sender,
) -> Result<(), Box<dyn Error>> {
    let encoded =
        general_purpose::STANDARD.encode(format!("{}\x00{}\x00{}", username, username, password));

    sender.send(Command::AUTHENTICATE(encoded))?;
    sender.send(Command::CAP(None, "END".parse()?, None, None))?;

    Ok(())
}

pub async fn handle_response(code: Response, sender: &Sender) -> Result<(), Box<dyn Error>> {
    if code == Response::RPL_SASLSUCCESS {
        info!("Successfully authenticated");
        sender.send(Command::CAP(None, "END".parse().unwrap(), None, None))?;
    }

    Ok(())
}

pub async fn load_config() -> Result<HamVerBotConfig, Box<dyn std::error::Error>> {
    let config_path = std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config.toml".into());
    info!("Loading config from {}", config_path);

    let config = match Config::load(config_path) {
        Ok(config) => config,
        Err(err) => {
            error!("Error loading config: {:#?}", err);
            return Err(err.into());
        }
    };

    let command_prefix = config
        .options
        .get("command_prefix")
        .unwrap_or(&"!".to_string())
        .deref()
        .to_string();

    let password = match std::env::var("IRC_PASSWORD") {
        Ok(val) => val,
        Err(_) => config.password().to_string(),
    };

    Ok(HamVerBotConfig {
        irc: config.clone(),
        command_prefix,
        nickname: config.nickname()?.to_string(),
        password,
    })
}

pub fn authenticate(
    nickname: &str,
    password: &str,
    client: &Client,
) -> Result<(), Box<dyn std::error::Error>> {
    // Handle SASL authentication manually
    // https://github.com/aatxe/irc/issues/218

    client.send_cap_req(&[Capability::Sasl])?;
    client.send(Command::PASS(password.to_string()))?;
    client.send(Command::NICK(nickname.to_string()))?;
    client.send(Command::USER(
        nickname.to_string(),
        "0".to_string(),
        "https://github.com/obviyus/HamVerBot".to_string(),
    ))?;

    Ok(())
}

// Broadcast a message to all channels
pub async fn broadcast(
    message: &str,
    pool: &SqlitePool,
    sender: &Sender,
) -> Result<(), Box<dyn std::error::Error>> {
    sqlx::query!("SELECT name FROM channels;")
        .fetch_all(pool)
        .await?
        .iter()
        .for_each(|channel| sender.send_privmsg(&channel.name, message).unwrap());

    Ok(())
}

// Join a channel when invited
pub async fn join_channel(
    channel: &str,
    pool: &SqlitePool,
    sender: &Sender,
) -> Result<(), Box<dyn std::error::Error>> {
    sqlx::query!("INSERT INTO channels (name) VALUES (?)", channel)
        .execute(pool)
        .await?;

    sender.send_join(channel)?;

    Ok(())
}
