import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const {text} = await generateText({
      messages:  await convertToModelMessages(this.messages),
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
    });
    return new Response(text);
  }
}

export default {
  async fetch(request, env) {
    const response = await routeAgentRequest(request, env);
    return response ?? new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
