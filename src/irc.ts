import IRC from "irc-framework";
import { config as appConfig } from "./config";
import { getAllChannels } from "./database";
import { handleIrcMessage } from "./message";

type Client = IRC.Client;

interface IrcClientConfig {
	server: string;
	port: number;
	nickname: string;
	username?: string;
	realname?: string;
	password?: string;
	nickPassword?: string;
	secure?: boolean;
	channels?: string[];
}

const DEFAULT_IRC_PORT = 6667;
const LIBERA_HOST_REGEX = /(^|\.)libera\.chat$/i;
const IRC_MAX_LINE_BYTES = 510;

let ircClient: Client | null = null;
let isAuthenticated = false;
let isRegistered = false;
let shouldJoinOnReady = false;
let configuredChannels: string[] = [];

function hasConfiguredNickPassword(nickPassword?: string): nickPassword is string {
	return !!nickPassword && nickPassword !== "password";
}

function maybeMarkReady(client: Client): void {
	if (!isRegistered || !isAuthenticated) return;

	try {
		client.raw(`MODE ${client.user.nick} +B`);
		console.log(`Set bot mode (+B) for ${client.user.nick}`);
	} catch (error) {
		console.error("Failed to set bot mode:", error);
	}
	if (!shouldJoinOnReady) return;

	shouldJoinOnReady = false;
	void (async () => {
		console.log("Connection ready, joining channels...");
		for (const channel of configuredChannels.concat(await getAllChannels())) {
			client.join(channel);
			console.log(`Joined channel: ${channel}`);
		}
	})();
}

function resetConnectionState(): void {
	isAuthenticated = false;
	isRegistered = false;
	shouldJoinOnReady = false;
}

function createAndConnectClient(config: IrcClientConfig): Client {
	resetConnectionState();
	const client = new IRC.Client();
	ircClient = client;
	configuredChannels = config.channels || [];

	initEventListeners(client, config.nickname, config.nickPassword);
	shouldJoinOnReady = true;

	const useBunTlsIpv4Workaround =
		typeof Bun !== "undefined" && !!config.secure && LIBERA_HOST_REGEX.test(config.server);
	console.log("IRC Configuration:");
	console.log(`  Server: ${config.server}:${config.port}`);
	console.log(`  Nickname: ${config.nickname}`);
	console.log(`  TLS Enabled: ${config.secure ? "Yes" : "No"}`);
	if (useBunTlsIpv4Workaround) {
		console.warn("Applying Bun TLS workaround for Libera: forcing IPv4 transport");
	}

	client.connect({
		host: config.server,
		port: config.port || DEFAULT_IRC_PORT,
		nick: config.nickname,
		username: config.username || config.nickname,
		gecos: config.realname || config.nickname,
		password: config.password,
		tls: config.secure || false,
		enable_echomessage: false,
		ping_interval: 15,
		ping_timeout: 60,
		auto_reconnect: true,
		auto_reconnect_max_retries: 30,
		auto_reconnect_max_wait: 30000,
		account: hasConfiguredNickPassword(config.nickPassword)
			? { account: config.nickname, password: config.nickPassword }
			: undefined,
		...(useBunTlsIpv4Workaround ? { outgoing_addr: "0.0.0.0" } : {}),
	});

	return client;
}

export function getClient(): Client {
	if (!ircClient) {
		throw new Error("IRC client not initialized. Call initIrcClient first.");
	}
	return ircClient;
}

export function isClientAuthenticated(): boolean {
	return isAuthenticated;
}

