use std::sync::Arc;

use irc::client::prelude::Config;
use irc::client::Client;
use irc::error::Error;
use irc::proto::{Capability, Command};

pub fn authenticate(config: &Config, client: Arc<Client>) -> Result<(), Error> {
    // Handle SASL authentication manually
    // https://github.com/aatxe/irc/issues/218
    client.send_cap_req(&[Capability::Sasl])?;

    client.send(Command::PASS(config.password.as_ref().unwrap().to_string()))?;
    client.send(Command::NICK(config.nickname.as_ref().unwrap().to_string()))?;
    client.send(Command::USER(
        config.nickname()?.to_string(),
        "0".to_owned(),
        config.real_name().to_string(),
    ))?;

    Ok(())
}
