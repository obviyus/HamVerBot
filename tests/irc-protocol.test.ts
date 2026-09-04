import { expect, test } from "bun:test";

test("real IRC parser recovers its nickname and routes each command once", async () => {
	// A separate process keeps the unit tests' module mocks out of the real client.
	const child = Bun.spawn([process.execPath, `${import.meta.dir}/fixtures/irc-session.ts`], {
		env: { ...process.env, IRC_COMMAND_PREFIX: "!" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(exitCode, stdout + stderr).toBe(0);
	expect(stdout).toContain("Real IRC protocol checks passed on loopback only");
}, 10000);
