// 작성해서 Cloudflare서버에 업로드하는 코드
// worker는 서버가 아니다. -> 사용자가 요청했을때만 작동하기 때문
// worker는 무상태(stateless)이다. -> 서버에 데이터를 저장하지 않는다.
// node환경에 있는 게 아니다. -> worker가 실행되는 특정한 런타임 환경이 따로 존재한다.
// worker의 default는 object를 export하는 것이다.

// request -> 사용자가 보낸 요청
// env -> 사용자가 요청할때 보낸 env 변수
// ctx -> 사용자가 요청할때 보낸 ctx 변수
export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		console.log(request.cf?.country);
		if (url.pathname === '/') {
			const count = Number(await env.DB.get('count'));
			await env.DB.put('count', `${count + 1}`);
			return new Response(`Count is ${count + 1}`);
		}
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
