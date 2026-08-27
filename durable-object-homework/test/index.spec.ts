import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Counter worker", () => {
	it("returns the current count (unit style)", async () => {
		const request = new IncomingRequest("http://example.com/count");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.json()).toEqual({ count: 0 });
	});

	it("increments the count (integration style)", async () => {
		const increment = await SELF.fetch("https://example.com/increment", {
			method: "POST",
		});
		expect(await increment.json()).toEqual({ count: 1 });

		const response = await SELF.fetch("https://example.com/count");
		expect(await response.json()).toEqual({ count: 1 });
	});
});
