import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as calendar from "../src/calendar";
import * as database from "../src/database";
import * as fetchModule from "../src/fetch";
import * as irc from "../src/irc";
import * as liveTiming from "../src/live-timing";

const fetchMocks = {
	fetchNextEvent: mock(async () => null),
	fetchResults: mock(async () => "results"),
	fetchWccStandings: mock(async () => null),
	fetchWdcStandings: mock(async () => null),
	readCurrentEvent: mock(async () => ({ path: "2026/race/", isComplete: false })),
};

const databaseMocks = {
	getAutopostChannels: mock(async () => [] as string[]),
	getSeenAutopostMessageKeys: mock(async () => new Set<string>()),
	isEventDelivered: mock(async () => false),
	markAutopostMessagesSeen: mock(async () => {}),
};

const ircMocks = {
	broadcast: mock(async () => {}),
	sendMessage: mock((_target: string, _message: string) => {}),
};

const calendarMocks = {
	fetchF1Calendar: mock(async () => {}),
};

const liveTimingMocks = {
	buildRaceControlMessageKey: mock((message: { id: string }) => message.id),
	fetchCurrentSessionRaceControlMessages: mock(async () => ({
		session: { Path: "2026/race/", Meeting: { Name: "Australian Grand Prix" }, Name: "Race" },
		messages: [] as Array<{ id: string; shouldAutopost?: boolean }>,
	})),
	formatAutopostRaceControlMessage: mock((_session: unknown, message: { id: string }) => `msg:${message.id}`),
	shouldAutopostRaceControlMessage: mock((message: { shouldAutopost?: boolean }) => !!message.shouldAutopost),
};

const cronJobs: Array<{ expression: string; started: boolean }> = [];

class FakeCronJob {
	expression: string;
	onTick: () => Promise<void> | void;
	started = false;

	constructor(expression: string, onTick: () => Promise<void> | void) {
		this.expression = expression;
		this.onTick = onTick;
		cronJobs.push(this);
	}

	start(): void {
		this.started = true;
	}
}

void mock.module("cron", () => ({
	CronJob: FakeCronJob,
}));

const { JobType, processJob, scheduleJobs } = await import("../src/worker.ts");

beforeEach(() => {
	mock.restore();
	fetchMocks.fetchNextEvent.mockReset();
	fetchMocks.fetchResults.mockReset();
	fetchMocks.fetchWccStandings.mockReset();
	fetchMocks.fetchWdcStandings.mockReset();
	fetchMocks.readCurrentEvent.mockReset();
	fetchMocks.readCurrentEvent.mockResolvedValue({ path: "2026/race/", isComplete: false });

	databaseMocks.getAutopostChannels.mockReset();
	databaseMocks.getAutopostChannels.mockResolvedValue([]);
	databaseMocks.getSeenAutopostMessageKeys.mockReset();
	databaseMocks.getSeenAutopostMessageKeys.mockResolvedValue(new Set());
	databaseMocks.isEventDelivered.mockReset();
	databaseMocks.isEventDelivered.mockResolvedValue(false);
	databaseMocks.markAutopostMessagesSeen.mockReset();

	ircMocks.broadcast.mockReset();
	ircMocks.sendMessage.mockReset();
	calendarMocks.fetchF1Calendar.mockReset();

	liveTimingMocks.buildRaceControlMessageKey.mockReset();
	liveTimingMocks.buildRaceControlMessageKey.mockImplementation((message: { id: string }) => message.id);
	liveTimingMocks.fetchCurrentSessionRaceControlMessages.mockReset();
	liveTimingMocks.fetchCurrentSessionRaceControlMessages.mockResolvedValue({
		session: { Path: "2026/race/", Meeting: { Name: "Australian Grand Prix" }, Name: "Race" },
		messages: [],
	});
	liveTimingMocks.formatAutopostRaceControlMessage.mockReset();
	liveTimingMocks.formatAutopostRaceControlMessage.mockImplementation(
		(_session: unknown, message: { id: string }) => `msg:${message.id}`,
	);
	liveTimingMocks.shouldAutopostRaceControlMessage.mockReset();
	liveTimingMocks.shouldAutopostRaceControlMessage.mockImplementation(
		(message: { shouldAutopost?: boolean }) => !!message.shouldAutopost,
	);

	cronJobs.length = 0;
	spyOn(fetchModule, "fetchNextEvent").mockImplementation(fetchMocks.fetchNextEvent);
	spyOn(fetchModule, "fetchResults").mockImplementation(fetchMocks.fetchResults);
	spyOn(fetchModule, "fetchWccStandings").mockImplementation(fetchMocks.fetchWccStandings);
	spyOn(fetchModule, "fetchWdcStandings").mockImplementation(fetchMocks.fetchWdcStandings);
	spyOn(fetchModule, "readCurrentEvent").mockImplementation(fetchMocks.readCurrentEvent);
	spyOn(database, "getAutopostChannels").mockImplementation(databaseMocks.getAutopostChannels);
	spyOn(database, "getSeenAutopostMessageKeys").mockImplementation(
		databaseMocks.getSeenAutopostMessageKeys,
	);
	spyOn(database, "isEventDelivered").mockImplementation(databaseMocks.isEventDelivered);
	spyOn(database, "markAutopostMessagesSeen").mockImplementation(
		databaseMocks.markAutopostMessagesSeen,
	);
	spyOn(irc, "broadcast").mockImplementation(ircMocks.broadcast);
	spyOn(irc, "sendMessage").mockImplementation(ircMocks.sendMessage);
	spyOn(calendar, "fetchF1Calendar").mockImplementation(calendarMocks.fetchF1Calendar);
	spyOn(liveTiming, "buildRaceControlMessageKey").mockImplementation(
		liveTimingMocks.buildRaceControlMessageKey,
	);
	spyOn(liveTiming, "fetchCurrentSessionRaceControlMessages").mockImplementation(
		liveTimingMocks.fetchCurrentSessionRaceControlMessages,
	);
	spyOn(liveTiming, "formatAutopostRaceControlMessage").mockImplementation(
		liveTimingMocks.formatAutopostRaceControlMessage,
	);
	spyOn(liveTiming, "shouldAutopostRaceControlMessage").mockImplementation(
		liveTimingMocks.shouldAutopostRaceControlMessage,
	);
});

