import { env } from "cloudflare:workers";
import {
	SELF,
	runDurableObjectAlarm,
	runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

function waitForMessage(socket: WebSocket): Promise<string> {
	return new Promise((resolve) => {
		socket.addEventListener(
			"message",
			(event) => resolve(String(event.data)),
			{ once: true },
		);
	});
}

async function connect(roomId: string, nickname: string): Promise<WebSocket> {
	const response = await SELF.fetch(
		`https://example.com/ws?roomId=${roomId}&nickname=${nickname}`,
		{ headers: { Upgrade: "websocket" } },
	);

	expect(response.status).toBe(101);
	expect(response.webSocket).not.toBeNull();

	const socket = response.webSocket!;
	socket.accept();
	return socket;
}

describe("ChatRoom", () => {
	it("serves the chat page", async () => {
		const response = await SELF.fetch("https://example.com/");

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(await response.text()).toContain("Durable Object Chat");
	});

	it("broadcasts an incoming message to every connection and stores it", async () => {
		const alice = await connect("broadcast-room", "alice");
		const bob = await connect("broadcast-room", "bob");
		const aliceMessage = waitForMessage(alice);
		const bobMessage = waitForMessage(bob);

		alice.send("hello");

		await expect(aliceMessage).resolves.toBe("alice: hello");
		await expect(bobMessage).resolves.toBe("alice: hello");

		const room = env.CHAT_ROOM.getByName("broadcast-room");
		await runInDurableObject(room, async (_instance, state) => {
			const messages = state.storage.sql
				.exec<{ nickname: string; content: string }>(
					"SELECT nickname, content FROM messages ORDER BY id",
				)
				.toArray();

			expect(messages).toEqual([
				{ nickname: "alice", content: "hello" },
			]);
			expect(await state.storage.getAlarm()).not.toBeNull();
		});

		const historyResponse = await SELF.fetch(
			"https://example.com/message?roomId=broadcast-room",
		);
		expect(historyResponse.status).toBe(200);
		expect(await historyResponse.json()).toEqual([
			expect.objectContaining({ nickname: "alice", content: "hello" }),
		]);

		alice.close(1000, "Test finished");
		bob.close(1000, "Test finished");
	});

	it("deletes messages older than five minutes and schedules the next alarm", async () => {
		const room = env.CHAT_ROOM.getByName("alarm-room");

		await runInDurableObject(room, async (_instance, state) => {
			state.storage.sql.exec(
				`INSERT INTO messages (nickname, content, created_at)
				 VALUES ('old-user', 'old-message', datetime('now', '-6 minutes')),
				        ('new-user', 'new-message', CURRENT_TIMESTAMP)`,
			);
			await state.storage.setAlarm(Date.now() + 60_000);
		});

		expect(await runDurableObjectAlarm(room)).toBe(true);

		await runInDurableObject(room, async (_instance, state) => {
			const messages = state.storage.sql
				.exec<{ content: string }>(
					"SELECT content FROM messages ORDER BY id",
				)
				.toArray();

			expect(messages).toEqual([{ content: "new-message" }]);
			expect(await state.storage.getAlarm()).not.toBeNull();
		});
	});
});
