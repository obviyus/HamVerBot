import { fetchF1Calendar } from "~/calendar";
import { config as appConfig } from "~/config";
import { getLatestPath } from "~/database";
import { fetchDriverList, fetchResults } from "~/fetch";
import { getClient, initIrcClient } from "~/irc";
import { scheduleJobs } from "~/worker";

type ExitFn = typeof process.exit;
type OnFn = typeof process.on;

const defaultExit: ExitFn = (code) => process.exit(code);
const defaultOn: OnFn = (...args) => process.on(...args);

export async function start(): Promise<void> {
	const { irc } = appConfig;

	if (irc.nickPassword === "password") {
		console.warn(
			"WARNING: Using default NickServ password. Set IRC_NICK_PASSWORD in your .env file.",
		);
		console.warn("If this nickname is registered, authentication will fail.");
	}

	console.log("Starting...");

	await fetchF1Calendar();

	const latestPath = await getLatestPath();
	if (latestPath) {
		await fetchDriverList(latestPath);
		await fetchResults(latestPath);
	}

	scheduleJobs();
	console.log("Scheduled all cron jobs");

	console.log(`Bot nickname: ${irc.nickname}`);
	console.log(`Connecting to ${irc.server}:${irc.port}`);

	await initIrcClient({
		server: irc.server,
		port: irc.port,
		nickname: irc.nickname,
		username: irc.nickname,
		realname: irc.realname,
		password: irc.password,
		nickPassword: irc.nickPassword,
		secure: irc.useTls,
		channels: irc.channels,
	});

	console.log(`${irc.nickname} started successfully...`);
}

export function registerSignalHandlers(
	on: OnFn = defaultOn,
	exit: ExitFn = defaultExit,
): void {
	on("SIGINT", () => {
		console.log("Received SIGINT. Shutting down...");
		getClient().quit("Grazzi ragazzi!");
		exit(0);
	});
}

export async function main(
	exit: ExitFn = defaultExit,
	on: OnFn = defaultOn,
): Promise<void> {
	try {
		await start();
		registerSignalHandlers(on, exit);
	} catch (error) {
		console.error("Error in main:", error);
		exit(1);
	}
}
