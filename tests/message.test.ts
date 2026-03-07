import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as database from "../src/database";
import * as fetchModule from "../src/fetch";
import * as irc from "../src/irc";
import * as liveTiming from "../src/live-timing";

const enableAutopostChannelMock = mock(async () => {});
const getLatestPathMock = mock(async () => null);
const getNextEventMock = mock(async () => null);
const isAutopostChannelEnabledMock = mock(async () => false);
const markAutopostMessagesSeenMock = mock(async () => {});

const fetchHeadToHeadMock = mock(async () => "h2h");
const fetchResultsMock = mock(async () => "results");
const returnWccStandingsMock = mock(async () => "wcc");
const returnWdcStandingsMock = mock(async () => "wdc");

const sendMessageMock = mock((_target: string, _message: string) => {});

const buildRaceControlMessageKeyMock = mock((message: { id: string }) => message.id);
const fetchCurrentSessionRaceControlMessagesMock = mock(async () => ({
	session: { Path: "2026/race/" },
	messages: [] as Array<{ id: string; shouldAutopost?: boolean }>,
}));
const fetchSessionPitStopsMock = mock(async () => "pit stops");
const fetchSessionStintsMock = mock(async () => "stints");
const fetchSessionWeatherMock = mock(async () => "weather");
const shouldAutopostRaceControlMessageMock = mock(
	(message: { shouldAutopost?: boolean }) => !!message.shouldAutopost,
);

const { handleIrcMessage } = await import("../src/message.ts");

beforeEach(() => {
	mock.restore();
	enableAutopostChannelMock.mockReset();
	getLatestPathMock.mockReset();
	getNextEventMock.mockReset();
	isAutopostChannelEnabledMock.mockReset();
	isAutopostChannelEnabledMock.mockResolvedValue(false);
	markAutopostMessagesSeenMock.mockReset();

	fetchHeadToHeadMock.mockReset();
	fetchResultsMock.mockReset();
	returnWccStandingsMock.mockReset();
	returnWdcStandingsMock.mockReset();

	sendMessageMock.mockReset();

	buildRaceControlMessageKeyMock.mockReset();
	buildRaceControlMessageKeyMock.mockImplementation((message: { id: string }) => message.id);
	fetchCurrentSessionRaceControlMessagesMock.mockReset();
	fetchCurrentSessionRaceControlMessagesMock.mockResolvedValue({
		session: { Path: "2026/race/" },
		messages: [],
	});
	fetchSessionPitStopsMock.mockReset();
	fetchSessionStintsMock.mockReset();
	fetchSessionWeatherMock.mockReset();
	shouldAutopostRaceControlMessageMock.mockReset();
	shouldAutopostRaceControlMessageMock.mockImplementation(
		(message: { shouldAutopost?: boolean }) => !!message.shouldAutopost,
	);
	spyOn(database, "enableAutopostChannel").mockImplementation(enableAutopostChannelMock);
	spyOn(database, "getLatestPath").mockImplementation(getLatestPathMock);
	spyOn(database, "getNextEvent").mockImplementation(getNextEventMock);
	spyOn(database, "isAutopostChannelEnabled").mockImplementation(isAutopostChannelEnabledMock);
	spyOn(database, "markAutopostMessagesSeen").mockImplementation(markAutopostMessagesSeenMock);
	spyOn(fetchModule, "fetchHeadToHead").mockImplementation(fetchHeadToHeadMock);
	spyOn(fetchModule, "fetchResults").mockImplementation(fetchResultsMock);
	spyOn(fetchModule, "returnWccStandings").mockImplementation(returnWccStandingsMock);
	spyOn(fetchModule, "returnWdcStandings").mockImplementation(returnWdcStandingsMock);
	spyOn(irc, "sendMessage").mockImplementation(sendMessageMock);
	spyOn(liveTiming, "buildRaceControlMessageKey").mockImplementation(buildRaceControlMessageKeyMock);
	spyOn(liveTiming, "fetchCurrentSessionRaceControlMessages").mockImplementation(
		fetchCurrentSessionRaceControlMessagesMock,
	);
	spyOn(liveTiming, "fetchSessionPitStops").mockImplementation(fetchSessionPitStopsMock);
	spyOn(liveTiming, "fetchSessionStints").mockImplementation(fetchSessionStintsMock);
	spyOn(liveTiming, "fetchSessionWeather").mockImplementation(fetchSessionWeatherMock);
	spyOn(liveTiming, "shouldAutopostRaceControlMessage").mockImplementation(
		shouldAutopostRaceControlMessageMock,
	);
});

