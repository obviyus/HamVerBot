import { afterEach, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config";

const originalEnv = { ...process.env };

function restoreEnv(): void {
	for (const key of Object.keys(process.env)) {
		delete process.env[key];
	}

	Object.assign(process.env, originalEnv);
}

afterEach(() => {
	restoreEnv();
});

describe("loadConfig", () => {
	test("uses development defaults", () => {
		restoreEnv();
		delete process.env.NODE_ENV;
		delete process.env.IRC_NICKNAME;
		delete process.env.IRC_CHANNELS;
		delete process.env.IRC_OWNERS;
		delete process.env.IRC_COMMAND_PREFIX;
		delete process.env.IRC_PORT;
		delete process.env.IRC_USE_TLS;
		delete process.env.TURSO_DATABASE_URL;
		delete process.env.TURSO_AUTH_TOKEN;

		const config = loadConfig();

		expect(config.isDevelopment).toBe(true);
		expect(config.irc.nickname).toBe("HamVerBot-Dev");
		expect(config.irc.channels).toEqual(["#obviyes"]);
		expect(config.irc.commandPrefix).toBe("!");
		expect(config.irc.owners).toEqual(["obviyus"]);
	});

	test("uses production and environment overrides", () => {
		restoreEnv();
		process.env.NODE_ENV = "production";
		process.env.IRC_NICKNAME = "RaceBot";
		process.env.IRC_CHANNELS = "#f1,#f2";
		process.env.IRC_OWNERS = "alice,bob";
		process.env.IRC_COMMAND_PREFIX = "?";
		process.env.IRC_PORT = "7000";
		process.env.IRC_USE_TLS = "false";
		process.env.TURSO_DATABASE_URL = "libsql://example";
		process.env.TURSO_AUTH_TOKEN = "secret";

		const config = loadConfig();

		expect(config.isDevelopment).toBe(false);
		expect(config.irc.nickname).toBe("RaceBot");
		expect(config.irc.channels).toEqual(["#f1", "#f2"]);
		expect(config.irc.owners).toEqual(["alice", "bob"]);
		expect(config.irc.commandPrefix).toBe("?");
		expect(config.irc.port).toBe(7000);
		expect(config.irc.useTls).toBe(false);
		expect(config.database.url).toBe("libsql://example");
		expect(config.database.authToken).toBe("secret");
	});
});
