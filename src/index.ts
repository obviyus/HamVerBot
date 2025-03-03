import { config as appConfig } from "~/config";
import { getClient, initIrcClient } from "~/irc";
import { scheduleJobs } from "~/worker";

async function main() {
	const nickname = appConfig.irc.nickname;

	// Check for default passwords
	if (appConfig.irc.nickPassword === "password") {
		console.warn(
			"WARNING: Using default NickServ password. Set IRC_NICK_PASSWORD in your .env file.",
		);
		console.warn("If this nickname is registered, authentication will fail.");
	}

	console.log("Starting...");

	// Register all cron jobs
	scheduleJobs();
	console.log("Scheduled all cron jobs");

	console.log(`Bot nickname: ${appConfig.irc.nickname}`);
	console.log(`Connecting to ${appConfig.irc.server}:${appConfig.irc.port}`);

	try {
		// Initialize the IRC client with our configuration
		await initIrcClient({
			server: appConfig.irc.server,
			port: appConfig.irc.port,
			nickname: appConfig.irc.nickname,
			username: appConfig.irc.nickname,
			realname: appConfig.irc.realname,
			password: appConfig.irc.password,
			secure: appConfig.irc.useTls,
			channels: appConfig.irc.channels,
		});

		console.log(`${nickname} started successfully...`);

		// Handle graceful shutdown
		process.on("SIGINT", () => {
			console.log("Received SIGINT. Shutting down...");
			const client = getClient();
			client.quit("Grazzi ragazzi!");
			process.exit(0);
		});
	} catch (error) {
		console.error("Error initializing IRC client:", error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Error in main:", error);
	process.exit(1);
});
