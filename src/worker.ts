import { CronJob } from "cron";
import { fetchF1Calendar } from "~/calendar";
import {
	getAutopostChannels,
	getSeenAutopostMessageKeys,
	isEventDelivered,
	markAutopostMessagesSeen,
} from "~/database";
import {
	fetchNextEvent,
	fetchResults,
	fetchWccStandings,
	fetchWdcStandings,
	readCurrentEvent,
} from "~/fetch";
import { broadcast, sendMessage } from "~/irc";
import {
	buildRaceControlMessageKey,
	fetchCurrentSessionRaceControlMessages,
	formatAutopostRaceControlMessage,
	shouldAutopostRaceControlMessage,
} from "~/live-timing";

export enum JobType {
	Result = "result",
	Alert = "alert",
	Wcc = "wcc",
	Wdc = "wdc",
	CalendarRefresh = "calendar_refresh",
	Autopost = "autopost",
}

const jobHandlers: Record<JobType, () => Promise<unknown>> = {
	[JobType.Result]: async () => {
		console.log(`Checking for new results at ${new Date().toISOString()}`);
		const { path, isComplete } = await readCurrentEvent();
		if (!isComplete || (await isEventDelivered(path))) return;

		const standings = await fetchResults(path);
		if (await isEventDelivered(path)) {
			await broadcast(standings);
			return;
		}

		console.log(`Results not stored for ${path}; skipping broadcast to avoid spam`);
	},
	[JobType.Alert]: async () => {
		const event = await fetchNextEvent();
		if (event) {
			await broadcast(event);
		}
	},
	[JobType.Wcc]: () => fetchWccStandings(),
	[JobType.Wdc]: () => fetchWdcStandings(),
	[JobType.CalendarRefresh]: () => fetchF1Calendar(),
	[JobType.Autopost]: async () => {
		const channels = await getAutopostChannels();
		if (channels.length === 0) return;

		const { session, messages } = await fetchCurrentSessionRaceControlMessages();
		const relevantMessages = messages.filter(shouldAutopostRaceControlMessage);
		if (relevantMessages.length === 0) return;

		const seenKeys = await getSeenAutopostMessageKeys(session.Path);
		const newMessages = relevantMessages.filter((message) => {
			return !seenKeys.has(buildRaceControlMessageKey(message));
		});
		if (newMessages.length === 0) return;

		await markAutopostMessagesSeen(session.Path, newMessages.map(buildRaceControlMessageKey));

		for (const message of newMessages) {
			const formattedMessage = formatAutopostRaceControlMessage(session, message);
			for (const channel of channels) {
				sendMessage(channel, formattedMessage);
			}
		}
	},
};

const scheduledJobs: Array<[expression: string, jobType: JobType]> = [
	["*/5 * * * *", JobType.Result],
	["*/5 * * * *", JobType.Alert],
	["0 * * * *", JobType.Wdc],
	["0 * * * *", JobType.Wcc],
	["0 0 * * *", JobType.CalendarRefresh],
	["*/30 * * * * *", JobType.Autopost],
];

export async function processJob(jobType: JobType): Promise<void> {
	try {
		await jobHandlers[jobType]();
	} catch (error) {
		console.error(`Error processing job ${jobType}:`, error);
	}
}

export function scheduleJobs(): void {
	for (const [expression, jobType] of scheduledJobs) {
		new CronJob(expression, () => void processJob(jobType)).start();
	}
}
