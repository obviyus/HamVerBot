import { describe, expect, test } from "bun:test";
import { EventType } from "../src/types/event-type";
import {
	eventTypeToEmoji,
	eventTypeToString,
	sessionKeyToEventType,
	stringToEventType,
} from "../src/utils/events";

describe("events utils", () => {
	test("formats event names and emojis", () => {
		expect(eventTypeToString(EventType.FreePractice1)).toBe("Free Practice 1");
		expect(eventTypeToString(EventType.SprintQualifying)).toBe("Sprint Qualifying");
		expect(eventTypeToEmoji(EventType.Qualifying)).toBe("⏱️");
		expect(eventTypeToEmoji(EventType.Race)).toBe("🏎️");
	});

	test("parses common command aliases", () => {
		expect(stringToEventType("fp1")).toBe(EventType.FreePractice1);
		expect(stringToEventType("practice 2")).toBe(EventType.FreePractice2);
		expect(stringToEventType("sprint qualifying")).toBe(EventType.SprintQualifying);
		expect(stringToEventType("sprint shootout")).toBe(EventType.SprintQualifying);
		expect(stringToEventType("sprint race")).toBe(EventType.Sprint);
		expect(stringToEventType("grand prix")).toBe(EventType.Race);
		expect(stringToEventType("unknown")).toBeUndefined();
	});

	test("maps live timing session keys", () => {
		expect(sessionKeyToEventType("fp3")).toBe(EventType.FreePractice3);
		expect(sessionKeyToEventType("qualifying")).toBe(EventType.Qualifying);
		expect(sessionKeyToEventType("sprintqualifying")).toBe(EventType.SprintQualifying);
		expect(sessionKeyToEventType("warmup")).toBeNull();
	});
});
