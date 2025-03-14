import { join } from "node:path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

/**
 * IRC Bot Configuration
 */
export interface IRCConfig {
	// Bot identity
	nickname: string;
	nickPassword: string;
	password: string;
	realname: string;
	userInfo: string;
	source: string;

	// Server connection
	server: string;
	port: number;
	useTls: boolean;

	// Channel settings
	channels: string[];

	// Bot options
	commandPrefix: string;

	// Admin settings
	owners: string[];
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
	url: string;
	authToken: string;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
	irc: IRCConfig;
	database: DatabaseConfig;
	isDevelopment: boolean;
}

/**
 * Load configuration from environment variables and defaults
 */
export function loadConfig(): AppConfig {
	// Determine if we're in development mode
	const isDevelopment = process.env.NODE_ENV !== "production";

	return {
		irc: {
			nickname:
				process.env.IRC_NICKNAME ||
				(isDevelopment ? "HamVerBot-Dev" : "HamVerBot"),
			nickPassword: process.env.IRC_NICK_PASSWORD || "password",
			password: process.env.IRC_PASSWORD || "password",
			realname: process.env.IRC_REALNAME || "Steward of #f1",
			userInfo: process.env.IRC_USER_INFO || "IRC bot for #f1",
			source: process.env.IRC_SOURCE || "https://github.com/obviyus/hamverbot",

			server: process.env.IRC_SERVER || "irc.libera.chat",
			port: Number.parseInt(process.env.IRC_PORT || "6697", 10),
			useTls: process.env.IRC_USE_TLS !== "false",

			channels: (
				process.env.IRC_CHANNELS || (isDevelopment ? "#obviyes" : "#f1")
			).split(","),

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

// Export the default configuration
export const config = loadConfig();

// Export as default for easier importing
export default config;
