export {DurablePotato} from "./do";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams} = new URL(request.url);
		if (pathname === '/ws') {
			const roomId = searchParams.get('roomId') ?? 'public';
		const upgrade = request.headers.get('Upgrade');
		if (upgrade) {
			//여기서 websocket 연결을 수립한다.
			const dp = env.DP.getByName(roomId);
			return dp.fetch(request);
		}
	}
		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;
