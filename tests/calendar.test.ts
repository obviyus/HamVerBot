import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as database from "../src/database";

const storeEventsMock = mock(async () => {});
const parseICSMock = mock(() => ({}));

void mock.module("node-ical", () => ({
	parseICS: parseICSMock,
}));

const { fetchF1Calendar } = await import("../src/calendar.ts");

const originalFetch = globalThis.fetch;

function textResponse(body: string, status = 200): Response {
	return new Response(body, { status });
}

beforeEach(() => {
	storeEventsMock.mockReset();
	parseICSMock.mockReset();
	spyOn(database, "storeEvents").mockImplementation(storeEventsMock);
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	mock.restore();
});

describe("fetchF1Calendar", () => {
	test("parses known sessions and stores normalized events", async () => {
		parseICSMock.mockReturnValue({
			race: {
				type: "VEVENT",
				summary: "🏁 FORMULA 1 BRITISH GRAND PRIX 2026 - Race",
				start: new Date("2026-07-05T14:00:00Z"),
			},
			sprintQualifying: {
				type: "VEVENT",
				summary: "FORMULA 1 BRITISH GRAND PRIX 2026 - Sprint Qualifying",
				start: new Date("2026-07-04T10:00:00Z"),
			},
			unknown: {
				type: "VEVENT",
				summary: "Ham Verstappen Karaoke Night",
				start: new Date("2026-07-04T20:00:00Z"),
			},
		});

		globalThis.fetch = mock(async () => textResponse("BEGIN:VCALENDAR")) as typeof fetch;

		await fetchF1Calendar();

		expect(parseICSMock).toHaveBeenCalledWith("BEGIN:VCALENDAR");
		expect(storeEventsMock).toHaveBeenCalledTimes(1);
		expect(storeEventsMock).toHaveBeenCalledWith([
			{
				meetingName: "FORMULA 1 BRITISH GRAND PRIX 2026",
				eventTypeId: 7,
				startTime: 1783260000,
				eventSlug: "2026-british-gp-race",
			},
			{
				meetingName: "FORMULA 1 BRITISH GRAND PRIX 2026",
				eventTypeId: 8,
				startTime: 1783159200,
				eventSlug: "2026-british-gp-sprint-qualifying",
			},
		]);
	});

	test("throws when calendar fetch fails", async () => {
		globalThis.fetch = mock(async () => textResponse("nope", 500)) as typeof fetch;

		expect(fetchF1Calendar()).rejects.toThrow("Failed to fetch ICS file");
		expect(storeEventsMock).not.toHaveBeenCalled();
	});
});
