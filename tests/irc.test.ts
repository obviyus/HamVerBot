import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as database from "../src/database";
import * as messageModule from "../src/message";

const getAllChannelsMock = mock(async () => [] as string[]);
const handleIrcMessageMock = mock(() => Promise.resolve());

class FakeClient {
	static instances: FakeClient[] = [];

	connected = false;
	user = { nick: "HamVerBot" };
	handlers = new Map<string, Array<(event?: unknown) => void>>();
	sayCalls: Array<{ target: string; message: string }> = [];
	connectCalls: Array<Record<string, unknown>> = [];
	joinCalls: string[] = [];
	rawCalls: Array<string | string[]> = [];
	partCalls: string[] = [];
	quitCalls: string[] = [];
	nickCalls: string[] = [];
	constructor() {
		FakeClient.instances.push(this);
	}

	on(event: string, handler: (event?: unknown) => void): void {
		this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
	}

	emit(event: string, payload?: unknown): void {
		if (event === "registered") payload ??= { nick: this.user.nick };
		for (const handler of this.handlers.get(event) || []) {
			handler(payload);
		}
		if (event === "registered") this.user.nick = (payload as { nick: string }).nick;
		if (event === "nick") {
			const change = payload as { nick: string; new_nick: string };
			if (this.caseCompare(change.nick, this.user.nick)) this.user.nick = change.new_nick;
		}
	}

	connect(options: Record<string, unknown>): void {
		this.connected = true;
		this.connectCalls.push(options);
	}

	say(target: string, message: string): void {
		this.sayCalls.push({ target, message });
	}

	join(channel: string): void {
		this.joinCalls.push(channel);
	}

	raw(message: string | string[]): void {
		this.rawCalls.push(message);
	}

	changeNick(nick: string): void {
		this.nickCalls.push(nick);
	}

	caseCompare(left: string, right: string): boolean {
		return left.toLowerCase() === right.toLowerCase();
	}

	part(channel: string): void {
		this.partCalls.push(channel);
	}

	quit(message: string): void {
		this.quitCalls.push(message);
	}
}

void mock.module("irc-framework", () => ({
	default: {
		Client: FakeClient,
	},
}));

const {
	broadcast,
	getClient,
	initIrcClient,
	isClientAuthenticated,
	sendMessage,
	setPredictionWinners,
	waitForIrcReady,
} = await import("../src/irc.ts");

beforeEach(() => {
	mock.restore();
	getAllChannelsMock.mockReset();
	getAllChannelsMock.mockResolvedValue([]);
	handleIrcMessageMock.mockReset();
	handleIrcMessageMock.mockImplementation(() => Promise.resolve());
	FakeClient.instances.length = 0;
	spyOn(database, "getAllChannels").mockImplementation(getAllChannelsMock);
	spyOn(messageModule, "handleIrcMessage").mockImplementation(handleIrcMessageMock);
});

afterEach(() => {
	mock.restore();
});

