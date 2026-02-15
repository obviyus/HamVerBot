import IRC from "irc-framework";
import { config as appConfig } from "./config";
import { getAllChannels } from "./database";
import { handleIrcMessage } from "./message";

type Client = IRC.Client;

// Define event types based on the documentation
interface LoggedInEvent {
	nick: string;
	ident: string;
	hostname: string;
	account: string;
	time: number;
	tags: Record<string, string>;
}

interface SaslFailedEvent {
	reason: string;
	message?: string;
	nick?: string;
	time?: number;
	tags?: Record<string, string>;
}

interface ServerOptionsEvent {
	options: Record<string, unknown>;
	cap: Record<string, unknown>;
}

interface JoinEvent {
	nick: string;
	ident: string;
	hostname: string;
	channel: string;
	time: number;
	account?: string;
}

interface PartEvent {
	nick: string;
	ident: string;
	hostname: string;
	channel: string;
	message?: string;
	time: number;
}

interface QuitEvent {
	nick: string;
	ident: string;
	hostname: string;
	message?: string;
	time: number;
}

interface TopicEvent {
	channel: string;
	topic: string;
	nick?: string;
	time?: number;
}

interface CtcpRequestEvent {
	nick: string;
	ident: string;
	hostname: string;
	target: string;
	type: string;
	message: string;
	time: number;
	account?: string;
}

interface NoticeEvent {
	from_server: boolean;
	nick?: string;
	ident?: string;
	hostname?: string;
	target: string;
	group?: string;
	message: string;
	tags: Record<string, string>;
	time: number;
	account?: string;
}

// Type for IRC client network capabilities
interface IrcNetwork {
	cap: {
		enabled: string[];
		isEnabled: (cap: string) => boolean;
	};
}

// Default IRC port if not specified
const DEFAULT_IRC_PORT = 6667;
const LIBERA_HOST_REGEX = /(^|\.)libera\.chat$/i;

// Global client instance
let ircClient: Client | null = null;

// Track authentication status
let isAuthenticated = false;

// Store authentication callbacks
const authCallbacks: (() => void)[] = [];

// Track whether a join callback is registered for the next auth cycle.
let joinOnAuthRegistered = false;

// Store configured channels for reconnect joins.
let configuredChannels: string[] = [];

function shouldUseBunTlsIpv4Workaround(server: string, secure?: boolean): boolean {
	// AIDEV-NOTE: Bun TLS + Libera can throw a subject-destructure error unless IPv4 is forced.
	return typeof Bun !== "undefined" && !!secure && LIBERA_HOST_REGEX.test(server);
}

/**
 * Register a callback to be executed after authentication
 * @param callback - Function to call after authentication completes
 */
export function onAuthenticated(callback: () => void): void {
	if (isAuthenticated) {
		// If already authenticated, execute immediately
		callback();
	} else {
		// Otherwise, store for later execution
		authCallbacks.push(callback);
	}
}

/**
 * Ensure we re-join channels after authentication.
 */
function registerJoinOnAuth(getChannels: () => Promise<string[]>, reason: string): void {
	if (joinOnAuthRegistered) return;
	joinOnAuthRegistered = true;

	// AIDEV-NOTE: Re-register join-on-auth per reconnect; auth callbacks are one-shot.
	onAuthenticated(async () => {
		joinOnAuthRegistered = false;
		console.log(`Authentication complete (${reason}), joining channels...`);
		const channels = await getChannels();
		joinChannels(channels);
	});
}

/**
 * Execute all registered authentication callbacks
 */
function executeAuthCallbacks(): void {
	while (authCallbacks.length > 0) {
		const callback = authCallbacks.shift();
		if (callback) {
			callback();
		}
	}
}

/**
 * Get the IRC client instance
 * @returns The IRC client instance
 * @throws Error if the client is not initialized
 */
export function getClient(): Client {
	if (!ircClient) {
		throw new Error("IRC client not initialized. Call initIrcClient first.");
	}
	return ircClient;
}

/**
 * Check if the IRC client is initialized and connected
 * @returns True if the client is initialized and connected, false otherwise
 */
export function isClientConnected(): boolean {
	return !!ircClient && ircClient.connected;
}

/**
 * Check if the client is authenticated with NickServ
 * @returns True if authenticated, false otherwise
 */
export function isClientAuthenticated(): boolean {
	return isAuthenticated;
}

/**
 * Broadcast a message to all registered channels
 * @param message - The message to broadcast
 */
export async function broadcast(message: string): Promise<void> {
	const client = getClient();
	const channels = await getAllChannels();

	for (const channel of channels) {
		try {
			client.say(channel, message);
			console.log(`Message sent to ${channel}: ${message}`);
		} catch (error) {
			console.error(`Error sending message to ${channel}:`, error);
		}
	}
}

