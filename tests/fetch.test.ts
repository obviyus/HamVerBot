import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as database from "../src/database";

type DbClient = Awaited<ReturnType<typeof database.getDb>>;

const dbExecuteMock = mock(async (_query?: unknown) => ({
	rows: [] as Array<Record<string, unknown>>,
}));
const dbClientMock = {
	execute: dbExecuteMock,
} as unknown as DbClient;
const getDbMock = mock<typeof database.getDb>(async () => dbClientMock);
const getEventTypeNameMock = mock<typeof database.getEventTypeName>(async () => "Unknown");
const getNextEventMock = mock<typeof database.getNextEvent>(async () => null);
const storeChampionshipStandingsMock = mock<typeof database.storeChampionshipStandings>(
	async () => {},
);
const storeDriversMock = mock<typeof database.storeDrivers>(async () => {});
const storeEventResultMock = mock<typeof database.storeEventResult>(async () => {});

const fetchModule = await import("../src/fetch.ts");

const {
	fetchDriverList,
	fetchHeadToHead,
	fetchNextEvent,
	fetchResults,
	readCurrentEvent,
	returnWccStandings,
	returnWdcStandings,
} = fetchModule;

const originalFetch = globalThis.fetch;
const fetchMock = mock(async (_input: RequestInfo | URL) => new Response(null, { status: 500 }));

function jsonResponse(data: unknown, status = 200, bom = false): Response {
	return new Response(`${bom ? "\uFEFF" : ""}${JSON.stringify(data)}`, { status });
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

beforeEach(() => {
	mock.restore();
	dbExecuteMock.mockReset();
	getDbMock.mockReset();
	getDbMock.mockResolvedValue(dbClientMock);
	getEventTypeNameMock.mockReset();
	getNextEventMock.mockReset();
	storeChampionshipStandingsMock.mockReset();
	storeDriversMock.mockReset();
	storeEventResultMock.mockReset();
	fetchMock.mockReset();
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	spyOn(database, "getDb").mockImplementation(getDbMock);
	spyOn(database, "getEventTypeName").mockImplementation(getEventTypeNameMock);
	spyOn(database, "getNextEvent").mockImplementation(getNextEventMock);
	spyOn(database, "storeChampionshipStandings").mockImplementation(storeChampionshipStandingsMock);
	spyOn(database, "storeDrivers").mockImplementation(storeDriversMock);
	spyOn(database, "storeEventResult").mockImplementation(storeEventResultMock);
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	mock.restore();
});

describe("fetchDriverList", () => {
	test("stores parsed drivers from the live timing feed", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				"81": {
					RacingNumber: "81",
					Reference: "oscar_piastri",
					FirstName: "Oscar",
					LastName: "Piastri",
					FullName: "Oscar Piastri",
					BroadcastName: "O. PIASTRI",
					Tla: "PIA",
					TeamName: "McLaren",
					TeamColour: "FF8000",
				},
				"4": {
					RacingNumber: "4",
					Reference: "",
					FirstName: "Lando",
					LastName: "Norris",
					FullName: "Lando Norris",
					BroadcastName: "L. NORRIS",
					Tla: "NOR",
					TeamName: "McLaren",
				},
			}),
		);

		await fetchDriverList("2026/aus/fp3/");

		expect(storeDriversMock).toHaveBeenCalledWith([
			{
				racingNumber: 4,
				reference: "",
				firstName: "Lando",
				lastName: "Norris",
				fullName: "Lando Norris",
				broadcastName: "L. NORRIS",
				tla: "NOR",
				teamName: "McLaren",
				teamColor: "#FFFFFF",
			},
			{
				racingNumber: 81,
				reference: "oscar_piastri",
				firstName: "Oscar",
				lastName: "Piastri",
				fullName: "Oscar Piastri",
				broadcastName: "O. PIASTRI",
				tla: "PIA",
				teamName: "McLaren",
				teamColor: "FF8000",
			},
		]);
	});
});

describe("readCurrentEvent", () => {
	test("returns path and completion flag", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				ArchiveStatus: { Status: "Complete" },
				Path: "2026/aus/qualifying/",
			}),
		);

		expect(readCurrentEvent()).resolves.toEqual({
			path: "2026/aus/qualifying/",
			isComplete: true,
		});
	});
});

