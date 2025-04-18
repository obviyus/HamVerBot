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

/**
 * Process a job based on its type
 * @param jobType - The type of job to process
 * @returns A promise that resolves when the job is complete
 */
export async function processJob(jobType: JobType) {
	try {
		switch (jobType) {
			case JobType.Result:
				return await resultWorker();
			case JobType.Alert:
				return await alertWorker();
			case JobType.Wdc:
				return await fetchWdcStandings();
			case JobType.Wcc:
				return await fetchWccStandings();
			case JobType.CalendarRefresh:
				return await fetchF1Calendar();
		}
	} catch (error) {
		console.error(`Error processing job ${jobType}:`, error);
		// Don't throw the error further, just log it
		// This prevents the error from affecting the IRC connection
	}
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
			await broadcast(standings);
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
	// Check for new results every 5 minutes
	new CronJob("*/5 * * * *", async () => {
		try {
			await processJob(JobType.Result);
		} catch (error) {
			console.error("Error in result job:", error);
			// Don't let the error propagate and potentially crash the application
		}
	}).start();

	// Check for upcoming events every 5 minutes
	new CronJob("*/5 * * * *", async () => {
		try {
			await processJob(JobType.Alert);
		} catch (error) {
			console.error("Error in alert job:", error);
			// Don't let the error propagate and potentially crash the application
		}
	}).start();

	// Refresh WDC standings every hour
	new CronJob("0 * * * *", async () => {
		try {
			await processJob(JobType.Wdc);
		} catch (error) {
			console.error("Error in WDC standings job:", error);
			// Don't let the error propagate and potentially crash the application
		}
	}).start();

	// Refresh WCC standings every hour
	new CronJob("0 * * * *", async () => {
		try {
			await processJob(JobType.Wcc);
		} catch (error) {
			console.error("Error in WCC standings job:", error);
			// Don't let the error propagate and potentially crash the application
		}
	}).start();

	// Refresh calendar once a day
	new CronJob("0 0 * * *", async () => {
		try {
			await processJob(JobType.CalendarRefresh);
		} catch (error) {
			console.error("Error in calendar refresh job:", error);
			// Don't let the error propagate and potentially crash the application
		}
	}).start();
}