function sendWithLogging(target: string, message: string): void {
	const client = getClient();
	const sanitized = message.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
	const maxBytes = IRC_MAX_LINE_BYTES - Buffer.byteLength(`PRIVMSG ${target} :`);
	let normalizedMessage = sanitized;
	if (Buffer.byteLength(sanitized) > maxBytes) {
		const ellipsis = "...";
		const maxContentBytes = Math.max(0, maxBytes - Buffer.byteLength(ellipsis));
		for (const pattern of [/ \| /g, / \d+\.\s/g, / /g]) {
			let bestIndex = -1;
			for (const match of sanitized.matchAll(pattern)) {
				const index = match.index ?? -1;
				if (index <= 0) continue;
				if (Buffer.byteLength(sanitized.slice(0, index).trimEnd()) > maxContentBytes) continue;
				bestIndex = index;
			}
			if (bestIndex > 0) {
				normalizedMessage = `${sanitized.slice(0, bestIndex).trimEnd()}${ellipsis}`;
				break;
			}
		}

		if (normalizedMessage === sanitized) {
			let truncated = "";
			for (const char of sanitized) {
				if (Buffer.byteLength(truncated) + Buffer.byteLength(char) > maxContentBytes) break;
				truncated += char;
			}
			normalizedMessage = `${truncated.trimEnd()}${ellipsis}`;
		}
	}
	if (normalizedMessage !== sanitized) {
		console.warn(`Truncated outbound IRC message for ${target} to ${maxBytes} bytes`);
	}

	try {
		client.say(target, normalizedMessage);
		console.log(`Message sent to ${target}: ${normalizedMessage}`);
	} catch (error) {
		console.error(`Error sending message to ${target}:`, error);
	}
}

export async function broadcast(message: string): Promise<void> {
	const channels = await getAllChannels();

	for (const channel of channels) {
		sendWithLogging(channel, message);
	}
}

export async function initIrcClient(config: IrcClientConfig): Promise<Client> {
	return createAndConnectClient(config);
}

function dispatchCommand(message: string, target: string, nick: string, isPrivate: boolean): void {
	if (!message.startsWith(appConfig.irc.commandPrefix)) return;
	const commandText = message.slice(appConfig.irc.commandPrefix.length);
	void handleIrcMessage(commandText, { target, nick, isPrivate }).catch((error) => {
		console.error("Error handling command:", error);
	});
}

