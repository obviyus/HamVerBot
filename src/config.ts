import { config as dotenvConfig } from "dotenv";

dotenvConfig();

export interface IRCConfig {
	nickname: string;
	nickPassword: string;
	password: string;
	realname: string;
	userInfo: string;
	source: string;
	server: string;
	port: number;
	useTls: boolean;
	channels: string[];
	commandPrefix: string;
	owners: string[];
}

export interface DatabaseConfig {
	url: string;
	authToken: string;
}

export interface AppConfig {
	irc: IRCConfig;
	database: DatabaseConfig;
	isDevelopment: boolean;
}

export function loadConfig(): AppConfig {
	const isDevelopment = process.env.NODE_ENV !== "production";
	const nickname = process.env.IRC_NICKNAME || (isDevelopment ? "HamVerBot-Dev" : "HamVerBot");
	const channels = process.env.IRC_CHANNELS || (isDevelopment ? "#obviyes" : "#f1");

	return {
		irc: {
			nickname,
			nickPassword: process.env.IRC_NICK_PASSWORD || "password",
			password: process.env.IRC_PASSWORD || "password",
			realname: process.env.IRC_REALNAME || "Steward of #f1",
			userInfo: process.env.IRC_USER_INFO || "IRC bot for #f1",
			source: process.env.IRC_SOURCE || "https://github.com/obviyus/hamverbot",
			server: process.env.IRC_SERVER || "irc.libera.chat",
			port: Number.parseInt(process.env.IRC_PORT || "6697", 10),
			useTls: process.env.IRC_USE_TLS !== "false",
			channels: channels.split(","),
			commandPrefix: process.env.IRC_COMMAND_PREFIX || "!",
			owners: (process.env.IRC_OWNERS || "obviyus").split(","),
		},
		database: {
			url: process.env.TURSO_DATABASE_URL || "",
			authToken: process.env.TURSO_AUTH_TOKEN || "",
		},
		isDevelopment,
	};
}

export const config = loadConfig();
export default config;
