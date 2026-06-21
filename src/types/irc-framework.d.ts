declare module "irc-framework" {
	interface IrcMessageEvent {
		nick: string;
		target: string;
		message: string;
	}

	export class Client {
		constructor();

		connected: boolean;
		user: {
			nick: string;
		};

		connect(options: {
			host: string;
			port: number;
			nick: string;
			username?: string;
			gecos?: string;
			password?: string;
			tls?: boolean;
			account?: { account: string; password: string };
			ping_interval?: number;
			ping_timeout?: number;
			enable_echomessage?: boolean;
			outgoing_addr?: string;
		}): void;

		raw(line: string): void;
		quit(message?: string): void;
		changeNick(nick: string): void;
		say(target: string, message: string): void;
		join(channel: string): void;
		on(event: "message", listener: (event: IrcMessageEvent) => void): this;
		on(event: "privmsg", listener: (event: IrcMessageEvent) => void): this;
		on(event: string, listener: (...args: unknown[]) => void): this;
	}
}
