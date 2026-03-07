const testFiles = [
	"./tests/config.unit.ts",
	"./tests/utils-events.unit.ts",
	"./tests/calendar.unit.ts",
	"./tests/live-timing.unit.ts",
	"./tests/database.unit.ts",
	"./tests/fetch.unit.ts",
	"./tests/message.unit.ts",
	"./tests/worker.unit.ts",
	"./tests/irc.unit.ts",
];

for (const testFile of testFiles) {
	const subprocess = Bun.spawnSync([process.execPath, "test", testFile], {
		stdout: "inherit",
		stderr: "inherit",
	});

	if (subprocess.exitCode !== 0) {
		process.exit(subprocess.exitCode);
	}
}
