import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	buildRaceControlMessageKey,
	fetchCurrentSessionRaceControlMessages,
	fetchSessionPitStops,
	fetchSessionStints,
	fetchSessionWeather,
	formatAutopostRaceControlMessage,
	shouldAutopostRaceControlMessage,
} from "../src/live-timing";

const originalFetch = globalThis.fetch;
const fetchMock = mock(async (_input: RequestInfo | URL) => new Response(null, { status: 500 }));

function jsonResponse(data: unknown, status = 200, bom = false): Response {
	const body = `${bom ? "\uFEFF" : ""}${JSON.stringify(data)}`;
	return new Response(body, { status });
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

beforeEach(() => {
	fetchMock.mockReset();
	globalThis.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("live timing helpers", () => {
	test("builds stable race control keys", () => {
		expect(
			buildRaceControlMessageKey({
				Utc: "2026-03-07T02:03:42",
				Category: "Flag",
				Flag: "RED",
				Message: "RED FLAG",
			}),
		).toBe("2026-03-07T02:03:42|Flag|RED|||RED FLAG");
	});

	test("filters only wanted autopost race control messages", () => {
		expect(
			shouldAutopostRaceControlMessage({
				Utc: "1",
				Category: "Flag",
				Flag: "RED",
				Message: "RED FLAG",
			}),
		).toBe(true);
		expect(
			shouldAutopostRaceControlMessage({
				Utc: "2",
				Category: "SafetyCar",
				Status: "DEPLOYED",
				Mode: "SC",
				Message: "SAFETY CAR DEPLOYED",
			}),
		).toBe(true);
		expect(
			shouldAutopostRaceControlMessage({
				Utc: "3",
				Category: "SafetyCar",
				Status: "DEPLOYED",
				Mode: "VSC",
				Message: "VSC DEPLOYED",
			}),
		).toBe(false);
		expect(
			shouldAutopostRaceControlMessage({
				Utc: "4",
				Category: "Other",
				Message: "CAR 4 (NOR) 5 SECOND TIME PENALTY",
			}),
		).toBe(true);
		expect(
			shouldAutopostRaceControlMessage({
				Utc: "5",
				Category: "Other",
				Message: "NO PENALTY FOR CAR 4",
			}),
		).toBe(false);
	});

	test("formats autopost race control messages", () => {
		const session = {
			Meeting: { Name: "Australian Grand Prix" },
			Name: "Race",
			Path: "2026/race/",
		};

		expect(
			formatAutopostRaceControlMessage(session, {
				Utc: "1",
				Category: "Flag",
				Flag: "RED",
				Message: "RED FLAG",
			}),
		).toBe("🚩 \x02Australian Grand Prix: Race\x02: RED FLAG");

		expect(
			formatAutopostRaceControlMessage(session, {
				Utc: "2",
				Category: "Other",
				Message: "CAR 81 (PIA) 5 SECOND TIME PENALTY",
			}),
		).toBe("⚖️ \x02Australian Grand Prix: Race\x02: CAR 81 (PIA) 5 SECOND TIME PENALTY");
	});
});

describe("live timing fetchers", () => {
	test("fetches and formats session weather", async () => {
		fetchMock.mockImplementation(async (input) => {
			const url = requestUrl(input);
			if (url.endsWith("/SessionInfo.json")) {
				return jsonResponse({
					Meeting: { Name: "Australian Grand Prix" },
					Name: "Practice 3",
					Path: "2026/aus/fp3/",
				});
			}

			if (url.endsWith("/WeatherData.json")) {
				return jsonResponse(
					{
						AirTemp: "20",
						Humidity: "50",
						Rainfall: "0",
						TrackTemp: "38",
						WindDirection: "270",
						WindSpeed: "5",
					},
					200,
					true,
				);
			}

			throw new Error(`Unexpected URL: ${url}`);
		});

		expect(fetchSessionWeather()).resolves.toBe(
			"🌦️ \x02Australian Grand Prix: Practice 3 Weather\x02: Air 20C | Track 38C | Humidity 50% | Wind 5 @ 270deg | Rain 0",
		);
	});

	test("fetches and formats fastest pit stops", async () => {
		fetchMock.mockImplementation(async (input) => {
			const url = requestUrl(input);
			if (url.endsWith("/SessionInfo.json")) {
				return jsonResponse({
					Meeting: { Name: "Australian Grand Prix" },
					Name: "Race",
					Path: "2026/aus/race/",
				});
			}

			if (url.endsWith("/PitStopSeries.json")) {
				return jsonResponse({
					PitTimes: {
						"1": [
							{ PitStop: { RacingNumber: "81", PitStopTime: "2.10", Lap: "15" } },
							{ PitStop: { RacingNumber: "4", PitStopTime: "2.32", Lap: "21" } },
						],
						"2": [
							{ PitStop: { RacingNumber: "63", PitStopTime: "2.21", Lap: "17" } },
							{ PitStop: { RacingNumber: "1", PitStopTime: "3.00", Lap: "18" } },
							{ PitStop: { RacingNumber: "44", PitStopTime: "2.25", Lap: "19" } },
							{ PitStop: { RacingNumber: "16", PitStopTime: "2.50", Lap: "20" } },
						],
					},
				});
			}

			if (url.endsWith("/DriverList.json")) {
				return jsonResponse({
					"81": { RacingNumber: "81", Tla: "PIA" },
					"4": { RacingNumber: "4", Tla: "NOR" },
					"63": { RacingNumber: "63", Tla: "RUS" },
					"1": { RacingNumber: "1", Tla: "VER" },
					"44": { RacingNumber: "44", Tla: "HAM" },
					"16": { RacingNumber: "16", Tla: "LEC" },
				});
			}

			throw new Error(`Unexpected URL: ${url}`);
		});

		expect(fetchSessionPitStops()).resolves.toBe(
			"🔧 \x02Australian Grand Prix: Race Pit Stops\x02: PIA 2.10s (L15) | RUS 2.21s (L17) | HAM 2.25s (L19) | NOR 2.32s (L21) | LEC 2.50s (L20)",
		);
	});

	test("returns a clean message when pit stop feed is unavailable", async () => {
		fetchMock.mockImplementation(async (input) => {
			const url = requestUrl(input);
			if (url.endsWith("/SessionInfo.json")) {
				return jsonResponse({
					Meeting: { Name: "Australian Grand Prix" },
					Name: "Practice 3",
					Path: "2026/aus/fp3/",
				});
			}

			if (url.endsWith("/PitStopSeries.json")) {
				return new Response("forbidden", { status: 403 });
			}

			throw new Error(`Unexpected URL: ${url}`);
		});

		expect(fetchSessionPitStops()).resolves.toBe(
			"Pit stop data not available for Australian Grand Prix: Practice 3.",
		);
	});

	test("fetches and formats current stints", async () => {
		fetchMock.mockImplementation(async (input) => {
			const url = requestUrl(input);
			if (url.endsWith("/SessionInfo.json")) {
				return jsonResponse({
					Meeting: { Name: "Australian Grand Prix" },
					Name: "Practice 2",
					Path: "2026/aus/fp2/",
				});
			}

			if (url.endsWith("/TimingAppData.json")) {
				return jsonResponse({
					Lines: {
						"81": {
							RacingNumber: "81",
							Line: 2,
							Stints: [{ Compound: "SOFT", New: true, TotalLaps: 6 }],
						},
						"1": {
							RacingNumber: "1",
							Line: 1,
							Stints: [{ Compound: "MEDIUM", New: false, TotalLaps: "10" }],
						},
					},
				});
			}

			if (url.endsWith("/DriverList.json")) {
				return jsonResponse({
					"81": { RacingNumber: "81", Tla: "PIA" },
					"1": { RacingNumber: "1", Tla: "VER" },
				});
			}

			throw new Error(`Unexpected URL: ${url}`);
		});

		expect(fetchSessionStints()).resolves.toBe(
			"🛞 \x02Australian Grand Prix: Practice 2 Stints\x02: VER medium(10) | PIA soft(6,new)",
		);
	});

	test("fetches current session race control messages", async () => {
		const startMock = mock(async () => {});
		const stopMock = mock(async () => {});
		const invokeMock = mock(async () => ({
			RaceControlMessages: {
				Messages: [{ Utc: "1", Category: "Flag", Flag: "RED", Message: "RED FLAG" }],
			},
			SessionInfo: {
				Meeting: { Name: "Australian Grand Prix" },
				Name: "Race",
				Path: "2026/aus/race/",
			},
		}));

		expect(
			fetchCurrentSessionRaceControlMessages(() => ({
				start: startMock,
				stop: stopMock,
				invoke: invokeMock,
			})),
		).resolves.toEqual({
			session: {
				Meeting: { Name: "Australian Grand Prix" },
				Name: "Race",
				Path: "2026/aus/race/",
			},
			messages: [{ Utc: "1", Category: "Flag", Flag: "RED", Message: "RED FLAG" }],
		});
		expect(startMock).toHaveBeenCalledTimes(1);
		expect(invokeMock).toHaveBeenCalledWith("Subscribe", ["RaceControlMessages", "SessionInfo"]);
		expect(stopMock).toHaveBeenCalledTimes(1);
	});

	test("stops live timing connection when subscribe fails", async () => {
		const startMock = mock(async () => {});
		const stopMock = mock(async () => {});
		const invokeMock = mock(async () => {
			throw new Error("boom");
		});

		expect(
			fetchCurrentSessionRaceControlMessages(() => ({
				start: startMock,
				stop: stopMock,
				invoke: invokeMock,
			})),
		).rejects.toThrow("boom");
		expect(stopMock).toHaveBeenCalledTimes(1);
	});
});