afterEach(() => {
	mock.restore();
});

describe("processJob", () => {
	test("broadcasts new results only after delivery is confirmed", async () => {
		fetchMocks.readCurrentEvent.mockResolvedValue({ path: "2026/race/", isComplete: true });
		databaseMocks.isEventDelivered
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);
		fetchMocks.fetchResults.mockResolvedValue("race results");

		await processJob(JobType.Result);

		expect(fetchMocks.fetchResults).toHaveBeenCalledWith("2026/race/");
		expect(ircMocks.broadcast).toHaveBeenCalledWith("race results");
	});

	test("broadcasts upcoming event alerts", async () => {
		fetchMocks.fetchNextEvent.mockResolvedValue("5 minute warning");

		await processJob(JobType.Alert);

		expect(ircMocks.broadcast).toHaveBeenCalledWith("5 minute warning");
	});

	test("autoposts unseen race control messages to enabled channels", async () => {
		databaseMocks.getAutopostChannels.mockResolvedValue(["#test", "#f1"]);
		databaseMocks.getSeenAutopostMessageKeys.mockResolvedValue(new Set(["seen"]));
		liveTimingMocks.fetchCurrentSessionRaceControlMessages.mockResolvedValue({
			session: { Path: "2026/race/", Meeting: { Name: "Australian Grand Prix" }, Name: "Race" },
			messages: [
				{ id: "seen", shouldAutopost: true },
				{ id: "red", shouldAutopost: true },
				{ id: "ignore", shouldAutopost: false },
			],
		});

		await processJob(JobType.Autopost);

		expect(databaseMocks.markAutopostMessagesSeen).toHaveBeenCalledWith("2026/race/", ["red"]);
		expect(ircMocks.sendMessage).toHaveBeenCalledTimes(2);
		expect(ircMocks.sendMessage).toHaveBeenNthCalledWith(1, "#test", "msg:red");
		expect(ircMocks.sendMessage).toHaveBeenNthCalledWith(2, "#f1", "msg:red");
	});

	test("runs calendar refresh job", async () => {
		await processJob(JobType.CalendarRefresh);

		expect(calendarMocks.fetchF1Calendar).toHaveBeenCalled();
	});
});

describe("scheduleJobs", () => {
	test("registers and starts all cron jobs", () => {
		scheduleJobs();

		expect(cronJobs.map((job) => job.expression)).toEqual([
			"*/5 * * * *",
			"*/5 * * * *",
			"0 * * * *",
			"0 * * * *",
			"0 0 * * *",
			"*/30 * * * * *",
		]);
		expect(cronJobs.every((job) => job.started)).toBe(true);
	});
});