/**
 * Initialize the IRC client with the given configuration
 * @param config - The IRC client configuration
 * @returns The initialized IRC client
 */
export async function initIrcClient(config: {
	server: string;
	port: number;
	nickname: string;
	username?: string;
	realname?: string;
	password?: string;
	nickPassword?: string;
	secure?: boolean;
	channels?: string[];
}): Promise<Client> {
	// Create a new client instance
	ircClient = new IRC.Client();
	configuredChannels = config.channels || [];
	const useBunTlsIpv4Workaround = shouldUseBunTlsIpv4Workaround(config.server, config.secure);

	// Debug logging for configuration
	console.log("IRC Configuration:");
	console.log(`  Server: ${config.server}:${config.port}`);
	console.log(`  Nickname: ${config.nickname}`);
	console.log(`  TLS Enabled: ${config.secure ? "Yes" : "No"}`);
	if (useBunTlsIpv4Workaround) {
		console.warn("Applying Bun TLS workaround for Libera: forcing IPv4 transport");
	}

	// Configure SASL authentication if nickPassword is provided
	const saslAccount =
		config.nickPassword && config.nickPassword !== "password"
			? { account: config.nickname, password: config.nickPassword }
			: undefined;

	// Register channel joining as an authentication callback
	registerJoinOnAuth(async () => {
		const dbChannels = await getAllChannels();
		const allChannels = configuredChannels.concat(dbChannels);
		return allChannels;
	}, "initial connect");

	// Connect to the IRC server
	ircClient.connect({
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
		account: saslAccount,
		...(useBunTlsIpv4Workaround ? { outgoing_addr: "0.0.0.0" } : {}),
	});

	initEventListeners(ircClient, config.nickname, config.nickPassword);

	return ircClient;
}

/**
 * Initialize event listeners for the IRC client
 * @param client - The IRC client
 * @param nickname - The bot's nickname
 * @param nickPassword - The NickServ password (optional)
 */
