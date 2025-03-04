<p align="center">
    <img src="https://img.shields.io/github/v/release/obviyus/HamVerBot" alt="Version">
  <a href="https://github.com/obviyus/HamVerBot/actions/workflows/build.yml"><img alt="GitHub CI Status" src="https://github.com/obviyus/HamVerBot/actions/workflows/build.yml/badge.svg"></a>
</p>

<p align="center">
    <img src="https://img.shields.io/github/commit-activity/m/obviyus/HamVerBot" alt="Commit Activity">
</p>

<p align="center"><img src="assets/logo.png" width="200px"/></p>

<h2 align="center">🏎️ HamVerBot</h2>

<p align="center">#f1's favorite bot running on <a href="https://libera.chat">Libera.Chat</a> built using the Bun + Typescript.</p>

## ✨ Features

### Commands
- `!next [timezone]` - Time until the next event (supports timezone like `utc+1`, `gmt-5:30`)
- `!when [event] [timezone]` - Time until a specific event (fp1, fp2, fp3, qualifying, sprint, race)
- `!prev` - Get results from the last completed event
- `!drivers` - Current WDC (World Drivers' Championship) standings
- `!constructors` - Current WCC (World Constructors' Championship) standings
- `!help` - List all available commands

### Automated Updates 🤖
- 🏁 Automatic event alerts 5 minutes before start
- 📊 Real-time race results posted to configured channels
- 🔄 Hourly updates of WDC and WCC standings
- 📅 Daily calendar refresh

## 🚀 Getting Started

To begin, clone the repository and create a `.env` file based on `.env.example`:

```env
NODE_ENV=development

# IRC Bot Configuration
IRC_NICKNAME=HamVerBot-Dev
IRC_NICK_PASSWORD=password
IRC_PASSWORD=password
IRC_REALNAME="Steward of #f1"
IRC_USER_INFO="IRC bot for #f1"
IRC_SOURCE="https://github.com/obviyus/hamverbot"

# IRC Server Configuration
IRC_SERVER=irc.libera.chat
IRC_PORT=6697
IRC_USE_TLS=true

# IRC Channel Configuration
IRC_CHANNELS=#f1

# Bot Options
IRC_COMMAND_PREFIX=!

# Admin Settings
IRC_OWNERS=obviyus

# Database Configuration
DATABASE_PATH=./HamVerBot.db
```

To run the bot:

```bash
bun run start
```

## 🤝 Contributing

This repository uses the automated [`semantic-release`](https://github.com/semantic-release/semantic-release) suite of tools to generate version numbers. All commit messages **must** conform to the [Angular Commit Message conventions](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-format).

Thanks for the logo ordos! 🎨