describe("IRC client", () => {
	test("connects with Libera TLS workaround", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			password: "serverpass",
			nickPassword: "password",
			realname: "Steward",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;

		expect(client.connectCalls).toHaveLength(1);
		expect(client.connectCalls[0]).toMatchObject({
			host: "irc.libera.chat",
			port: 6697,
			nick: "HamVerBot",
			password: "serverpass",
			tls: true,
			outgoing_addr: "0.0.0.0",
		});
		expect(client.connectCalls[0]?.auto_reconnect).toBeUndefined();
	});

	test("dispatches channel and private commands with context", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("registered");
		await waitForIrcReady();
		client.emit("privmsg", {
			nick: "obviyus",
			target: "#f1",
			message: "!ping",
		});
		client.emit("privmsg", {
			nick: "obviyus",
			target: "HamVerBot",
			message: "!help",
		});

		expect(handleIrcMessageMock).toHaveBeenNthCalledWith(1, "ping", {
			target: "#f1",
			nick: "obviyus",
			isPrivate: false,
		});
		expect(handleIrcMessageMock).toHaveBeenNthCalledWith(2, "help", {
			target: "obviyus",
			nick: "obviyus",
			isPrivate: true,
		});
	});

	test("normalizes outgoing messages to one IRC-safe line", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		const longMessage =
			"Header\n" +
			Array.from(
				{ length: 80 },
				(_, index) => `PART-${index.toString().padStart(2, "0")}-END`,
			).join(" | ");

		sendMessage("#f1", longMessage);

		const sent = client.sayCalls.at(-1);
		expect(sent).toBeDefined();
		expect(sent?.message.includes("\n")).toBe(false);
		expect(Buffer.byteLength(sent?.message || "")).toBeLessThanOrEqual(
			510 - Buffer.byteLength("PRIVMSG #f1 :"),
		);
		expect(sent?.message.endsWith("...")).toBe(true);
		expect(sent?.message).toMatch(/PART-\d{2}-END\.\.\.$/);
	});

	test("broadcasts to all stored channels", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});
		getAllChannelsMock.mockResolvedValue(["#test", "#main"]);

		await broadcast("lights out");

		const client = getClient() as unknown as FakeClient;
		expect(client.sayCalls.slice(-2)).toEqual([
			{ target: "#test", message: "lights out" },
			{ target: "#main", message: "lights out" },
		]);
	});

	test("replaces voiced prediction winners", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#fn"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("userlist", {
			channel: "#fn",
			users: [
				{ nick: "oldwinner", modes: ["v"] },
				{ nick: "tomf", modes: ["v"] },
				{ nick: "lurker", modes: [] },
			],
		});

		expect(setPredictionWinners("#fn", ["obviyus", "tomf", "ordos"])).toEqual({
			unvoiced: ["oldwinner"],
			voiced: ["obviyus", "ordos"],
		});
		expect(client.rawCalls.slice(-2)).toEqual([
			"MODE #fn -v oldwinner",
			"MODE #fn +vv obviyus ordos",
		]);
	});

	test("chunks prediction winner mode changes", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#fn"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("userlist", {
			channel: "#fn",
			users: [
				{ nick: "a", modes: ["v"] },
				{ nick: "b", modes: ["v"] },
				{ nick: "c", modes: ["v"] },
				{ nick: "d", modes: ["v"] },
				{ nick: "e", modes: ["v"] },
			],
		});

		setPredictionWinners("#fn", ["f", "g", "h", "i", "j"]);
		expect(client.rawCalls.slice(-4)).toEqual([
			"MODE #fn -vvvv a b c d",
			"MODE #fn -v e",
			"MODE #fn +vvvv f g h i",
			"MODE #fn +v j",
		]);
	});

	test("joins configured and stored channels after SASL login", async () => {
		getAllChannelsMock.mockResolvedValue(["#db"]);

		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("loggedin", { account: "HamVerBot" });
		client.emit("registered");
		await Promise.resolve();
		await Promise.resolve();

		expect(isClientAuthenticated()).toBe(true);
		expect(client.rawCalls).toContain("MODE HamVerBot +B");
		expect(client.joinCalls).toEqual(["#f1", "#db"]);
		expect(client.sayCalls).toEqual([]);
	});

	test("resolves readiness after channels are joined", async () => {
		getAllChannelsMock.mockResolvedValue(["#db"]);

		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		let ready = false;
		void waitForIrcReady().then(() => {
			ready = true;
		});
		await Promise.resolve();
		expect(ready).toBe(false);

		const client = getClient() as unknown as FakeClient;
		client.emit("registered");
		await Promise.resolve();
		await Promise.resolve();

		expect(client.joinCalls).toEqual(["#f1", "#db"]);
		expect(ready).toBe(true);
	});

	test("waits for registered before joining after SASL login", async () => {
		getAllChannelsMock.mockResolvedValue(["#db"]);

		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("loggedin", { account: "HamVerBot" });
		await Promise.resolve();

		expect(client.joinCalls).toEqual([]);

		client.emit("registered");
		await Promise.resolve();
		await Promise.resolve();

		expect(client.joinCalls).toEqual(["#f1", "#db"]);
	});

	test("identifies the configured account after registration when SASL fails", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("sasl failed", { reason: "bad auth" });
		expect(client.sayCalls).toEqual([]);
		client.emit("registered");

		expect(client.sayCalls).toContainEqual({
			target: "NickServ",
			message: "IDENTIFY HamVerBot secret",
		});
	});

	test("marks authenticated after NickServ confirmation", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("registered");
		client.emit("notice", {
			from_server: false,
			nick: "NickServ",
			target: "HamVerBot",
			message: "You are now identified for HamVerBot.",
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(isClientAuthenticated()).toBe(true);
		expect(client.rawCalls).toContain("MODE HamVerBot +B");
		expect(client.joinCalls).toContain("#f1");
	});

	test("stops registration without changing nicknames when NickServ rejects the password", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("registered");
		client.emit("notice", {
			from_server: false,
			nick: "NickServ",
			target: "HamVerBot",
			message: "Invalid password for HamVerBot",
		});

		client.emit("loggedin", { account: "HamVerBot" });
		await Promise.resolve();
		expect(client.nickCalls).toEqual([]);
		expect(client.joinCalls).toEqual([]);
	});

	test("reclaims the nickname once and waits for its server-confirmed change before joining", async () => {
		getAllChannelsMock.mockResolvedValue(["#f1", "#db"]);
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			channels: ["#f1"],
		});
		const client = getClient() as unknown as FakeClient;
		client.emit("nick in use", { nick: "HamVerBot", reason: "Nickname is already in use" });
		const temporaryNick = client.nickCalls[0];
		expect(temporaryNick).toMatch(/^HVB[0-9a-f]{6}$/);
		expect(client.user.nick).toBe("HamVerBot");
		client.emit("loggedin", { account: "HamVerBot" });
		client.emit("registered", { nick: temporaryNick });
		client.emit("loggedin", { account: "HamVerBot" });
		client.emit("notice", {
			from_server: false,
			nick: "NickServ",
			target: temporaryNick,
			message: "You are already logged in as HamVerBot.",
		});
		client.emit("privmsg", { nick: "reader", target: temporaryNick, message: "!ping" });
		await Promise.resolve();
		expect(client.sayCalls).toEqual([{ target: "NickServ", message: "REGAIN HamVerBot" }]);
		expect(client.joinCalls).toEqual([]);
		expect(client.rawCalls).toEqual([]);
		expect(handleIrcMessageMock).not.toHaveBeenCalled();
		client.emit("nick", { nick: "someoneelse", new_nick: "HamVerBot" });
		expect(client.joinCalls).toEqual([]);
		client.emit("nick", { nick: temporaryNick, new_nick: "HamVerBot" });
		await waitForIrcReady();
		client.emit("loggedin", { account: "HamVerBot" });
		expect(client.joinCalls).toEqual(["#f1", "#db"]);
		expect(client.rawCalls).toEqual(["MODE HamVerBot +B"]);
		expect(client.sayCalls).toHaveLength(1);
	});

	test("does not cycle nicknames when the temporary nickname is also occupied", async () => {
		await initIrcClient({ server: "irc.libera.chat", port: 6697, nickname: "HamVerBot" });
		const client = getClient() as unknown as FakeClient;
		client.emit("nick in use", { nick: "HamVerBot" });
		client.emit("nick in use", { nick: client.nickCalls[0] });
		client.emit("nick in use", { nick: client.nickCalls[0] });
		client.emit("registered");
		await Promise.resolve();
		expect(client.nickCalls).toHaveLength(1);
		expect(client.joinCalls).toEqual([]);
		expect(client.sayCalls).toEqual([]);
	});

	test("does not repeat a denied nickname recovery", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
		});
		const client = getClient() as unknown as FakeClient;
		client.emit("loggedin", { account: "HamVerBot" });
		client.emit("registered", { nick: "HVB123456" });
		client.emit("nick in use", { nick: "HamVerBot", reason: "Nickname is already in use" });
		client.emit("loggedin", { account: "HamVerBot" });
		await Promise.resolve();
		expect(client.sayCalls).toEqual([{ target: "NickServ", message: "REGAIN HamVerBot" }]);
		expect(client.nickCalls).toEqual([]);
		expect(client.joinCalls).toEqual([]);
	});

	test("uses the account name for NickServ login while connected under a temporary nickname", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
		});
		const client = getClient() as unknown as FakeClient;
		client.emit("registered", { nick: "HVB123456" });
		client.emit("notice", {
			from_server: false,
			nick: "NickServ",
			target: "HVB123456",
			message: "You are now identified for HamVerBot.",
		});
		await Promise.resolve();
		expect(client.sayCalls).toEqual([
			{ target: "NickServ", message: "IDENTIFY HamVerBot secret" },
			{ target: "NickServ", message: "REGAIN HamVerBot" },
		]);
		expect(client.joinCalls).toEqual([]);
	});

	test("stays out of channels when nickname recovery has no credentials", async () => {
		await initIrcClient({ server: "irc.libera.chat", port: 6697, nickname: "HamVerBot" });
		const client = getClient() as unknown as FakeClient;
		client.emit("registered", { nick: "HVB123456" });
		await Promise.resolve();
		expect(client.joinCalls).toEqual([]);
		expect(client.sayCalls).toEqual([]);
	});

	test("routes private commands using the current nickname and ignores notices and actions", async () => {
		await initIrcClient({ server: "irc.libera.chat", port: 6697, nickname: "HamVerBot" });
		const client = getClient() as unknown as FakeClient;
		client.emit("registered");
		await waitForIrcReady();
		client.user.nick = "HamVerBot_";
		const event = { nick: "reader", target: "hamverbot_", message: "!ping" };
		client.emit("message", { ...event, type: "privmsg" });
		client.emit("privmsg", event);
		client.emit("message", { ...event, type: "notice" });
		client.emit("notice", { ...event, from_server: false });
		client.emit("message", { ...event, type: "action" });
		client.emit("action", event);
		expect(handleIrcMessageMock).toHaveBeenCalledTimes(1);
		expect(handleIrcMessageMock).toHaveBeenCalledWith("ping", {
			target: "reader",
			nick: "reader",
			isPrivate: true,
		});
	});

	test("exits when the IRC socket closes", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`exit:${code}`);
		});
		const client = getClient() as unknown as FakeClient;

		expect(() => client.emit("socket close", { message: "closed" })).toThrow("exit:1");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
