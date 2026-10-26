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
const MAX_MODES_PER_COMMAND = 4;

let ircClient: Client | null = null;
let isAuthenticated = false;
let isRegistered = false;
let isReady = false;
let shouldJoinOnReady = false;
let configuredChannels: string[] = [];
let readyWaiters: Array<() => void> = [];
const voicedUsersByChannel = new Map<string, Map<string, string>>();

function channelKey(channel: string): string {
	return channel.toLowerCase();
}

function userKey(nick: string): string {
	return nick.toLowerCase();
}

function voicedUsers(channel: string): Map<string, string> {
	const key = channelKey(channel);
	let users = voicedUsersByChannel.get(key);
	if (!users) {
		users = new Map();
		voicedUsersByChannel.set(key, users);
	}
	return users;
}

function setUserVoice(channel: string, nick: string, isVoiced: boolean): void {
	const users = voicedUsers(channel);
	if (isVoiced) {
		users.set(userKey(nick), nick);
	} else {
		users.delete(userKey(nick));
	}
}

function removeUserFromVoiceCache(nick: string): void {
	const key = userKey(nick);
	for (const users of voicedUsersByChannel.values()) {
		users.delete(key);
	}
}

function hasConfiguredNickPassword(nickPassword?: string): nickPassword is string {
	return !!nickPassword && nickPassword !== "password";
}

function maybeMarkReady(client: Client, nickname: string): void {
	if (!isRegistered || !isAuthenticated || !shouldJoinOnReady) return;

	shouldJoinOnReady = false;
	client.raw(`MODE ${nickname} +B`);
	console.log(`Set bot mode (+B) for ${nickname}`);
	void (async () => {
		console.log("Connection ready, joining channels...");
		for (const channel of new Set(configuredChannels.concat(await getAllChannels()))) {
			client.join(channel);
			console.log(`Joined channel: ${channel}`);
		}
		isReady = true;
		for (const resolve of readyWaiters) resolve();
		readyWaiters = [];
	})();
}