function initEventListeners(client: Client, nickname: string, nickPassword?: string): void {
	client.on("socket connected", () => {
		const transport = (
			client as unknown as {
				connection?: {
					transport?: {
						socket?: { setTimeout?: (timeout: number) => void };
					};
				};
			}
		).connection?.transport;
		const rawSocket = transport?.socket;
		if (rawSocket?.setTimeout) {
			rawSocket.setTimeout(0);
			console.log("Disabled socket idle timeout on IRC connection");
		}
	});

	client.on("registered", () => {
		if (hasConfiguredNickPassword(nickPassword)) {
			const clientWithNetwork = client as Client & { network?: { cap?: { enabled?: string[] } } };
			const caps = clientWithNetwork.network?.cap?.enabled || [];
			if (!caps.includes("sasl")) {
				isRegistered = true;
				console.log("Connected to IRC server...");
				authenticateWithNickServ(nickname, nickPassword);
				return;
			}
		}

		isRegistered = true;
		console.log("Connected to IRC server...");
		if (!hasConfiguredNickPassword(nickPassword)) {
			isAuthenticated = true;
			console.log("No authentication required, ready to join channels");
		}
		maybeMarkReady(client);
	});

	client.on("loggedin", (event: unknown) => {
		isAuthenticated = true;
		console.log(`Successfully authenticated with SASL as ${(event as { account: string }).account}`);
		maybeMarkReady(client);
	});

	client.on("sasl failed", (event: unknown) => {
		console.error(`SASL authentication failed: ${(event as { reason: string }).reason}`);
		if (hasConfiguredNickPassword(nickPassword)) {
			console.log("Falling back to NickServ authentication");
			authenticateWithNickServ(nickname, nickPassword);
		}
	});

	client.on("nick in use", () => {
		const altNick = `${nickname}_`;
		console.log(`Nickname ${nickname} in use, trying ${altNick}`);
		client.changeNick(altNick);
	});

	client.on("error", (error: unknown) => {
		console.error("IRC client error:", error);
	});

	client.on("close", () => {
		console.log("Connection closed. Attempting to reconnect...");
		resetConnectionState();
	});

	client.on("socket close", (err: unknown) => {
		const error = err as { message?: string; code?: string; errno?: number } | undefined;
		console.log("Socket closed:", error?.message || "No error");
		if (error) {
			if (error.code) console.log("Socket close code:", error.code);
			if (error.errno) console.log("Socket close errno:", error.errno);
			console.log("Socket close full error:", JSON.stringify(error));
		}

		resetConnectionState();
		console.log(
			"Connection status after socket close:",
			client.connected ? "Still connected" : "Disconnected",
		);
		console.log("Auto reconnect is enabled, will attempt to reconnect shortly...");
	});

	client.on("reconnecting", (opts: unknown) => {
		const options = opts as { wait: number };
		console.log(`Reconnecting to IRC server in ${options.wait / 1000} seconds...`);
		shouldJoinOnReady = true;
	});

	client.on("connected", () => {
		console.log("Successfully reconnected to IRC server");
	});

	client.on("ping timeout", () => {
		console.warn("Ping timeout detected. Connection may be unstable.");
	});

	client.on("server options", (options: unknown) => {
		console.log("Server options received:", JSON.stringify(options));
	});

	client.on("message", (event) => {
		if (event.nick === "NickServ") {
			console.log(`[NickServ] ${event.message}`);
			if (
				event.message.includes("You are now identified") ||
				event.message.includes("You are already logged in")
			) {
				isAuthenticated = true;
				console.log("Successfully authenticated with NickServ");
				maybeMarkReady(client);
			} else if (event.message.includes("Invalid password")) {
				console.error("NickServ authentication failed: Invalid password");
				console.error("Please check your IRC_NICK_PASSWORD environment variable");
				const altNick = `${nickname}_${Math.floor(Math.random() * 1000)}`;
				console.log(`Switching to alternative nickname: ${altNick}`);
				client.changeNick(altNick);
			} else if (event.message.includes("This nickname is registered")) {
				console.warn("This nickname is registered but we couldn't authenticate");
				console.warn("Using the nickname anyway, but we might be disconnected");
			}
		} else {
			console.log(`[${event.target}] ${event.nick}: ${event.message}`);
		}

		dispatchCommand(event.message, event.target, event.nick, false);
	});

	client.on("privmsg", (event) => {
		if (event.target === nickname) {
			console.log(`[PM] ${event.nick}: ${event.message}`);
			dispatchCommand(event.message, event.nick, event.nick, true);
		}
	});

	client.on("notice", (event: unknown) => {
		const noticeEvent = event as { from_server: boolean; nick?: string; message: string };
		if (noticeEvent.from_server) {
			console.log(`[Server Notice] ${noticeEvent.message}`);
		} else {
			console.log(`[Notice] ${noticeEvent.nick}: ${noticeEvent.message}`);
		}
	});

	client.on("join", (event: unknown) => {
		const joinEvent = event as { nick: string; channel: string };
		console.log(`${joinEvent.nick} joined ${joinEvent.channel}`);
	});

	client.on("part", (event: unknown) => {
		const partEvent = event as { nick: string; channel: string; message?: string };
		console.log(`${partEvent.nick} left ${partEvent.channel}: ${partEvent.message || "No message"}`);
	});

	client.on("quit", (event: unknown) => {
		const quitEvent = event as { nick: string; message?: string };
		console.log(`${quitEvent.nick} quit: ${quitEvent.message || "No message"}`);
	});

	client.on("topic", (event: unknown) => {
		const topicEvent = event as { channel: string; topic: string };
		console.log(`Topic for ${topicEvent.channel}: ${topicEvent.topic}`);
	});

	client.on("ctcp request", (event: unknown) => {
		const ctcpEvent = event as { nick: string; type: string; message: string };
		console.log(`CTCP ${ctcpEvent.type} request from ${ctcpEvent.nick}: ${ctcpEvent.message}`);
	});
}

function authenticateWithNickServ(nickname: string, password: string): void {
	const client = getClient();
	console.log(`Attempting to authenticate with NickServ for nickname: ${nickname}`);
	client.say("NickServ", `IDENTIFY ${password}`);
	console.log("Sent authentication to NickServ");
}

export function sendMessage(channel: string, message: string): void {
	sendWithLogging(channel, message);
}

export async function attemptManualReconnect(): Promise<boolean> {
	console.log("Attempting manual reconnection to IRC server...");

	if (!ircClient) {
		console.error("Cannot reconnect: IRC client not initialized");
		return false;
	}

	try {
		if (ircClient.connected) {
			console.log("Already connected, no need to reconnect");
			return true;
		}

		const { irc } = appConfig;
		createAndConnectClient({
			server: irc.server,
			port: irc.port,
			nickname: irc.nickname,
			username: irc.nickname,
			realname: irc.realname,
			password: irc.password,
			nickPassword: irc.nickPassword,
			secure: irc.useTls,
			channels: irc.channels,
		});

		console.log("Manual reconnection initiated");
		return true;
	} catch (error) {
		console.error("Manual reconnection failed:", error);
		return false;
	}
}

