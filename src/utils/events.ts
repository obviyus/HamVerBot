import { EventType } from "~/types/event-type";

const typeNames: Record<EventType, string> = {
	[EventType.LiveryReveal]: "Livery Reveal",
	[EventType.FreePractice1]: "Free Practice 1",
	[EventType.FreePractice2]: "Free Practice 2",
	[EventType.FreePractice3]: "Free Practice 3",
	[EventType.Qualifying]: "Qualifying",
	[EventType.Sprint]: "Sprint",
	[EventType.Race]: "Race",
	[EventType.SprintQualifying]: "Sprint Qualifying",
};

const typeEmojis: Record<EventType, string> = {
	[EventType.LiveryReveal]: "🎨",
	[EventType.FreePractice1]: "🏎️",
	[EventType.FreePractice2]: "🏎️",
	[EventType.FreePractice3]: "🏎️",
	[EventType.Qualifying]: "⏱️",
	[EventType.Sprint]: "🏁",
	[EventType.Race]: "🏎️",
	[EventType.SprintQualifying]: "⏱️",
};

const stringMap: Array<[string, EventType]> = [
	["sprint qualifying", EventType.SprintQualifying],
	["sprint quali", EventType.SprintQualifying],
	["sprint shootout", EventType.SprintQualifying],
	["practice 1", EventType.FreePractice1],
	["practice1", EventType.FreePractice1],
	["practice 2", EventType.FreePractice2],
	["practice2", EventType.FreePractice2],
	["practice 3", EventType.FreePractice3],
	["practice3", EventType.FreePractice3],
	["qualifying", EventType.Qualifying],
	["sprint race", EventType.Sprint],
	["livery", EventType.LiveryReveal],
	["fp1", EventType.FreePractice1],
	["fp2", EventType.FreePractice2],
	["fp3", EventType.FreePractice3],
	["quali", EventType.Qualifying],
	["sprint", EventType.Sprint],
	["race", EventType.Race],
	["gp", EventType.Race],
	["sq", EventType.SprintQualifying],
	["p1", EventType.FreePractice1],
	["p2", EventType.FreePractice2],
	["p3", EventType.FreePractice3],
	["q", EventType.Qualifying],
	["s", EventType.Sprint],
	["r", EventType.Race],
	["l", EventType.LiveryReveal],
];

const sessionKeyMap: Record<string, EventType> = {
	fp1: EventType.FreePractice1,
	fp2: EventType.FreePractice2,
	fp3: EventType.FreePractice3,
	qualifying: EventType.Qualifying,
	sprint: EventType.Sprint,
	race: EventType.Race,
	sprintqualifying: EventType.SprintQualifying,
};

export function eventTypeToString(eventType: EventType): string {
	return typeNames[eventType] ?? "Unknown";
}

export function eventTypeToEmoji(eventType: EventType): string {
	return typeEmojis[eventType] ?? "🏎️";
}

export function stringToEventType(str?: string): EventType | undefined {
	if (!str) return undefined;
	const lower = str.toLowerCase();
	for (const [key, value] of stringMap) {
		if (lower.includes(key)) return value;
	}
	return undefined;
}

export function sessionKeyToEventType(key: string): EventType | null {
	return sessionKeyMap[key] ?? null;
}