describe("fetchResults", () => {
	test("uses cached results when present", async () => {
		dbExecuteMock.mockResolvedValue({
			rows: [
				{
					meeting_name: "Australian Grand Prix",
					event_type_name: "Qualifying",
					data: JSON.stringify({
						title: "ignored",
						standings: Array.from({ length: 12 }, (_, index) => ({
							position: index + 1,
							driverName: `DRV${index + 1}`,
							teamName: "Team",
							time: `1:2${index}.000`,
						})),
					}),
				},
			],
		});

		expect(fetchResults("2026/aus/qualifying/")).resolves.toBe(
			"🏎️ \x02Australian Grand Prix: Qualifying Results\x02: 1. DRV1 - \x0303[1:20.000]\x03 2. DRV2 - \x0303[1:21.000]\x03 3. DRV3 - \x0303[1:22.000]\x03 4. DRV4 - \x0303[1:23.000]\x03 5. DRV5 - \x0303[1:24.000]\x03 6. DRV6 - \x0303[1:25.000]\x03 7. DRV7 - \x0303[1:26.000]\x03 8. DRV8 - \x0303[1:27.000]\x03 9. DRV9 - \x0303[1:28.000]\x03 10. DRV10 - \x0303[1:29.000]\x03",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("fetches fresh results, maps drivers, and stores the session", async () => {
		dbExecuteMock.mockImplementation(async (query: unknown) => {
			if (typeof query === "string" && query.includes("SELECT racing_number, tla, team_name")) {
				return {
					rows: [
						{ racing_number: 1, tla: "VER", team_name: "Red Bull" },
						{ racing_number: 81, tla: "PIA", team_name: "McLaren" },
					],
				};
			}

			if (typeof query === "object" && query && "sql" in query) {
				const sql = String(query.sql);

				if (sql.includes("FROM results r")) {
					return { rows: [] };
				}

				if (sql.includes("SELECT id FROM events WHERE meeting_name = ? AND event_type_id = ?")) {
					return { rows: [{ id: 42 }] };
				}
			}

			return { rows: [] };
		});

		fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
			const url = requestUrl(input);
			if (url.endsWith("/TimingDataF1.json")) {
				return jsonResponse({
					Lines: {
						"1": {
							Position: "1",
							RacingNumber: "1",
							BestLapTime: { Value: "1:15.111" },
						},
						"81": {
							Position: "2",
							RacingNumber: "81",
							BestLapTime: { Value: "1:15.222" },
							Stats: [{ TimeDifftoPositionAhead: "+0.111" }],
						},
					},
				});
			}

			if (url.endsWith("/SessionInfo.json")) {
				return jsonResponse({
					Meeting: {
						OfficialName: "Australian Grand Prix",
						Name: "Australian Grand Prix",
					},
				});
			}

			throw new Error(`Unexpected URL: ${url}`);
		});

		getEventTypeNameMock.mockResolvedValue("Practice 2");

		expect(
			fetchResults("2026/2026-03-08_Australian_Grand_Prix/2026-03-07_Practice_2/"),
		).resolves.toBe(
			"🏎️ \x02Australian Grand Prix: Practice 2 Results\x02: 1. VER - \x0303[1:15.111]\x03 2. PIA - \x0303[1:15.222]\x03",
		);

		expect(storeEventResultMock).toHaveBeenCalledWith(
			42,
			"2026/2026-03-08_Australian_Grand_Prix/2026-03-07_Practice_2/",
			{
				title: "Australian Grand Prix: Practice 2",
				standings: [
					{
						position: 1,
						driverName: "VER",
						teamName: "Red Bull",
						time: "1:15.111",
						difference: undefined,
					},
					{
						position: 2,
						driverName: "PIA",
						teamName: "McLaren",
						time: "1:15.222",
						difference: "+0.111",
					},
				],
			},
		);
	});
});

describe("standings", () => {
	test("returns preseason WDC message when standings are empty", async () => {
		dbExecuteMock.mockResolvedValue({ rows: [] });
		fetchMock.mockResolvedValue(
			jsonResponse({
				MRData: {
					StandingsTable: {
						season: "2026",
						StandingsLists: [],
					},
				},
			}),
		);

		expect(returnWdcStandings()).resolves.toBe("No driver standings yet for the 2026 season.");
		expect(storeChampionshipStandingsMock).toHaveBeenCalledWith(0, {
			MRData: {
				StandingsTable: {
					season: "2026",
					StandingsLists: [],
				},
			},
		});
	});

	test("formats cached WCC standings and limits output to top 10", async () => {
		dbExecuteMock.mockResolvedValue({
			rows: [
				{
					data: JSON.stringify({
						MRData: {
							StandingsTable: {
								season: "2026",
								StandingsLists: [
									{
										ConstructorStandings: Array.from({ length: 12 }, (_, index) => ({
											position: `${index + 1}`,
											points: `${200 - index}`,
											Constructor: { name: `Team ${index + 1}` },
										})),
									},
								],
							},
						},
					}),
				},
			],
		});

		expect(returnWccStandings()).resolves.toBe(
			"🔧 \x02FORMULA 1 2026 WCC Standings\x02: 1. Team 1 - \x0303[200]\x03 2. Team 2 - \x0303[199]\x03 3. Team 3 - \x0303[198]\x03 4. Team 4 - \x0303[197]\x03 5. Team 5 - \x0303[196]\x03 6. Team 6 - \x0303[195]\x03 7. Team 7 - \x0303[194]\x03 8. Team 8 - \x0303[193]\x03 9. Team 9 - \x0303[192]\x03 10. Team 10 - \x0303[191]\x03",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("fetchHeadToHead", () => {
	test("computes a season summary", async () => {
		fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
			const url = requestUrl(input);
			if (url.includes("/current/driverstandings/")) {
				return jsonResponse({
					MRData: {
						StandingsTable: {
							season: "2026",
							StandingsLists: [
								{
									DriverStandings: [
										{ points: "78", Driver: { code: "VER" } },
										{ points: "49", Driver: { code: "HAM" } },
									],
								},
							],
						},
					},
				});
			}

			if (url.includes("/current/results/")) {
				return jsonResponse({
					MRData: {
						RaceTable: {
							Races: [
								{
									Results: [
										{ position: "1", Driver: { code: "VER" } },
										{ position: "3", Driver: { code: "HAM" } },
									],
								},
								{
									Results: [
										{ position: "2", Driver: { code: "VER" } },
										{ position: "4", Driver: { code: "HAM" } },
									],
								},
							],
						},
					},
				});
			}

			if (url.includes("/current/qualifying/")) {
				return jsonResponse({
					MRData: {
						RaceTable: {
							Races: [
								{
									QualifyingResults: [
										{ position: "1", Driver: { code: "VER" } },
										{ position: "2", Driver: { code: "HAM" } },
									],
								},
								{
									QualifyingResults: [
										{ position: "3", Driver: { code: "VER" } },
										{ position: "2", Driver: { code: "HAM" } },
									],
								},
							],
						},
					},
				});
			}

			throw new Error(`Unexpected URL: ${url}`);
		});

		expect(fetchHeadToHead("VER", "HAM")).resolves.toBe(
			"⚔️ \x02H2H VER vs HAM\x02 (2026): Race \x03032-0\x03 | Quali \x03031-1\x03 | Points \x030378-49\x03 | Podiums \x03032-1\x03 | Best finish \x0303P1/P3\x03",
		);
	});

	test("returns a clean error for unknown driver codes", async () => {
		fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
			const url = requestUrl(input);
			if (url.includes("/current/driverstandings/")) {
				return jsonResponse({
					MRData: {
						StandingsTable: {
							season: "2026",
							StandingsLists: [
								{
									DriverStandings: [{ points: "78", Driver: { code: "VER" } }],
								},
							],
						},
					},
				});
			}

			return jsonResponse({
				MRData: { RaceTable: { Races: [] } },
			});
		});

		expect(fetchHeadToHead("VER", "HAM")).resolves.toBe("Unknown driver code: HAM.");
	});
});

describe("fetchNextEvent", () => {
	test("returns a 5 minute alert for imminent sessions", async () => {
		getNextEventMock.mockResolvedValue({
			meetingName: "Australian Grand Prix",
			eventType: 5,
			startTime: Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
		});
		getEventTypeNameMock.mockResolvedValue("Qualifying");

		const dateNowSpy = spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 7, 0, 0, 0));
		getNextEventMock.mockResolvedValue({
			meetingName: "Australian Grand Prix",
			eventType: 5,
			startTime: Math.floor(Date.UTC(2026, 2, 7, 0, 5, 0) / 1000),
		});

		expect(fetchNextEvent()).resolves.toBe(
			"🏎️ \x02Australian Grand Prix: Qualifying\x02 begins in 5 minutes.",
		);

		dateNowSpy.mockRestore();
	});

	test("returns null when the next event is not imminent", async () => {
		const dateNowSpy = spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 7, 0, 0, 0));
		getNextEventMock.mockResolvedValue({
			meetingName: "Australian Grand Prix",
			eventType: 7,
			startTime: Math.floor(Date.UTC(2026, 2, 7, 0, 20, 0) / 1000),
		});

		expect(fetchNextEvent()).resolves.toBeNull();

		dateNowSpy.mockRestore();
	});
});
