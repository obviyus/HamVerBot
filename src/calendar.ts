import * as ical from "node-ical";
import type { Event } from "~/database";
import { storeEvents } from "~/database";
import { EventType } from "~/types/event-type";

const ICS_URL = "https://ics.ecal.com/ecal-sub/660897ca63f9ca0008bcbea6/Formula%201.ics";

const EVENT_TYPE_PATTERNS: Array<[string, EventType]> = [
	["sprint qualifying", EventType.SprintQualifying],
	["sprint quali", EventType.SprintQualifying],
	["sprint race", EventType.Sprint],
	["qualifying", EventType.Qualifying],
	["practice 1", EventType.FreePractice1],
	["fp1", EventType.FreePractice1],
	["practice 2", EventType.FreePractice2],
	["fp2", EventType.FreePractice2],
	["practice 3", EventType.FreePractice3],
	["fp3", EventType.FreePractice3],
	["sprint", EventType.Sprint],
	["race", EventType.Race],
	["livery", EventType.LiveryReveal],
];

const MEETING_NAME_INDICATORS = [
	" Race",
	" Sprint",
	" Qualifying",
	" FP1",
	" FP2",
	" FP3",
	" Practice 1",
	" Practice 2",
	" Practice 3",
	" Livery",
];

const EVENT_TYPE_SUFFIXES: Record<EventType, string> = {
	[EventType.FreePractice1]: "fp1",
	[EventType.FreePractice2]: "fp2",
	[EventType.FreePractice3]: "fp3",
	[EventType.Qualifying]: "qualifying",
	[EventType.Sprint]: "sprint",
	[EventType.SprintQualifying]: "sprint-qualifying",
	[EventType.Race]: "race",
	[EventType.LiveryReveal]: "livery",
};

export async function fetchF1Calendar(): Promise<void> {
	console.log("Fetching F1 calendar...");

	const response = await fetch(ICS_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch ICS file: ${response.status} ${response.statusText}`);
	}

	const parsedData = ical.parseICS(await response.text());
	const events: Event[] = [];

	for (const calendarEvent of Object.values(parsedData)) {
		if (
			!calendarEvent ||
			calendarEvent.type !== "VEVENT" ||
			typeof calendarEvent.summary !== "string" ||
			!(calendarEvent.start instanceof Date)
		) {
			continue;
		}

		const lowerSummary = calendarEvent.summary.toLowerCase();
		const eventType = EVENT_TYPE_PATTERNS.find(([pattern]) => lowerSummary.includes(pattern))?.[1];
		if (!eventType) {
			console.log(`Skipping event with unknown type: ${calendarEvent.summary}`);
			continue;
		}

		const cleanSummary = calendarEvent.summary.replace(/^[^\w\s]+/, "").trim();
		let meetingName = cleanSummary;
		const [dashedMeetingName] = cleanSummary.split(" - ");
		if (dashedMeetingName !== cleanSummary) {
			meetingName = dashedMeetingName.trim();
		} else {
			for (const indicator of MEETING_NAME_INDICATORS) {
				const index = cleanSummary.indexOf(indicator);
				if (index > 0) {
					meetingName = cleanSummary.substring(0, index).trim();
					break;
				}
			}
		}

		const startTime = Math.floor(calendarEvent.start.getTime() / 1000);
		const year = new Date(startTime * 1000).getFullYear();
		const gpName = meetingName
			.toLowerCase()
			.replace(/formula\s*1\s*/i, "")
			.replace(/\d{4}/g, "")
			.replace(/grand prix/gi, "gp")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		events.push({
			meetingName,
			eventTypeId: eventType,
			startTime,
			eventSlug: `${year}-${gpName}-${EVENT_TYPE_SUFFIXES[eventType]}`,
		});
	}

	if (events.length === 0) {
		console.warn("No F1 events found in the calendar");
		return;
	}

	await storeEvents(events);
	console.log(`Successfully processed ${events.length} F1 events`);
}
