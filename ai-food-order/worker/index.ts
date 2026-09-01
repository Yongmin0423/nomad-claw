import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";

export class PotatoChatAgent extends AIChatAgent<Env> {}

export default {
  fetch(request, env) {
    return (
      routeAgentRequest(request, env) ?? new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
