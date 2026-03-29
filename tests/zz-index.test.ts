import { beforeEach, describe, expect, mock, test } from "bun:test";

const fetchF1CalendarMock = mock(async () => {});
const scheduleJobsMock = mock(() => {});
const getLatestPathMock = mock(async () => null as string | null);
const fetchDriverListMock = mock(async (_path: string) => {});
const fetchResultsMock = mock(async (_path: string) => {});
const initIrcClientMock = mock(async (_config: unknown) => ({}));
const quitMock = mock((_message?: string) => {});
const getClientMock = mock(() => ({ quit: quitMock }));

const exitMock = mock((_code?: number) => {});
const onMock = mock((_event: string, _listener: () => void) => process);

const appConfig = {
	irc: {
		nickname: "HamVerBot",
		nickPassword: "secret",
		password: "serverpass",
		realname: "Steward",
		server: "irc.libera.chat",
		port: 6697,
		useTls: true,
		channels: ["#f1"],
	},
};

async function loadAppModule() {
	void mock.module("~/calendar", () => ({
		fetchF1Calendar: fetchF1CalendarMock,
	}));
	void mock.module("~/worker", () => ({
		scheduleJobs: scheduleJobsMock,
	}));
	void mock.module("~/database", () => ({
		getLatestPath: getLatestPathMock,
	}));
	void mock.module("~/fetch", () => ({
		fetchDriverList: fetchDriverListMock,
		fetchResults: fetchResultsMock,
	}));
	void mock.module("~/irc", () => ({
		getClient: getClientMock,
		initIrcClient: initIrcClientMock,
	}));
	void mock.module("~/config", () => ({
		config: appConfig,
	}));

	return import(`../src/app.ts?test=${crypto.randomUUID()}`);
}

beforeEach(() => {
	mock.restore();
	fetchF1CalendarMock.mockReset();
	scheduleJobsMock.mockReset();
	getLatestPathMock.mockReset();
	fetchDriverListMock.mockReset();
	fetchResultsMock.mockReset();
	initIrcClientMock.mockReset();
	quitMock.mockReset();
	getClientMock.mockReset();
	getClientMock.mockReturnValue({ quit: quitMock });
	exitMock.mockReset();
	onMock.mockReset();
});

describe("index startup", () => {
	test("start boots services in order", async () => {
		const calls: string[] = [];
		fetchF1CalendarMock.mockImplementation(async () => {
			calls.push("calendar");
		});
		getLatestPathMock.mockImplementation(async () => {
			calls.push("latestPath");
			return "2026/aus/race/";
		});
		fetchDriverListMock.mockImplementation(async () => {
			calls.push("driverList");
		});
		fetchResultsMock.mockImplementation(async () => {
			calls.push("results");
		});
		scheduleJobsMock.mockImplementation(() => {
			calls.push("schedule");
		});
		initIrcClientMock.mockImplementation(async () => {
			calls.push("irc");
			return {};
		});

		const { start } = await loadAppModule();
		calls.length = 0;

		await start();

		expect(calls).toEqual(["calendar", "latestPath", "driverList", "results", "schedule", "irc"]);
		expect(initIrcClientMock).toHaveBeenCalledWith({
			server: "irc.libera.chat",
			port: 6697,
			nickname: "HamVerBot",
			username: "HamVerBot",
			realname: "Steward",
			password: "serverpass",
			nickPassword: "secret",
			secure: true,
			channels: ["#f1"],
		});
	});

	test("start skips driver hydration when there is no latest result path", async () => {
		getLatestPathMock.mockResolvedValue(null);
		const { start } = await loadAppModule();

		await start();

		expect(fetchDriverListMock).not.toHaveBeenCalled();
		expect(fetchResultsMock).not.toHaveBeenCalled();
		expect(scheduleJobsMock).toHaveBeenCalled();
		expect(initIrcClientMock).toHaveBeenCalled();
	});

	test("registerSignalHandlers wires SIGINT shutdown", async () => {
		const { registerSignalHandlers } = await loadAppModule();

		registerSignalHandlers(onMock as typeof process.on, exitMock as typeof process.exit);

		expect(onMock).toHaveBeenCalledWith("SIGINT", expect.any(Function));
		const sigintHandler = onMock.mock.calls.at(-1)?.[1];
		if (typeof sigintHandler !== "function") {
			throw new Error("Missing SIGINT handler");
		}

		sigintHandler();

		expect(quitMock).toHaveBeenCalledWith("Grazzi ragazzi!");
		expect(exitMock).toHaveBeenCalledWith(0);
	});

	test("main exits when startup fails", async () => {
		fetchF1CalendarMock.mockRejectedValue(new Error("calendar down"));
		const { main } = await loadAppModule();

		await main(exitMock as typeof process.exit, onMock as typeof process.on);

		expect(initIrcClientMock).not.toHaveBeenCalled();
		expect(exitMock).toHaveBeenCalledWith(1);
	});
});
