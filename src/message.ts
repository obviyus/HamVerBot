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

/**
 * Parse a timezone argument string (e.g., "utc+1", "gmt-5:30", "+1", "-5:30")
 * @param arg - The timezone argument string
 * @returns The parsed timezone offset in minutes or undefined if invalid
 */
function parseTimezone(arg?: string): number | undefined {
	if (!arg) return undefined;

	// Convert to lowercase for case-insensitive comparison
	const lowerArg = arg.toLowerCase();

	// Handle prefixed case (utc/gmt)
	if (lowerArg.startsWith("utc") || lowerArg.startsWith("gmt")) {
		// Handle UTC/GMT+0 case
		const offsetStr = lowerArg.substring(3);
		if (offsetStr.length === 0) {
			return 0;
		}

		return parseOffset(offsetStr);
	}

	// No prefix, try to parse directly
	return parseOffset(lowerArg);
}

/**
 * Parse an offset string like "+1", "-5:30"
 * @param offsetStr - The offset string to parse
 * @returns The offset in minutes or undefined if invalid
 */
function parseOffset(offsetStr: string): number | undefined {
	// Parse sign and offset
	const firstChar = offsetStr.charAt(0);
	const sign = firstChar === "-" ? -1 : 1;

	// Skip sign character if present
	const offsetValue = firstChar === "+" || firstChar === "-" ? offsetStr.substring(1) : offsetStr;

	// Parse hours and optional minutes
	const parts = offsetValue.split(":");

	let seconds: number;
	if (parts.length === 1) {
		// Just hours
		const hours = Number.parseInt(parts[0], 10);
		if (Number.isNaN(hours) || !isValidHoursOffset(hours * sign)) return undefined;
		seconds = hours * 3600;
	} else if (parts.length === 2) {
		// Hours and minutes
		const hours = Number.parseInt(parts[0], 10);
		const minutes = Number.parseInt(parts[1], 10);
		if (Number.isNaN(hours) || !isValidHoursOffset(hours * sign)) return undefined;
		if (Number.isNaN(minutes) || !isValidMinutesOffset(minutes)) return undefined;
		seconds = hours * 3600 + minutes * 60;
	} else {
		return undefined;
	}

	return (seconds * sign) / 60;
}

/**
 * Check if the hours offset is within valid range (from -12 to +14)
 * @param signedOffset - A signed hours offset
 * @returns True if the offset is within the range
 */
function isValidHoursOffset(signedOffset: number): boolean {
	const minHoursOffset = -12,
		maxHoursOffset = 14;

	return signedOffset >= minHoursOffset && signedOffset <= maxHoursOffset;
}

/**
 * Check if the minutes offset is within valid range (from 0 to 59)
 * @param minutes - A minutes offset
 * @returns True if minutes are within the range
 */
function isValidMinutesOffset(minutes: number): boolean {
	const minMinutesOffset = 0,
		maxMinutesOffset = 59;

	return minutes >= minMinutesOffset && minutes <= maxMinutesOffset;
}

/**
 * Build a time string for an event
 * @param eventName - The name of the event
 * @param eventTime - The timestamp of the event
 * @param timezone - Optional timezone offset in minutes
 * @returns The formatted time string
 */
function buildTimeString(eventName: string, eventTime: number, timezone?: number): string {
	const eventDate = new Date(eventTime * 1000);

	if (timezone !== undefined) {
		// Convert to the specified timezone
		const offsetMinutes = timezone;
		const localTime = new Date(eventDate.getTime() + offsetMinutes * 60 * 1000);

		// Format the timezone string
		const tzHours = Math.abs(Math.floor(offsetMinutes / 60));
		const tzMinutes = Math.abs(offsetMinutes % 60);
		const tzSign = offsetMinutes >= 0 ? "+" : "-";
		const tzStr = `${tzSign}${tzHours.toString().padStart(2, "0")}:${tzMinutes.toString().padStart(2, "0")}`;

		// Format the date: "Day, Month Date"
		const dateStr = localTime.toUTCString().split(" ").slice(0, 3).join(" ");

		return `\x02${eventName}\x02 starts on ${dateStr} at ${localTime.getUTCHours().toString().padStart(2, "0")}:${localTime.getUTCMinutes().toString().padStart(2, "0")} UTC${tzStr}`;
	}

	// Calculate time left
	const timeLeft = eventDate.getTime() - Date.now();
	const timeLeftString = formatDuration(timeLeft);

	return `\x02${eventName}\x02 begins in ${timeLeftString}`;
}

/**
 * Format a duration in milliseconds to a human-readable string
 * @param durationMs - The duration in milliseconds
 * @returns The formatted duration string
 */