function resetConnectionState(): void {
	isAuthenticated = false;
	isRegistered = false;
	isReady = false;
	shouldJoinOnReady = false;
	voicedUsersByChannel.clear();
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

export function waitForIrcReady(): Promise<void> {
	if (isReady) return Promise.resolve();

	return new Promise((resolve) => {
		readyWaiters.push(resolve);
	});
}

function sendWithLogging(target: string, message: string): void {
	const client = getClient();
	const sanitized = message
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
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

function sendModeChanges(channel: string, mode: string, nicks: string[]): void {
	const client = getClient();
	const modeSign = mode[0];
	const modeName = mode.slice(1);
	for (let index = 0; index < nicks.length; index += MAX_MODES_PER_COMMAND) {
		const chunk = nicks.slice(index, index + MAX_MODES_PER_COMMAND);
		client.raw(`MODE ${channel} ${modeSign}${modeName.repeat(chunk.length)} ${chunk.join(" ")}`);
	}
}

export function setPredictionWinners(
	channel: string,
	winners: string[],
): {
	voiced: string[];
	unvoiced: string[];
} {
	const currentVoicedUsers = voicedUsers(channel);
	const winnerKeys = new Set(winners.map(userKey));
	const unvoiced = [...currentVoicedUsers.values()].filter(
		(nick) => !winnerKeys.has(userKey(nick)),
	);
	const voiced = winners.filter((nick) => !currentVoicedUsers.has(userKey(nick)));

	sendModeChanges(channel, "-v", unvoiced);
	sendModeChanges(channel, "+v", voiced);

	for (const nick of unvoiced) {
		setUserVoice(channel, nick, false);
	}
	for (const nick of voiced) {
		setUserVoice(channel, nick, true);
	}

	return { voiced, unvoiced };
}

export async function initIrcClient(config: IrcClientConfig): Promise<Client> {
	return createAndConnectClient(config);
}

function dispatchCommand(
	message: string,
	target: string,
	nick: string,
	account: string | undefined,
	isPrivate: boolean,
): void {
	if (!message.startsWith(appConfig.irc.commandPrefix)) return;
	const commandText = message.slice(appConfig.irc.commandPrefix.length);
	void handleIrcMessage(commandText, { target, nick, account, isPrivate }).catch((error) => {
		console.error("Error handling command:", error);
	});
}

function initEventListeners(client: Client, nickname: string, nickPassword?: string): void {
	let temporaryNickRequested = false;
	let reclaimRequested = false;
	let registrationFailed = false;

	function stopRegistration(reason: string): void {
		registrationFailed = true;
		console.error(`IRC registration stopped: ${reason}. Not joining channels or retrying.`);
	}

	function finishRegistration(confirmedNick = client.user.nick): void {
		if (registrationFailed || !isRegistered || !isAuthenticated) return;
		if (client.caseCompare(confirmedNick, nickname)) {
			maybeMarkReady(client, confirmedNick);
			return;
		}
		if (!hasConfiguredNickPassword(nickPassword)) {
			stopRegistration(`Cannot reclaim ${nickname} without account credentials`);
			return;
		}
		if (reclaimRequested) return;

		reclaimRequested = true;
		console.log(`Reclaiming ${nickname}; waiting for server confirmation before joining channels`);
		client.say("NickServ", `REGAIN ${nickname}`);
	}

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

	client.on("registered", (event) => {
		isRegistered = true;
		console.log("Connected to IRC server...");
		if (registrationFailed) return;
		if (!hasConfiguredNickPassword(nickPassword)) {
			isAuthenticated = true;
			console.log("No authentication required, ready to join channels");
		} else if (!isAuthenticated) {
			authenticateWithNickServ(nickname, nickPassword);
		}
		// The library updates user.nick after it emits this event.
		finishRegistration(event.nick);
	});

	client.on("loggedin", (event: unknown) => {
		isAuthenticated = true;
		console.log(
			`Successfully authenticated with SASL as ${(event as { account: string }).account}`,
		);
		finishRegistration();
	});

	client.on("sasl failed", (event: unknown) => {
		console.error(`SASL authentication failed: ${(event as { reason: string }).reason}`);
		console.log("Will authenticate with NickServ after registration");
	});

	client.on("nick in use", (event) => {
		if (registrationFailed) return;
		if (isRegistered || temporaryNickRequested || !client.caseCompare(event.nick, nickname)) {
			stopRegistration(`Nickname ${event.nick} is still in use`);
			return;
		}
		temporaryNickRequested = true;
		const altNick = `HVB${crypto.randomUUID().slice(0, 6)}`;
		console.log(`Nickname ${nickname} in use; using ${altNick} only for account recovery`);
		client.changeNick(altNick);
	});

	client.on("nick", (event) => {
		if (client.caseCompare(event.nick, client.user.nick)) {
			finishRegistration(event.new_nick);
		}
	});

	client.on("error", (error: unknown) => {
		console.error("IRC client error:", error);
	});

	client.on("close", () => {
		console.error("IRC connection closed; exiting for supervisor restart");
		process.exit(1);
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
		console.error("IRC socket closed; exiting for supervisor restart");
		process.exit(1);
	});

	client.on("ping timeout", () => {
		console.warn("Ping timeout detected. Connection may be unstable.");
	});

	client.on("server options", (options: unknown) => {
		console.log("Server options received:", JSON.stringify(options));
	});

	client.on("userlist", (event: unknown) => {
		const userlistEvent = event as {
			channel: string;
			users: Array<{ nick: string; modes?: string[] }>;
		};
		const users = voicedUsers(userlistEvent.channel);
		users.clear();
		for (const user of userlistEvent.users) {
			if (user.modes?.includes("v")) {
				users.set(userKey(user.nick), user.nick);
			}
		}
	});

	client.on("mode", (event: unknown) => {
		const modeEvent = event as {
			target: string;
			modes: Array<{ mode: string; param?: string | null }>;
		};
		for (const mode of modeEvent.modes) {
			if (!mode.param) continue;
			if (mode.mode === "+v") {
				setUserVoice(modeEvent.target, mode.param, true);
			} else if (mode.mode === "-v") {
				setUserVoice(modeEvent.target, mode.param, false);
			}
		}
	});

	client.on("privmsg", (event) => {
		if (!isReady) return;
		const isPrivate = client.caseCompare(event.target, client.user.nick);
		console.log(`[${isPrivate ? "PM" : event.target}] ${event.nick}: ${event.message}`);
		dispatchCommand(
			event.message,
			isPrivate ? event.nick : event.target,
			event.nick,
			event.account || undefined,
			isPrivate,
		);
	});

	client.on("notice", (event) => {
		if (event.from_server) {
			console.log(`[Server Notice] ${event.message}`);
		} else {
			console.log(`[Notice] ${event.nick}: ${event.message}`);
			if (!client.caseCompare(event.nick, "NickServ")) return;
			if (
				event.message.includes("You are now identified") ||
				event.message.includes("You are already logged in")
			) {
				isAuthenticated = true;
				finishRegistration();
			} else if (event.message.includes("Invalid password")) {
				stopRegistration("NickServ rejected the account password");
			}
		}
	});

	client.on("join", (event: unknown) => {
		const joinEvent = event as { nick: string; channel: string };
		console.log(`${joinEvent.nick} joined ${joinEvent.channel}`);
	});

	client.on("part", (event: unknown) => {
		const partEvent = event as { nick: string; channel: string; message?: string };
		setUserVoice(partEvent.channel, partEvent.nick, false);
		console.log(
			`${partEvent.nick} left ${partEvent.channel}: ${partEvent.message || "No message"}`,
		);
	});

	client.on("quit", (event: unknown) => {
		const quitEvent = event as { nick: string; message?: string };
		removeUserFromVoiceCache(quitEvent.nick);
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
	client.say("NickServ", `IDENTIFY ${nickname} ${password}`);
	console.log("Sent authentication to NickServ");
}

export function sendMessage(channel: string, message: string): void {
	sendWithLogging(channel, message);
}
