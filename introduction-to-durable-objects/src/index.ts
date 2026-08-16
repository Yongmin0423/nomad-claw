export {DurablePotato} from "./do";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === "/") {
			const dp = env.DP.getByName('default');
			//네트워크 작업이 필요하기 때문에 await 키워드를 붙인다.
			return new Response(await dp.increase());
		}
		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;