function formatDuration(durationMs: number): string {
	if (durationMs <= 0) {
		return "0 seconds";
	}

	const seconds = Math.floor(durationMs / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	const durationParts: string[] = [];

	if (days > 0) {
		durationParts.push(`${days} ${pluralize("day", days)}`);
	}

	if (hours > 0 || durationParts.length > 0) {
		durationParts.push(`${hours} ${pluralize("hour", hours)}`);
	}

	if (minutes > 0 || durationParts.length > 0) {
		durationParts.push(`${minutes} ${pluralize("minute", minutes)}`);
	}

	return durationParts.join(" and ");
}

/**
 * Pluralize a word based on count
 * @param word - The word to pluralize
 * @param count - The count
 * @returns The pluralized word
 */
function pluralize(word: string, count: number): string {
	return `${word}${count === 1 ? "" : "s"}`;
}

/**
 * Get next event and format response message
 */
async function getNextEventMessage(eventType?: EventType, timezone?: number): Promise<string> {
	const event = await getNextEvent(eventType);

	if (!event) {
		return "No upcoming events found.";
	}

	const { meetingName, eventType: type, startTime } = event;
	const emoji = eventTypeToEmoji(type);
	return buildTimeString(
		`${emoji} ${meetingName}: ${eventTypeToString(type)}`,
		startTime,
		timezone,
	);
}

// Command handler functions
function isOwnerNick(nick: string): boolean {
	return appConfig.irc.owners.some((owner) => owner.trim().toLowerCase() === nick.toLowerCase());
}

async function enableAutopost(target: string): Promise<string> {
	if (await isAutopostChannelEnabled(target)) {
		return "Autopost already enabled here.";
	}

	const { session, messages } = await fetchCurrentSessionRaceControlMessages();
	const relevantMessageKeys = messages
		.filter(shouldAutopostRaceControlMessage)
		.map(buildRaceControlMessageKey);

	await markAutopostMessagesSeen(session.Path, relevantMessageKeys);
	await enableAutopostChannel(target);

	return `Autopost enabled in ${target}. Watching red flags, safety car, penalties.`;
}

const commandHandlers: Record<
	string,
	(args: string[], context: CommandContext) => Promise<string>
> = {
	ping: async () => "pong",

	next: async (args) => {
		const timezone = parseTimezone(args[0]);
		return await getNextEventMessage(undefined, timezone);
	},

	when: async (args) => {
		const eventType = stringToEventType(args[0]);
		const timezone = parseTimezone(args[1]);
		return await getNextEventMessage(eventType, timezone);
	},

	prev: async () => {
		const path = await getLatestPath();
		if (!path) {
			return "No previous events found.";
		}

		try {
			return await fetchResults(path);
		} catch (error) {
			console.error("Error fetching results:", error);
			return "Failed to fetch results.";
		}
	},

	drivers: async () => {
		try {
			return (await returnWdcStandings()) || "No standings available.";
		} catch (error) {
			console.error("Error fetching WDC standings:", error);
			return "Failed to fetch standings.";
		}
	},

	constructors: async () => {
		try {
			return (await returnWccStandings()) || "No standings available.";
		} catch (error) {
			console.error("Error fetching WCC standings:", error);
			return "Failed to fetch standings.";
		}
	},

	h2h: async (args) => {
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

		try {
			return await fetchHeadToHead(leftCode, rightCode);
		} catch (error) {
			console.error("Error fetching H2H:", error);
			return "Failed to fetch H2H.";
		}
	},

	weather: async () => {
		try {
			return await fetchSessionWeather();
		} catch (error) {
			console.error("Error fetching weather:", error);
			return "Failed to fetch weather.";
		}
	},

	stints: async () => {
		try {
			return await fetchSessionStints();
		} catch (error) {
			console.error("Error fetching stints:", error);
			return "Failed to fetch stints.";
		}
	},

	enable: async (args, context) => {
		if (args[0] !== "autopost") {
			return "Usage: !enable autopost";
		}

		if (context.isPrivate) {
			return "Run this in the channel you want to enable.";
		}

		if (!isOwnerNick(context.nick)) {
			return "Only bot owners can enable autopost.";
		}

		try {
			return await enableAutopost(context.target);
		} catch (error) {
			console.error("Error enabling autopost:", error);
			return "Failed to enable autopost.";
		}
	},

	help: async () => {
		return "Available commands: !ping, !next [timezone], !when [event] [timezone], !prev, !drivers, !constructors, !h2h VER HAM, !weather, !stints, !enable autopost, !help";
	},
};

// Command aliases
const commandAliases: Record<string, string> = {
	n: "next",
	w: "when",
	p: "prev",
	d: "drivers",
	c: "constructors",
	h: "help",
};

/**
 * Handle an IRC message
 * @param message - The message text
 * @param context - The IRC command context
 */
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
