import assert from "node:assert/strict";
import { spyOn } from "bun:test";
import type { Socket } from "bun";
import * as database from "../../src/database";
import { initIrcClient, waitForIrcReady } from "../../src/irc";

spyOn(database, "getAllChannels").mockResolvedValue(["#audit"]);

const connected = Promise.withResolvers<Socket>();
const recovery = Promise.withResolvers<void>();
const joined = Promise.withResolvers<void>();
const pongWaiters = new Map<string, () => void>();
const outbound: string[] = [];
let currentNick = "HamVerBot";
let buffer = "";
let pingId = 0;

setTimeout(() => {
	console.error("Local IRC protocol test did not complete");
	process.exit(1);
}, 5000);

const server = Bun.listen({
	hostname: "127.0.0.1",
	port: 0,
	socket: {
		open(socket) {
			connected.resolve(socket);
		},
		data(socket, data) {
			buffer += data.toString();
			const lines = buffer.split("\r\n");
			buffer = lines.pop()!;
			for (const line of lines) {
				outbound.push(line);
				if (line.startsWith("CAP LS")) {
					socket.write(":audit CAP * LS :sasl\r\n");
				} else if (line.startsWith("NICK ")) {
					currentNick = line.slice(5);
					if (currentNick === "HamVerBot") {
						socket.write(":audit 433 * HamVerBot :Nickname is already in use\r\n");
					}
				} else if (line.startsWith("CAP REQ")) {
					socket.write(":audit CAP * ACK :sasl\r\n");
				} else if (line === "AUTHENTICATE PLAIN") {
					socket.write("AUTHENTICATE +\r\n");
				} else if (line.startsWith("AUTHENTICATE ")) {
					socket.write(
						`:audit 900 ${currentNick} ${currentNick}!bot@audit HamVerBot :Logged in\r\n` +
							`:audit 903 ${currentNick} :SASL authentication successful\r\n`,
					);
				} else if (line === "CAP END") {
					socket.write(`:audit 001 ${currentNick} :Welcome\r\n`);
				} else if (line === "PRIVMSG NickServ :REGAIN HamVerBot") {
					recovery.resolve();
				} else if (line === "JOIN #audit") {
					joined.resolve();
				} else if (line.startsWith("PONG ")) {
					const token = line.slice(5).replace(/^:/, "");
					pongWaiters.get(token)?.();
					pongWaiters.delete(token);
				}
			}
		},
	},
});

const client = await initIrcClient({
	server: "127.0.0.1",
	port: server.port,
	nickname: "HamVerBot",
	nickPassword: "fixture-password",
	channels: ["#audit"],
});
const socket = await connected.promise;

async function roundTrip(...lines: string[]): Promise<void> {
	const token = `audit-${++pingId}`;
	const pong = new Promise<void>((resolve) => pongWaiters.set(token, resolve));
	socket.write([...lines, `PING :${token}`, ""].join("\r\n"));
	await pong;
}

await recovery.promise;
assert.match(currentNick, /^HVB[0-9a-f]{6}$/);
assert.equal(
	outbound.some((line) => line.startsWith("JOIN ")),
	false,
);
assert.equal(
	outbound.some((line) => line.startsWith("MODE ")),
	false,
);
await roundTrip(
	`:audit 900 ${currentNick} ${currentNick}!bot@audit HamVerBot :Logged in`,
	`:reader!reader@audit PRIVMSG ${currentNick} :!ping`,
	":someoneelse!reader@audit NICK :HamVerBot",
);
assert.equal(outbound.filter((line) => line.includes("REGAIN")).length, 1);
assert.equal(
	outbound.some((line) => line.startsWith("JOIN ")),
	false,
);
assert.equal(
	outbound.some((line) => line.endsWith(" pong")),
	false,
);

socket.write(`:${currentNick}!bot@audit NICK :HamVerBot\r\n`);
await waitForIrcReady();
await joined.promise;
assert.equal(client.user.nick, "HamVerBot");
assert.deepEqual(
	outbound.filter((line) => line.startsWith("JOIN ")),
	["JOIN #audit"],
);
assert.deepEqual(
	outbound.filter((line) => line.startsWith("MODE ")),
	["MODE HamVerBot +B"],
);

await roundTrip(":reader!reader@audit PRIVMSG HamVerBot :!ping");
await roundTrip();
assert.deepEqual(
	outbound.filter((line) => line.endsWith(" pong")),
	["PRIVMSG reader pong"],
);

await roundTrip(":HamVerBot!bot@audit NICK :HamVerBot_");
await roundTrip(":reader!reader@audit PRIVMSG hamverbot_ :!ping");
await roundTrip();
assert.deepEqual(
	outbound.filter((line) => line.endsWith(" pong")),
	["PRIVMSG reader pong", "PRIVMSG reader pong"],
);

await roundTrip(
	":reader!reader@audit NOTICE #audit :!ping",
	":reader!reader@audit PRIVMSG #audit :\x01ACTION !ping\x01",
	":reader!reader@audit PRIVMSG #audit :!ping",
);
await roundTrip();
assert.deepEqual(
	outbound.filter((line) => line.startsWith("PRIVMSG #")),
	["PRIVMSG #audit pong"],
);
assert.equal(outbound.filter((line) => line.includes("REGAIN")).length, 1);
console.log("Real IRC protocol checks passed on loopback only");
process.exit(0);
