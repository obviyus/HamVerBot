import { CronJob } from "cron";
import {
	fetchWccStandings,
	fetchWdcStandings,
	readCurrentEvent,
	fetchResults,
	fetchNextEvent,
} from "~/fetch";
import { isEventDelivered } from "~/database";
import { broadcast } from "~/irc";
import { fetchF1Calendar } from "~/calendar";

/**
 * Enum representing different job types
 */
export enum JobType {
	Result = "result",
	Alert = "alert",
	Wcc = "wcc",
	Wdc = "wdc",
	CalendarRefresh = "calendar_refresh",
}

const jobHandlers: Record<JobType, () => Promise<unknown>> = {
	[JobType.Result]: resultWorker,
	[JobType.Alert]: alertWorker,
	[JobType.Wdc]: fetchWdcStandings,
	[JobType.Wcc]: fetchWccStandings,
	[JobType.CalendarRefresh]: fetchF1Calendar,
};

/**
 * Process a job based on its type
 * @param jobType - The type of job to process
 * @returns A promise that resolves when the job is complete
 */
export async function processJob(jobType: JobType) {
	try {
		return await jobHandlers[jobType]();
	} catch (error) {
		console.error(`Error processing job ${jobType}:`, error);
		// Don't throw the error further, just log it
		// This prevents the error from affecting the IRC connection
	}
}

function scheduleCron(expression: string, jobType: JobType, jobLabel: string): void {
	new CronJob(expression, async () => {
		try {
			await processJob(jobType);
		} catch (error) {
			console.error(`Error in ${jobLabel} job:`, error);
		}
	}).start();
}

/**
 * Check if a new result is posted on the F1 API
 * If so, fetch the results and broadcast them to channels
 * @returns A promise that resolves when the job is complete
 */
async function resultWorker(): Promise<void> {
	console.log(`Checking for new results at ${new Date().toISOString()}`);

	try {
		const { path, isComplete } = await readCurrentEvent();
		const delivered = await isEventDelivered(path);

		if (isComplete && !delivered) {
			const standings = await fetchResults(path);
			// Only broadcast if we successfully stored the result (marks delivered)
			const deliveredNow = await isEventDelivered(path);
			if (deliveredNow) {
				await broadcast(standings);
			} else {
				console.log(`Results not stored for ${path}; skipping broadcast to avoid spam`);
			}
		}
	} catch (error) {
		console.error("Error in result worker:", error);
		// Don't throw the error further, just log it
		// This prevents the error from affecting the IRC connection
	}
}

/**
 * Check if the next scheduled event is within 5 minutes
 * If so, broadcast a message to channels
 * @returns A promise that resolves when the job is complete
 */
async function alertWorker(): Promise<void> {
	try {
		const event = await fetchNextEvent();

		if (event) {
			await broadcast(event);
		}
	} catch (error) {
		console.error("Error in alert worker:", error);
		// Don't throw the error further, just log it
		// This prevents the error from affecting the IRC connection
	}
}

/**
 * Schedule jobs to run at specific intervals
 */
export function scheduleJobs(): void {
	scheduleCron("*/5 * * * *", JobType.Result, "result");
	scheduleCron("*/5 * * * *", JobType.Alert, "alert");
	scheduleCron("0 * * * *", JobType.Wdc, "WDC standings");
	scheduleCron("0 * * * *", JobType.Wcc, "WCC standings");
	scheduleCron("0 0 * * *", JobType.CalendarRefresh, "calendar refresh");
}
