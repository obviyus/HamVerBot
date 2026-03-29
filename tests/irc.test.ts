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
	rawCalls: string[] = [];
	partCalls: string[] = [];
	quitCalls: string[] = [];
	network = {
		cap: {
			enabled: [] as string[],
			isEnabled: (_cap: string) => false,
		},
	};

	constructor() {
		FakeClient.instances.push(this);
	}

	on(event: string, handler: (event?: unknown) => void): void {
		this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
	}

	emit(event: string, payload?: unknown): void {
		for (const handler of this.handlers.get(event) || []) {
			handler(payload);
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

	raw(message: string): void {
		this.rawCalls.push(message);
	}

	changeNick(nick: string): void {
		this.user.nick = nick;
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
	attemptManualReconnect,
	broadcast,
	getClient,
	initIrcClient,
	isClientAuthenticated,
	sendMessage,
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
		client.emit("message", {
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
		client.network.cap.enabled = ["sasl"];
		client.emit("registered");
		client.emit("loggedin", { account: "HamVerBot" });
		await Promise.resolve();
		await Promise.resolve();

		expect(isClientAuthenticated()).toBe(true);
		expect(client.rawCalls).toContain("MODE HamVerBot +B");
		expect(client.joinCalls).toEqual(["#f1", "#db"]);
		expect(client.sayCalls).toEqual([]);
	});

	test("falls back to NickServ after SASL failure", async () => {
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

		expect(client.sayCalls).toContainEqual({
			target: "NickServ",
			message: "IDENTIFY secret",
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
		client.emit("message", {
			nick: "NickServ",
			target: "HamVerBot",
			message: "You are now identified for HamVerBot.",
		});
		await Promise.resolve();

		expect(isClientAuthenticated()).toBe(true);
		expect(client.rawCalls).toContain("MODE HamVerBot +B");
		expect(client.joinCalls).toContain("#f1");
	});

	test("switches nickname on NickServ invalid password", async () => {
		const mathRandomSpy = spyOn(Math, "random").mockReturnValue(0.123);

		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("message", {
			nick: "NickServ",
			target: "HamVerBot",
			message: "Invalid password for HamVerBot",
		});

		expect(client.user.nick).toBe("HamVerBot_123");
		mathRandomSpy.mockRestore();
	});

	test("re-registers join callback on reconnect", async () => {
		getAllChannelsMock.mockResolvedValue(["#db"]);

		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.emit("registered");
		await Promise.resolve();
		expect(client.joinCalls).toEqual(["#f1", "#db"]);

		client.joinCalls.length = 0;
		client.connected = false;
		client.emit("socket close", { message: "closed" });
		client.emit("reconnecting", { wait: 5000 });
		client.emit("registered");
		await Promise.resolve();
		await Promise.resolve();

		expect(client.joinCalls).toEqual(["#f1", "#db"]);
	});

	test("attemptManualReconnect short-circuits when already connected", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		expect(attemptManualReconnect()).resolves.toBe(true);
		expect(FakeClient.instances).toHaveLength(1);
	});

	test("attemptManualReconnect creates a new client when disconnected", async () => {
		await initIrcClient({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			secure: true,
			channels: ["#f1"],
		});

		const client = getClient() as unknown as FakeClient;
		client.connected = false;

		expect(attemptManualReconnect()).resolves.toBe(true);
		expect(FakeClient.instances).toHaveLength(2);
		expect(FakeClient.instances[1]?.connectCalls).toHaveLength(1);
	});
});
