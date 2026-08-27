export {DurablePotato, ChatRoom} from "./do";
import {chatPage} from "./chat-page";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const {pathname, searchParams} = new URL(request.url);

		if (request.method === "GET" && pathname === "/") {
			return new Response(chatPage, {
				headers: {
					"Content-Type": "text/html; charset=UTF-8",
					"Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
					"X-Content-Type-Options": "nosniff",
				},
			});
		}

		if (request.method === "GET" && pathname === "/message") {
			const roomId = searchParams.get("roomId") ?? "public";
			const chatRoom = env.CHAT_ROOM.getByName(roomId);
			return Response.json(await chatRoom.getMessages());
		}

		if (request.method === "POST" && (pathname === "/increment" || pathname === "/decrement")) {
			const visitor = {
				ip: request.headers.get("CF-Connecting-IP"),
				city: request.cf?.city ?? null,
				country: request.cf?.country ?? null,
			};
			const counter = env.DP.getByName("default");
			const count = pathname === "/increment"
				? await counter.increment(visitor)
				: await counter.decrement(visitor);

			return Response.json({count});
		}

		if (request.method === "GET" && pathname === "/count") {
			const counter = env.DP.getByName("default");
			const count = await counter.getCount();

			return Response.json({count});
		}

		if (request.method === "GET" && pathname === "/history") {
			const counter = env.DP.getByName("default");
			const history = await counter.getHistory();

			return Response.json(history);
		}

		if (request.method === "GET" && pathname === "/ws") {
			const upgrade = request.headers.get('Upgrade');
			
			if (upgrade !== 'websocket') {
				return new Response('Expected Websocket', {
					status: 400,
				})
			}
			const roomId = searchParams.get('roomId') ?? 'public';
			const chatRoom =  env.CHAT_ROOM.getByName(roomId);

			return chatRoom.fetch(request);

			
		}

		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;
