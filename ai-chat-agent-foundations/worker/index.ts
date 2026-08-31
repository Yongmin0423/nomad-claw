import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const result = await streamText({
      messages:  await convertToModelMessages(this.messages),
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
    });
    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request, env) {
    const response = await routeAgentRequest(request, env);
    return response ?? new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
