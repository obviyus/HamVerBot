import { EventType } from "~/types/event-type";

const eventTypeMetadata: Record<EventType, { name: string; emoji: string }> = {
	[EventType.LiveryReveal]: { name: "Livery Reveal", emoji: "🎨" },
	[EventType.FreePractice1]: { name: "Free Practice 1", emoji: "🏎️" },
	[EventType.FreePractice2]: { name: "Free Practice 2", emoji: "🏎️" },
	[EventType.FreePractice3]: { name: "Free Practice 3", emoji: "🏎️" },
	[EventType.Qualifying]: { name: "Qualifying", emoji: "⏱️" },
	[EventType.Sprint]: { name: "Sprint", emoji: "🏁" },
	[EventType.Race]: { name: "Race", emoji: "🏎️" },
	[EventType.SprintQualifying]: { name: "Sprint Qualifying", emoji: "⏱️" },
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
	return eventTypeMetadata[eventType].name;
}

export function eventTypeToEmoji(eventType: EventType): string {
	return eventTypeMetadata[eventType].emoji;
}

export function stringToEventType(str?: string): EventType | undefined {
	const lower = str?.toLowerCase();
	return lower ? stringMap.find(([key]) => lower.includes(key))?.[1] : undefined;
}

export function sessionKeyToEventType(key: string): EventType | null {
	return sessionKeyMap[key] ?? null;
}