function initEventListeners(client: Client, nickname: string, nickPassword?: string): void {
	// Bun >=1.1.27 can emit idle timeouts even with active traffic; disable the raw socket timeout.
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

	// Handle successful registration with the server
	client.on("registered", () => {
		console.log("Connected to IRC server...");

		// If SASL is not being used, fall back to NickServ authentication
		if (nickPassword && nickPassword !== "password") {
			// Check if SASL capability is enabled - if not, use NickServ
			const clientWithNetwork = client as Client & { network?: IrcNetwork };
			const caps = clientWithNetwork.network?.cap?.enabled || [];
			if (!caps.includes("sasl")) {
				authenticateWithNickServ(nickname, nickPassword);
			}
		} else if (!nickPassword || nickPassword === "password") {
			// If no authentication needed, consider authenticated
			isAuthenticated = true;
			console.log("No authentication required, ready to join channels");

			// Set bot mode (+B) after successful registration when no auth needed
			setBotMode(client);

			// Execute authentication callbacks
			executeAuthCallbacks();
		}
		// If SASL is enabled, we'll wait for the 'loggedin' event
	});

	// Handle SASL login events
	client.on("loggedin", (event: unknown) => {
		const loggedInEvent = event as LoggedInEvent;
		console.log(`Successfully authenticated with SASL as ${loggedInEvent.account}`);
		isAuthenticated = true;

		// Set bot mode (+B) after successful authentication
		setBotMode(client);

		// Execute authentication callbacks
		executeAuthCallbacks();
	});

	// Handle SASL failure
	client.on("sasl failed", (event: unknown) => {
		const saslFailedEvent = event as SaslFailedEvent;
		console.error(`SASL authentication failed: ${saslFailedEvent.reason}`);

		// Fall back to NickServ if SASL fails and we have a password
		if (nickPassword && nickPassword !== "password") {
			console.log("Falling back to NickServ authentication");
			authenticateWithNickServ(nickname, nickPassword);
		}
	});

	// Handle nickname already in use
	client.on("nick in use", () => {
		const altNick = `${nickname}_`;
		console.log(`Nickname ${nickname} in use, trying ${altNick}`);
		client.changeNick(altNick);
	});

	// Handle errors
	client.on("error", (error: unknown) => {
		console.error("IRC client error:", error);
	});

	// Handle connection close
	client.on("close", () => {
		console.log("Connection closed. Attempting to reconnect...");
		isAuthenticated = false; // Reset authentication status
	});

	// Handle socket errors
	client.on("socket close", (err: unknown) => {
		const error = err as { message?: string; code?: string; errno?: number } | undefined;
		console.log("Socket closed:", error?.message || "No error");

		// Log additional details if available
		if (error) {
			if (error.code) console.log("Socket close code:", error.code);
			if (error.errno) console.log("Socket close errno:", error.errno);
			console.log("Socket close full error:", JSON.stringify(error));
		}

		isAuthenticated = false; // Reset authentication status

		// Log connection status
		console.log(
			"Connection status after socket close:",
			client.connected ? "Still connected" : "Disconnected",
		);
		console.log("Auto reconnect is enabled, will attempt to reconnect shortly...");

		// Allow join-on-auth to be registered for the next connection
		joinOnAuthRegistered = false;
	});

	// Handle reconnections
	client.on("reconnecting", (opts: unknown) => {
		const options = opts as { wait: number };
		console.log(`Reconnecting to IRC server in ${options.wait / 1000} seconds...`);
		registerJoinOnAuth(async () => {
			const dbChannels = await getAllChannels();
			const allChannels = configuredChannels.concat(dbChannels);
			return allChannels;
		}, "reconnect");
	});

	// Handle successful reconnection
	client.on("connected", async () => {
		console.log("Successfully reconnected to IRC server");
	});

	// Handle ping timeouts
	client.on("ping timeout", () => {
		console.warn("Ping timeout detected. Connection may be unstable.");
	});

	// Handle server options
	client.on("server options", (options: unknown) => {
		const serverOptions = options as ServerOptionsEvent;
		console.log("Server options received:", JSON.stringify(serverOptions));
	});

	// Handle messages
	client.on("message", (event) => {
		// Special handling for NickServ messages to help debug authentication
		if (event.nick === "NickServ") {
			console.log(`[NickServ] ${event.message}`);

			// Check for successful authentication
			if (
				event.message.includes("You are now identified") ||
				event.message.includes("You are already logged in")
			) {
				isAuthenticated = true;
				console.log("Successfully authenticated with NickServ");

				// Execute authentication callbacks
				executeAuthCallbacks();
			}
			// Handle NickServ authentication failures
			else if (event.message.includes("Invalid password")) {
				console.error("NickServ authentication failed: Invalid password");
				console.error("Please check your IRC_NICK_PASSWORD environment variable");

				// Generate a random nickname as fallback
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

		// Handle commands
		if (event.message.startsWith(appConfig.irc.commandPrefix)) {
			const commandText = event.message.slice(appConfig.irc.commandPrefix.length);
			void handleIrcMessage(commandText, event.target).catch((error) => {
				console.error("Error handling channel command:", error);
			});
		}
	});

	// Handle private messages
	client.on("privmsg", (event) => {
		if (event.target === nickname) {
			console.log(`[PM] ${event.nick}: ${event.message}`);
			// Handle private message commands
			if (event.message.startsWith(appConfig.irc.commandPrefix)) {
				const commandText = event.message.slice(appConfig.irc.commandPrefix.length);
				void handleIrcMessage(commandText, event.nick).catch((error) => {
					console.error("Error handling private command:", error);
				});
			}
		}
	});

	// Handle notices
	client.on("notice", (event: unknown) => {
		const noticeEvent = event as NoticeEvent;
		if (noticeEvent.from_server) {
			console.log(`[Server Notice] ${noticeEvent.message}`);
		} else {
			console.log(`[Notice] ${noticeEvent.nick}: ${noticeEvent.message}`);
		}
	});

	// Handle channel joins
	client.on("join", (event: unknown) => {
		const joinEvent = event as JoinEvent;
		console.log(`${joinEvent.nick} joined ${joinEvent.channel}`);
	});

	// Handle channel parts
	client.on("part", (event: unknown) => {
		const partEvent = event as PartEvent;
		console.log(
			`${partEvent.nick} left ${partEvent.channel}: ${partEvent.message || "No message"}`,
		);
	});

	// Handle user quits
	client.on("quit", (event: unknown) => {
		const quitEvent = event as QuitEvent;
		console.log(`${quitEvent.nick} quit: ${quitEvent.message || "No message"}`);
	});

	// Handle topic changes
	client.on("topic", (event: unknown) => {
		const topicEvent = event as TopicEvent;
		console.log(`Topic for ${topicEvent.channel}: ${topicEvent.topic}`);
	});

	// Handle CTCP requests
	client.on("ctcp request", (event: unknown) => {
		const ctcpEvent = event as CtcpRequestEvent;
		console.log(`CTCP ${ctcpEvent.type} request from ${ctcpEvent.nick}: ${ctcpEvent.message}`);
	});
}

/**
 * Authenticate with NickServ
 * @param nickname - The bot's nickname
 * @param password - The NickServ password
 */
function authenticateWithNickServ(nickname: string, password: string): void {
	const client = getClient();

	// Log authentication attempt (without showing the actual password)
	console.log(`Attempting to authenticate with NickServ for nickname: ${nickname}`);

	// The correct format is: IDENTIFY <password>
	// NickServ expects just the password, not the nickname and password
	client.say("NickServ", `IDENTIFY ${password}`);

	console.log("Sent authentication to NickServ");
}

/**
 * Join a channel
 * @param channel - The channel to join
 */
export function joinChannel(channel: string): void {
	const client = getClient();
	client.join(channel);
	console.log(`Joined channel: ${channel}`);
}

/**
 * Join multiple channels
 * @param channels - The channels to join
 */
export function joinChannels(channels: string[]): void {
	for (const channel of channels) {
		joinChannel(channel);
	}
}

/**
 * Leave a channel
 * @param channel - The channel to leave
 */
export function leaveChannel(channel: string): void {
	const client = getClient();
	client.part(channel);
	console.log(`Left channel: ${channel}`);
}

/**
 * Send a message to a specific channel
 * @param channel - The channel to send the message to
 * @param message - The message to send
 */
export function sendMessage(channel: string, message: string): void {
	const client = getClient();
	try {
		client.say(channel, message);
		console.log(`Message sent to ${channel}: ${message}`);
	} catch (error) {
		console.error(`Error sending message to ${channel}:`, error);
	}
}

/**
 * Send a private message to a user
 * @param nickname - The nickname to send the message to
 * @param message - The message to send
 */
export function sendPrivateMessage(nickname: string, message: string): void {
	const client = getClient();
	try {
		client.say(nickname, message);
		console.log(`Private message sent to ${nickname}`);
	} catch (error) {
		console.error(`Error sending private message to ${nickname}:`, error);
	}
}

/**
 * Disconnect from the IRC server
 * @param message - Optional quit message
 */
export function disconnect(message?: string): void {
	const client = getClient();
	client.quit(message || "Disconnecting");
	ircClient = null;
	console.log("Disconnected from IRC server");
}

/**
 * Manually attempt to reconnect to the IRC server
 * This is a fallback for when the auto-reconnect doesn't work
 * @returns Promise that resolves when reconnection is attempted
 */
export async function attemptManualReconnect(): Promise<boolean> {
	console.log("Attempting manual reconnection to IRC server...");

	if (!ircClient) {
		console.error("Cannot reconnect: IRC client not initialized");
		return false;
	}

	try {
		// If we're already connected, no need to reconnect
		if (ircClient.connected) {
			console.log("Already connected, no need to reconnect");
			return true;
		}

		// Create a new client instance
		ircClient = new IRC.Client();
		configuredChannels = appConfig.irc.channels || [];

		// Re-initialize event listeners
		initEventListeners(ircClient, appConfig.irc.nickname, appConfig.irc.nickPassword);

		// Configure SASL authentication if nickPassword is provided
		const saslAccount =
			appConfig.irc.nickPassword && appConfig.irc.nickPassword !== "password"
				? {
						account: appConfig.irc.nickname,
						password: appConfig.irc.nickPassword,
					}
				: undefined;

		// Register channel joining as an authentication callback
		registerJoinOnAuth(async () => {
			const dbChannels = await getAllChannels();
			const allChannels = configuredChannels.concat(dbChannels);
			return allChannels;
		}, "manual reconnect");

		// Reconnect with the same configuration
		ircClient.connect({
			host: appConfig.irc.server,
			port: appConfig.irc.port,
			nick: appConfig.irc.nickname,
			username: appConfig.irc.nickname,
			gecos: appConfig.irc.realname,
			password: appConfig.irc.password,
			tls: appConfig.irc.useTls,
			enable_echomessage: false,
			ping_interval: 15,
			ping_timeout: 60,
			auto_reconnect: true,
			auto_reconnect_max_retries: 30,
			auto_reconnect_max_wait: 30000,
			account: saslAccount,
		});

		console.log("Manual reconnection initiated");
		return true;
	} catch (error) {
		console.error("Manual reconnection failed:", error);
		return false;
	}
}

/**
 * Set the bot mode (+B) for the client
 * @param client - The IRC client
 */
function setBotMode(client: Client): void {
	try {
		client.raw(`MODE ${client.user.nick} +B`);
		console.log(`Set bot mode (+B) for ${client.user.nick}`);
	} catch (error) {
		console.error("Failed to set bot mode:", error);
	}
}
