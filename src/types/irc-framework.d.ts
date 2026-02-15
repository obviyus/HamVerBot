declare module "irc-framework" {
	interface WhoisEvent {
		nick: string;
		ident: string;
		hostname: string;
		actual_ip?: string;
		actual_hostname?: string;
		real_name?: string;
		server?: string;
		server_info?: string;
		idle?: string;
		account?: string;
		secure?: string;
		away?: string;
		operator?: string;
		channels?: string;
		modes?: string;
		helpop?: string;
		bot?: string;
		logon?: string;
		registered_nick?: string;
		special?: string;
	}

	interface WhoEvent {
		target: string;
		users: Array<{
			nick: string;
			ident: string;
			hostname: string;
			away?: boolean;
			real_name?: string;
		}>;
		tags: Record<string, string>;
	}

	// Define IRC event types
	interface IrcMessageEvent {
		nick: string;
		ident: string;
		hostname: string;
		target: string;
		message: string;
		tags: Record<string, string>;
		time?: number;
		account?: string;
		type?: string;
	}

	interface IrcRegisteredEvent {
		nick: string;
	}

	interface IrcErrorEvent {
		error: string;
		reason?: string;
	}

	interface IrcCloseEvent {
		wasConnected: boolean;
		reconnect: boolean;
	}

	export class Client {
		constructor();

		/**
		 * Whether the client is connected to the IRC network and successfully registered
		 */
		connected: boolean;

		/**
		 * User information once connected to an IRC network
		 */
		user: {
			nick: string;
			username: string;
			gecos: string;
			host: string;
			away: string;
			modes: Set<string>;
		};

		/**
		 * Connect to the IRC server
		 */
		connect(options: {
			host: string;
			port: number;
			nick: string;
			username?: string;
			gecos?: string;
			password?: string;
			tls?: boolean;
			account?:
				| {
						account: string;
						password: string;
				  }
				| boolean
				| Record<string, never>;
			auto_reconnect?: boolean;
			auto_reconnect_max_wait?: number;
			auto_reconnect_max_retries?: number;
			ping_interval?: number;
			ping_timeout?: number;
			enable_chghost?: boolean;
			enable_echomessage?: boolean;
			version?: string;
			encoding?: string;
			sasl_disconnect_on_fail?: boolean;
			webirc?: {
				password: string;
				username: string;
				hostname: string;
				ip: string;
				options?: {
					secure?: boolean;
					"local-port"?: number;
					"remote-port"?: number;
				};
			};
			client_certificate?: {
				private_key: string;
				certificate: string;
			};
		}): void;

		/**
		 * Add middleware to handle events
		 */
		use(middleware: (client: Client, rawEvents: unknown, parsedEvents: unknown) => void): void;

		/**
		 * Send a raw line to the IRC server
		 */
		raw(line: string): void;

		/**
		 * Generate a formatted line to be sent to the IRC server
		 */
		rawString(command: string | string[], ...args: string[]): string;

		/**
		 * Quit from the IRC network
		 */
		quit(message?: string): void;

		/**
		 * Ping the IRC server
		 */
		ping(message?: string): void;

		/**
		 * Change the client's nick
		 */
		changeNick(nick: string): void;

		/**
		 * Send a message to a target
		 */
		say(target: string, message: string, tags?: Record<string, string>): void;

		/**
		 * Send a notice to a target
		 */
		notice(target: string, message: string, tags?: Record<string, string>): void;

		/**
		 * Send a tagged message without content to a target
		 */
		tagmsg(target: string, tags: Record<string, string>): void;

		/**
		 * Join a channel
		 */
		join(channel: string, key?: string): void;

		/**
		 * Part/leave a channel
		 */
		part(channel: string, message?: string): void;

		/**
		 * Set the topic of a channel
		 */
		setTopic(channel: string, newTopic: string): void;

		/**
		 * Remove the topic of a channel
		 */
		clearTopic(channel: string): void;

		/**
		 * Send a CTCP request to a target
		 */
		ctcpRequest(target: string, type: string, ...params: string[]): void;

		/**
		 * Send a CTCP response to a target
		 */
		ctcpResponse(target: string, type: string, ...params: string[]): void;

		/**
		 * Send an action message to a target
		 */
		action(target: string, message: string): void;

		/**
		 * Receive information about a user on the network
		 */
		whois(nick: string, callback?: (event: WhoisEvent) => void): void;

		/**
		 * Receive a list of users on the network that matches the target
		 */
		who(target: string, callback?: (event: WhoEvent) => void): void;

		/**
		 * Request that the IRC server sends a list of available channels
		 */
		list(...params: string[]): void;

		/**
		 * Create a channel object
		 */
		channel(
			channelName: string,
			key?: string,
		): {
			say(message: string): void;
			notice(message: string): void;
			action(message: string): void;
			part(partMessage?: string): void;
			join(key?: string): void;
		};

		/**
		 * Compare two strings using the networks casemapping setting
		 */
		caseCompare(string1: string, string2: string): boolean;

		/**
		 * Uppercase the characters in string using the networks casemapping setting
		 */
		caseUpper(string: string): string;

		/**
		 * Lowercase the characters in string using the networks casemapping setting
		 */
		caseLower(string: string): string;

		/**
		 * Call a callback when any incoming message matches a regex
		 */
		match(
			matchRegex: RegExp,
			callback: (event: Record<string, unknown>) => void,
			messageType?: string,
		): void;

		/**
		 * Call a callback when an incoming notice message matches a regex
		 */
		matchNotice(matchRegex: RegExp, callback: (event: Record<string, unknown>) => void): void;

		/**
		 * Call a callback when an incoming plain message matches a regex
		 */
		matchMessage(matchRegex: RegExp, callback: (event: Record<string, unknown>) => void): void;

		/**
		 * Call a callback when an incoming action message matches a regex
		 */
		matchAction(matchRegex: RegExp, callback: (event: Record<string, unknown>) => void): void;

		/**
		 * Add a target to the list of targets being monitored
		 */
		addMonitor(target: string): void;

		/**
		 * Remove a target from the list of targets being monitored
		 */
		removeMonitor(target: string): void;

		/**
		 * Clear the list of targets being monitored
		 */
		clearMonitor(): void;

		/**
		 * Return the current list of targets being monitored
		 */
		monitorlist(callback?: (nicks: string[]) => void): void;

		/**
		 * Query the current list of targets being monitored
		 */
		queryMonitor(): void;

		/**
		 * Request an extra IRCv3 capability
		 */
		requestCap(capability: string): void;

		/**
		 * Event handler
		 */
		on(event: "registered", listener: (event: IrcRegisteredEvent) => void): this;
		on(event: "message", listener: (event: IrcMessageEvent) => void): this;
		on(event: "privmsg", listener: (event: IrcMessageEvent) => void): this;
		on(event: "notice", listener: (event: IrcMessageEvent) => void): this;
		on(event: "action", listener: (event: IrcMessageEvent) => void): this;
		on(event: "error", listener: (event: IrcErrorEvent) => void): this;
		on(event: "close", listener: (event: IrcCloseEvent) => void): this;
		on(event: string, listener: (...args: unknown[]) => void): this;
	}
}