afterEach(() => {
	mock.restore();
});

describe("handleIrcMessage", () => {
	test("replies to ping", async () => {
		await handleIrcMessage("ping", {
			target: "#f1",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(sendMessageMock).toHaveBeenCalledWith("#f1", "pong");
	});

	test("returns help text", async () => {
		await handleIrcMessage("help", {
			target: "#f1",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(sendMessageMock).toHaveBeenCalledWith(
			"#f1",
			expect.stringContaining("!enable autopost"),
		);
	});

	test("ignores unknown commands", async () => {
		await handleIrcMessage("unknown", {
			target: "#f1",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(sendMessageMock).not.toHaveBeenCalled();
	});

	test("validates h2h usage", async () => {
		await handleIrcMessage("h2h ver", {
			target: "#f1",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(sendMessageMock).toHaveBeenCalledWith("#f1", "Usage: !h2h VER HAM");
	});

	test("runs h2h with normalized driver codes", async () => {
		fetchHeadToHeadMock.mockResolvedValue("⚔️ result");

		await handleIrcMessage("h2h ver ham", {
			target: "#f1",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(fetchHeadToHeadMock).toHaveBeenCalledWith("VER", "HAM");
		expect(sendMessageMock).toHaveBeenCalledWith("#f1", "⚔️ result");
	});

	test("rejects enable autopost in private messages", async () => {
		await handleIrcMessage("enable autopost", {
			target: "obviyus",
			nick: "obviyus",
			isPrivate: true,
		});

		expect(sendMessageMock).toHaveBeenCalledWith(
			"obviyus",
			"Run this in the channel you want to enable.",
		);
	});

	test("rejects enable autopost from non-owners", async () => {
		await handleIrcMessage("enable autopost", {
			target: "#test",
			nick: "someoneelse",
			isPrivate: false,
		});

		expect(sendMessageMock).toHaveBeenCalledWith(
			"#test",
			"Only bot owners can enable autopost.",
		);
	});

	test("short-circuits when autopost is already enabled", async () => {
		isAutopostChannelEnabledMock.mockResolvedValue(true);

		await handleIrcMessage("enable autopost", {
			target: "#test",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(enableAutopostChannelMock).not.toHaveBeenCalled();
		expect(sendMessageMock).toHaveBeenCalledWith("#test", "Autopost already enabled here.");
	});

	test("enables autopost and seeds seen messages", async () => {
		fetchCurrentSessionRaceControlMessagesMock.mockResolvedValue({
			session: { Path: "2026/race/" },
			messages: [
				{ id: "red", shouldAutopost: true },
				{ id: "ignore", shouldAutopost: false },
				{ id: "penalty", shouldAutopost: true },
			],
		});

		await handleIrcMessage("enable autopost", {
			target: "#test",
			nick: "obviyus",
			isPrivate: false,
		});

		expect(markAutopostMessagesSeenMock).toHaveBeenCalledWith("2026/race/", ["red", "penalty"]);
		expect(enableAutopostChannelMock).toHaveBeenCalledWith("#test");
		expect(sendMessageMock).toHaveBeenCalledWith(
			"#test",
			"Autopost enabled in #test. Watching red flags, safety car, penalties.",
		);
	});
});
