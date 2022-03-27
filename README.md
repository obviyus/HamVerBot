# HamVerBot
[![Build](https://github.com/obviyus/hamverbot/actions/workflows/build.yml/badge.svg)](https://github.com/obviyus/hamverbot/actions/workflows/build.yml)

#f1's favourite F1 bot running on [Libera.Chat](https://libera.chat/) built using the Rust [`irc`](https://crates.io/crates/irc) crate.

## Getting Started
To begin, clone the repository and populate `config.toml`. An example configuration is:

```toml
owners = ['obviyus']
nickname = "HamVerBot-Dev"
nick_password = "some-password" # Required for SASL authentication
password = "some-password"
realname = "Steward of #f1"
server = "irc.libera.chat"
port = 6697
use_tls = true
encoding = "UTF-8"
channels = ["#f1"]
umodes = "+RB-x"
user_info = "IRC bot for #f1"
version = "irc:git:Rust"
source = "https://github.com/obviyus/hamverbot"
ping_time = 180
ping_timeout = 20
burst_window_length = 8
max_messages_in_burst = 15
should_ghost = false
ghost_sequence = []

[options]
command_prefix = "!"
```

To run the bot,
```bash
RUST_LOG=info F1_API_KEY='your-api-key' cargo run
```

## Libera #f1 Hall of Fame
Oblivion, obviyus, ordos, and all the other nicknames beginning with 'o'. Sorry eff.
