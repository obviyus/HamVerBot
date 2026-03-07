import { beforeEach, describe, expect, mock, test } from "bun:test";

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

void mock.module(new URL("../src/database.ts", import.meta.url).href, () => ({
	getAllChannels: getAllChannelsMock,
}));

void mock.module(new URL("../src/message.ts", import.meta.url).href, () => ({
	handleIrcMessage: handleIrcMessageMock,
}));

void mock.module(new URL("../src/config.ts", import.meta.url).href, () => ({
	config: {
		irc: {
			commandPrefix: "!",
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			nickPassword: "password",
			password: "serverpass",
			realname: "Steward",
			useTls: true,
			channels: ["#f1"],
		},
	},
}));

const {
	broadcast,
	getClient,
	initIrcClient,
	sendMessage,
} = await import("../src/irc.ts");

beforeEach(() => {
	getAllChannelsMock.mockReset();
	getAllChannelsMock.mockResolvedValue([]);
	handleIrcMessageMock.mockReset();
	handleIrcMessageMock.mockImplementation(() => Promise.resolve());
	FakeClient.instances.length = 0;
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
			Array.from({ length: 80 }, (_, index) => `PART-${index.toString().padStart(2, "0")}-END`).join(
				" | ",
			);

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
});
