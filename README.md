<p align="center">
    <img src="https://img.shields.io/github/v/release/obviyus/HamVerBot" alt="Version">
  <a href="https://github.com/obviyus/HamVerBot/actions/workflows/build.yml"><img alt="GitHub CI Status" src="https://github.com/obviyus/HamVerBot/actions/workflows/build.yml/badge.svg"></a>
</p>

<p align="center">
    <img src="https://img.shields.io/github/commit-activity/m/obviyus/HamVerBot" alt="Commit Activity">
    <img src="https://img.shields.io/tokei/lines/github/obviyus/HamVerBot" alt="Lines of Code" />
</p>

<p align="center"><img src="assets/logo.png" width="200px"/></p>

<h2 align="center">🏎️ HamVerBot</h2>

<p align="center">#f1's favourite F1 bot running on <a href="https://libera.chat">Libera.Chat</a> built using the <a href="https://crates.io/crates/irc"><code>irc</code></a> crate.</p>

## Features

- `!next` to reply with time until the next event
- automatically send a message 5 minutes before the next event starts
- post results of an event to the  configured channels

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
source = "https://github.com/obviyus/HamVerBot"
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

## Contributing

This repository uses the automated [`semantic-release`](https://github.com/semantic-release/semantic-release) suite of tools to generate version numbers. All commit messages **must** conform to the [Angular Commit Message conventions](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-format).

Thanks for the logo ordos!
