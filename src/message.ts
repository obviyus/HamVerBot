import { config as appConfig } from "~/config";
import type { EventType } from "~/types/event-type";
import { eventTypeToEmoji, eventTypeToString, stringToEventType } from "~/utils/events";
import {
	enableAutopostChannel,
	getLatestPath,
	getNextEvent,
	isAutopostChannelEnabled,
	markAutopostMessagesSeen,
} from "./database";
import { fetchHeadToHead, fetchResults, returnWccStandings, returnWdcStandings } from "./fetch";
import { sendMessage } from "./irc";
import {
	buildRaceControlMessageKey,
	fetchCurrentSessionRaceControlMessages,
	fetchSessionStints,
	fetchSessionWeather,
	shouldAutopostRaceControlMessage,
} from "./live-timing";

interface CommandContext {
	target: string;
	nick: string;
	isPrivate: boolean;
}

function parseTimezone(arg?: string): number | undefined {
	if (!arg) return undefined;

	const normalized = arg.toLowerCase();
	const offset = normalized.startsWith("utc") || normalized.startsWith("gmt")
		? normalized.slice(3)
		: normalized;
	if (offset === "") return 0;

	const match = /^([+-]?)(\d{1,2})(?::(\d{1,2}))?$/.exec(offset);
	if (!match) return undefined;

	const sign = match[1] === "-" ? -1 : 1;
	const hours = Number.parseInt(match[2], 10) * sign;
	const minutes = Number.parseInt(match[3] || "0", 10);
	if (hours < -12 || hours > 14 || minutes < 0 || minutes > 59) {
		return undefined;
	}

	return hours * 60 + minutes * sign;
}

async function getNextEventMessage(eventType?: EventType, timezone?: number): Promise<string> {
	const event = await getNextEvent(eventType);
	if (!event) {
		return "No upcoming events found.";
	}

	const eventName = `${eventTypeToEmoji(event.eventType)} ${event.meetingName}: ${eventTypeToString(event.eventType)}`;
	const eventDate = new Date(event.startTime * 1000);
	if (timezone !== undefined) {
		const localTime = new Date(eventDate.getTime() + timezone * 60 * 1000);
		const tzHours = Math.abs(Math.floor(timezone / 60));
		const tzMinutes = Math.abs(timezone % 60);
		const tzSign = timezone >= 0 ? "+" : "-";
		const tzStr = `${tzSign}${tzHours.toString().padStart(2, "0")}:${tzMinutes.toString().padStart(2, "0")}`;
		const dateStr = localTime.toUTCString().split(" ").slice(0, 3).join(" ");

		return `\x02${eventName}\x02 starts on ${dateStr} at ${localTime.getUTCHours().toString().padStart(2, "0")}:${localTime.getUTCMinutes().toString().padStart(2, "0")} UTC${tzStr}`;
	}

	const durationMs = eventDate.getTime() - Date.now();
	if (durationMs <= 0) {
		return `\x02${eventName}\x02 begins in 0 seconds`;
	}

	const totalMinutes = Math.floor(durationMs / 60000);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor(totalMinutes / 60) % 24;
	const minutes = totalMinutes % 60;
	const timeLeftString = [
		days > 0 ? `${days} day${days === 1 ? "" : "s"}` : null,
		hours > 0 || days > 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : null,
		minutes > 0 || hours > 0 || days > 0
			? `${minutes} minute${minutes === 1 ? "" : "s"}`
			: null,
	]
		.filter((part): part is string => part !== null)
		.join(" and ");

	return `\x02${eventName}\x02 begins in ${timeLeftString}`;
}

type CommandHandler = (args: string[], context: CommandContext) => Promise<string>;

function withErrorReply(
	errorLabel: string,
	failureMessage: string,
	handler: CommandHandler,
): CommandHandler {
	return (args, context) => {
		return handler(args, context).catch((error) => {
			console.error(`${errorLabel}:`, error);
			return failureMessage;
		});
	};
}

const commandHandlers: Record<string, CommandHandler> = {
	ping: async () => "pong",

	next: async (args) => getNextEventMessage(undefined, parseTimezone(args[0])),

	when: async (args) => getNextEventMessage(stringToEventType(args[0]), parseTimezone(args[1])),

	prev: withErrorReply("Error fetching results", "Failed to fetch results.", async () => {
		const path = await getLatestPath();
		if (!path) {
			return "No previous events found.";
		}

		return fetchResults(path);
	}),

	drivers: withErrorReply("Error fetching WDC standings", "Failed to fetch standings.", async () => {
		return (await returnWdcStandings()) || "No standings available.";
	}),

	constructors: withErrorReply(
		"Error fetching WCC standings",
		"Failed to fetch standings.",
		async () => {
			return (await returnWccStandings()) || "No standings available.";
		},
	),

	h2h: withErrorReply("Error fetching H2H", "Failed to fetch H2H.", async (args) => {
		if (args.length !== 2) {
			return "Usage: !h2h VER HAM";
		}

		const [leftCode, rightCode] = args.map((arg) => arg.toUpperCase());
		if (!/^[A-Z]{3}$/.test(leftCode) || !/^[A-Z]{3}$/.test(rightCode)) {
			return "Usage: !h2h VER HAM";
		}

		if (leftCode === rightCode) {
			return "Pick two different drivers.";
		}

		return fetchHeadToHead(leftCode, rightCode);
	}),

	weather: withErrorReply("Error fetching weather", "Failed to fetch weather.", async () => {
		return fetchSessionWeather();
	}),

	stints: withErrorReply("Error fetching stints", "Failed to fetch stints.", async () => {
		return fetchSessionStints();
	}),

	enable: withErrorReply("Error enabling autopost", "Failed to enable autopost.", async (args, context) => {
		if (args[0] !== "autopost") {
			return "Usage: !enable autopost";
		}

		if (context.isPrivate) {
			return "Run this in the channel you want to enable.";
		}

		if (!appConfig.irc.owners.some((owner) => owner.trim().toLowerCase() === context.nick.toLowerCase())) {
			return "Only bot owners can enable autopost.";
		}

		if (await isAutopostChannelEnabled(context.target)) {
			return "Autopost already enabled here.";
		}

		const { session, messages } = await fetchCurrentSessionRaceControlMessages();
		const relevantMessageKeys = messages
			.filter(shouldAutopostRaceControlMessage)
			.map(buildRaceControlMessageKey);
		await markAutopostMessagesSeen(session.Path, relevantMessageKeys);
		await enableAutopostChannel(context.target);
		return `Autopost enabled in ${context.target}. Watching red flags, safety car, penalties.`;
	}),

	help: async () => {
		return "Available commands: !ping, !next [timezone], !when [event] [timezone], !prev, !drivers, !constructors, !h2h VER HAM, !weather, !stints, !enable autopost, !help";
	},
};

const commandAliases: Record<string, string> = {
	n: "next",
	w: "when",
	p: "prev",
	d: "drivers",
	c: "constructors",
	h: "help",
};

export async function handleIrcMessage(message: string, context: CommandContext): Promise<void> {
	console.log(`Processing command: ${message} from ${context.nick} in ${context.target}`);

	const args = message.toLowerCase().split(/\s+/);
	if (args.length === 0) return;

	const commandAlias = args[0];
	const command = commandAliases[commandAlias] || commandAlias;
	const handler = commandHandlers[command];

	if (!handler) return;

	try {
		const response = await handler(args.slice(1), context);
		sendMessage(context.target, response);
	} catch (error) {
		console.error(`Error handling command ${command}:`, error);
	}
}
