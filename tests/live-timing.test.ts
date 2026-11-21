import { describe, expect, mock, test } from "bun:test";
import {
	buildRaceControlMessageKey,
	fetchCurrentSessionRaceControlMessages,
	fetchSessionStints,
	fetchSessionWeather,
	formatAutopostRaceControlMessage,
	isRecentRaceControlMessage,
	shouldAutopostRaceControlMessage,
} from "../src/live-timing";

function createConnectionMock(snapshot: Record<string, unknown>) {
	const startMock = mock(async () => {});
	const stopMock = mock(async () => {});
	const invokeMock = mock(async () => snapshot);

	return {
		startMock,
		stopMock,
		invokeMock,
		createConnection: () => ({
			start: startMock,
			stop: stopMock,
			invoke: invokeMock,
		}),
	};
}

function currentSessionInfo(overrides: Record<string, unknown> = {}) {
	return {
		Meeting: { Name: "Australian Grand Prix" },
		ArchiveStatus: { Status: "Generating" },
		Name: "Practice 3",
		Path: "2026/aus/fp3/",
		...overrides,
	};
}

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

	test("filters stale autopost race control messages", () => {
		const now = Date.parse("2026-05-24T22:30:00Z");
		expect(
			isRecentRaceControlMessage(
				{
					Utc: "2026-05-24T22:26:00+00:00",
					Category: "Other",
					Message: "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 27",
				},
				now,
			),
		).toBe(true);
		expect(
			isRecentRaceControlMessage(
				{
					Utc: "2026-05-24T21:37:39+00:00",
					Category: "Other",
					Message: "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 5",
				},
				now,
			),
		).toBe(false);
	});

	test("formats autopost race control messages", () => {
		const session = {
			Meeting: { Name: "Australian Grand Prix" },
			ArchiveStatus: { Status: "Complete" },
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
	test("fetches and formats session weather from SignalR while archive is generating", async () => {
		const { createConnection, invokeMock, stopMock } = createConnectionMock({
			SessionInfo: {
				Meeting: { Name: "Australian Grand Prix" },
				ArchiveStatus: { Status: "Generating" },
				Name: "Qualifying",
				Path: "2026/aus/quali/",
			},
			WeatherData: {
				AirTemp: "20",
				Humidity: "50",
				Rainfall: "0",
				TrackTemp: "38",
				WindDirection: "270",
				WindSpeed: "5",
			},
		});

		expect(fetchSessionWeather(createConnection)).resolves.toBe(
			"🌦️ \x02Australian Grand Prix: Qualifying Weather\x02: Air 20C | Track 38C | Humidity 50% | Wind 5 @ 270deg | Rain 0",
		);
		expect(invokeMock).toHaveBeenCalledWith("Subscribe", ["SessionInfo", "WeatherData"]);
		expect(stopMock).toHaveBeenCalledTimes(1);
	});

	test("fetches and formats current stints", async () => {
		const { createConnection, invokeMock, stopMock } = createConnectionMock({
			SessionInfo: {
				Meeting: { Name: "Australian Grand Prix" },
				ArchiveStatus: { Status: "Generating" },
				Name: "Practice 2",
				Path: "2026/aus/fp2/",
			},
			TimingAppData: {
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
			},
			DriverList: {
				"81": { RacingNumber: "81", Tla: "PIA" },
				"1": { RacingNumber: "1", Tla: "VER" },
			},
		});

		expect(fetchSessionStints(createConnection)).resolves.toBe(
			"🛞 \x02Australian Grand Prix: Practice 2 Stints\x02: VER medium(10) | PIA soft(6,new)",
		);
		expect(invokeMock).toHaveBeenCalledWith("Subscribe", [
			"SessionInfo",
			"DriverList",
			"TimingAppData",
		]);
		expect(stopMock).toHaveBeenCalledTimes(1);
	});

	test("fetches current session race control messages without SignalR keyframe flags", async () => {
		const startMock = mock(async () => {});
		const stopMock = mock(async () => {});
		const invokeMock = mock(async () => ({
			RaceControlMessages: {
				Messages: [{ Utc: "1", Category: "Flag", Flag: "RED", Message: "RED FLAG" }],
				_kf: true,
			},
			SessionInfo: {
				_kf: true,
				Meeting: { Name: "Australian Grand Prix" },
				ArchiveStatus: { Status: "Generating" },
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
				ArchiveStatus: { Status: "Generating" },
				Name: "Race",
				Path: "2026/aus/race/",
			},
			messages: [{ Utc: "1", Category: "Flag", Flag: "RED", Message: "RED FLAG" }],
		});
		expect(startMock).toHaveBeenCalledTimes(1);
		expect(invokeMock).toHaveBeenCalledWith("Subscribe", ["SessionInfo", "RaceControlMessages"]);
		expect(stopMock).toHaveBeenCalledTimes(1);
	});

	test("keeps live timing connection open until subscribe resolves", async () => {
		let stopped = false;
		const stopMock = mock(async () => {
			stopped = true;
		});
		const invokeMock = mock(
			() =>
				new Promise<Record<string, unknown>>((resolve, reject) => {
					setTimeout(() => {
						if (stopped) {
							reject(new Error("connection stopped before subscribe resolved"));
							return;
						}

						resolve({
							RaceControlMessages: { Messages: [] },
							SessionInfo: currentSessionInfo(),
						});
					}, 0);
				}),
		);

		expect(
			fetchCurrentSessionRaceControlMessages(() => ({
				start: mock(async () => {}),
				stop: stopMock,
				invoke: invokeMock,
			})),
		).resolves.toEqual({
			session: currentSessionInfo(),
			messages: [],
		});
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
