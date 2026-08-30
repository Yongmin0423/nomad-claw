import { Agent, routeAgentRequest } from 'agents';

export class ChattingRoomAgent extends Agent<Env> {}

export default {
	async fetch(request, env) {
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
