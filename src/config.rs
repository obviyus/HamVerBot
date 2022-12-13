use irc::client::prelude::Config;
use log::{error, info};

#[derive(Debug)]
pub struct ConfigError(String);

#[derive(Debug)]
pub struct HamVerBotConfig {
    pub(crate) irc: Config,
    pub(crate) command_prefix: String,
    pub(crate) channels: Vec<String>,
}

pub fn load_config() -> Result<HamVerBotConfig, ConfigError> {
    let config_path = std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config.toml".to_string());
    info!("Loading config from {}", config_path);

    let config = match Config::load(config_path.clone()) {
        Ok(config) => config,
        Err(e) => {
            error!("Error attempting to read {} : {:?}", config_path, e);
            return Err(ConfigError(e.to_string()));
        }
    };

    info!("Revving up {}... ", config.nickname.as_ref().unwrap());
    let command_prefix = match config.options.get("command_prefix") {
        Some(prefix) => prefix.to_string(),
        None => "!".to_string(),
    };

    let channels = config
        .channels()
        .iter()
        .map(|c| c.to_string())
        .collect::<Vec<_>>();

    info!("Command prefix set to: {}", command_prefix);
    info!("Joining channels: {}", channels.join(", "));

    Ok(HamVerBotConfig {
        irc: config,
        command_prefix,
        channels,
    })
}
