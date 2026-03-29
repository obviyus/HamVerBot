import { fetchF1Calendar } from "~/calendar";
import { config as appConfig } from "~/config";
import { getLatestPath } from "~/database";
import { fetchDriverList, fetchResults } from "~/fetch";
import { getClient, initIrcClient } from "~/irc";
import { scheduleJobs } from "~/worker";

type ExitFn = typeof process.exit;
type OnFn = typeof process.on;

export async function start(): Promise<void> {
	const nickname = appConfig.irc.nickname;

	if (appConfig.irc.nickPassword === "password") {
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

	console.log(`Bot nickname: ${appConfig.irc.nickname}`);
	console.log(`Connecting to ${appConfig.irc.server}:${appConfig.irc.port}`);

	await initIrcClient({
		server: appConfig.irc.server,
		port: appConfig.irc.port,
		nickname: appConfig.irc.nickname,
		username: appConfig.irc.nickname,
		realname: appConfig.irc.realname,
		password: appConfig.irc.password,
		nickPassword: appConfig.irc.nickPassword,
		secure: appConfig.irc.useTls,
		channels: appConfig.irc.channels,
	});

	console.log(`${nickname} started successfully...`);
}

export function registerSignalHandlers(
	on: OnFn = process.on.bind(process),
	exit: ExitFn = process.exit,
): void {
	on("SIGINT", () => {
		console.log("Received SIGINT. Shutting down...");
		const client = getClient();
		client.quit("Grazzi ragazzi!");
		exit(0);
	});
}

export async function main(
	exit: ExitFn = process.exit,
	on: OnFn = process.on.bind(process),
): Promise<void> {
	try {
		await start();
		registerSignalHandlers(on, exit);
	} catch (error) {
		console.error("Error in main:", error);
		exit(1);
	}
}
