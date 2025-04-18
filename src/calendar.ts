import * as ical from "node-ical";
import { storeEvents } from "~/database";
import type { Event } from "~/database";
import { EventType } from "~/database";

// Helper function to determine event type from summary
// Simplified determineEventType
function determineEventType(summary: string): EventType | null {
	const lowerSummary = summary.toLowerCase();

	// Order patterns from most specific to least specific
	const eventTypePatterns: [string, EventType][] = [
		["sprint qualifying", EventType.SprintQualifying], // Most specific first
		["qualifying", EventType.Qualifying],
		["practice 1", EventType.FreePractice1],
		["fp1", EventType.FreePractice1],
		["practice 2", EventType.FreePractice2],
		["fp2", EventType.FreePractice2],
		["practice 3", EventType.FreePractice3],
		["fp3", EventType.FreePractice3],
		["sprint", EventType.Sprint], // Check 'sprint' after 'sprint qualifying'
		["race", EventType.Race],
		["livery", EventType.LiveryReveal],
	];

	for (const [pattern, eventType] of eventTypePatterns) {
		if (lowerSummary.includes(pattern)) {
			return eventType;
		}
	}

	return null;
}

// Extract the meeting name from the summary
function extractMeetingName(summary: string): string {
	// Example: "🏁 FORMULA 1 PIRELLI GRAND PRIX DU CANADA 2025 - Race"
	// We want to extract "FORMULA 1 PIRELLI GRAND PRIX DU CANADA 2025"

	// Remove emoji and other non-alphanumeric prefixes
	const cleanSummary = summary.replace(/^[^\w\s]+/, "").trim();

	// Better handling of different summary formats
	const dashIndex = cleanSummary.lastIndexOf(" - ");
	if (dashIndex > 0) {
		return cleanSummary.substring(0, dashIndex).trim();
	}

	// If there's no dash, try to extract based on event type indicators
	const eventTypeIndicators = [
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

	for (const indicator of eventTypeIndicators) {
		const index = cleanSummary.indexOf(indicator);
		if (index > 0) {
			return cleanSummary.substring(0, index).trim();
		}
	}

	// If no specific format is found, return the cleaned summary
	return cleanSummary;
}

function createEventSlug(
	meetingName: string,
	eventType: EventType,
	startTime: number,
): string {
	const date = new Date(startTime * 1000);
	const year = date.getFullYear();

	// Extract the shortened Grand Prix name
	const gpName = meetingName
		.toLowerCase()
		.replace(/formula\s*1\s*/i, "")
		.replace(/\d{4}/g, "")
		.replace(/grand prix/gi, "gp")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	// Map event types to slug suffixes
	const eventTypeSuffixes: Record<EventType, string> = {
		[EventType.FreePractice1]: "fp1",
		[EventType.FreePractice2]: "fp2",
		[EventType.FreePractice3]: "fp3",
		[EventType.Qualifying]: "qualifying",
		[EventType.Sprint]: "sprint",
		[EventType.SprintQualifying]: "sprint-qualifying",
		[EventType.Race]: "race",
		[EventType.LiveryReveal]: "livery",
	};

	const suffix = eventTypeSuffixes[eventType];
	return `${year}-${gpName}-${suffix}`;
}

// Fetch and parse the F1 calendar ICS file
export async function fetchF1Calendar(): Promise<void> {
	console.log("Fetching F1 calendar...");

	const icsUrl =
		"https://ics.ecal.com/ecal-sub/660897ca63f9ca0008bcbea6/Formula%201.ics";

	try {
		// Using Bun's fetch API
		const response = await fetch(icsUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch ICS file: ${response.status} ${response.statusText}`,
			);
		}

		const icsData = await response.text();
		const parsedData = ical.parseICS(icsData);

		const events: Event[] = [];

		// Process events more efficiently
		for (const key in parsedData) {
			const event = parsedData[key];
			if (event.type !== "VEVENT") continue;

			const summary = event.summary as string;
			const eventType = determineEventType(summary);

			// Skip events we don't care about
			if (!eventType) {
				console.log(`Skipping event with unknown type: ${summary}`);
				continue;
			}

			const startDate = event.start as Date;
			const meetingName = extractMeetingName(summary);
			const startTime = Math.floor(startDate.getTime() / 1000);

			events.push({
				meetingName,
				eventTypeId: eventType,
				startTime,
				eventSlug: createEventSlug(meetingName, eventType, startTime),
			});
		}

		// Store all events at once
		if (events.length > 0) {
			await storeEvents(events);
			console.log(`Successfully processed ${events.length} F1 events`);
		} else {
			console.warn("No F1 events found in the calendar");
		}
	} catch (error) {
		console.error("Error fetching or parsing F1 calendar:", error);
		throw error;
	}
}
