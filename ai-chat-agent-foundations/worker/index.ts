import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { buyPlaneTicket, getLocation, getTickets, getWeather } from "./tools";

export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage(_onFinish: unknown, options: {abortSignal?: AbortSignal}) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const result = await streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      messages:  await convertToModelMessages(this.messages),
      tools: {
        getWeather,
        getLocation,
        getTickets,
        buyPlaneTicket,
      },
      abortSignal: options.abortSignal,
      stopWhen: stepCountIs(50),
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
