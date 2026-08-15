export {DurablePotato} from "./do";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// DurablePotato의 stub를 불러온다. 
		// 해당 stub가 존재하지 않으면 새로 생성한다.
		// 해당 default라는 이름의 durable object는 유일하게 존재하게 된다.
		const stub = env.DP.getByName('default');
		return new Response(await stub.ping());
	},
} satisfies ExportedHandler<Env>;
