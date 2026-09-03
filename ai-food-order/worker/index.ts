import {
  AIChatAgent,
  type OnChatMessageOptions,
} from "@cloudflare/ai-chat";
import { routeAgentRequest, type Connection } from "agents";
import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { sanitizeMessage } from "./sanitize";
import {
  MENU_ITEMS,
  createInitialOrderState,
  createOrderTools,
  type OrderState,
} from "./tools";

const SYSTEM_PROMPT = `
너는 한국 음식점의 친절한 주문 도우미다.

반드시 다음 규칙을 지켜라.
1. 메뉴를 추측하지 말고 getMenu로 실제 메뉴와 품절 여부를 확인한다.
2. 상품을 담을 때 getMenu가 반환한 정확한 상품 ID로 addToCart를 호출한다.
3. 주문 전에는 viewCart를 호출해 현재 항목과 총액을 확인하고 사용자에게 알려준다.
4. 사용자가 주문 확정을 명확히 요청한 경우에만 placeOrder를 호출한다.
5. placeOrder는 승인 전 실행되지 않는다. 승인 요청이 나타나면 사용자가 버튼을 누르도록 기다린다.
6. 가까운 매장이나 배달 위치가 필요하면 getLocation을 호출한다.
7. 카드 번호, 보안 코드, 계좌 비밀번호를 요구하지 않는다. 이 앱은 실제 결제를 처리하지 않는다.
8. 도구 결과를 짧고 자연스러운 한국어로 설명한다.
9. 한 요청을 처리하는 데 여러 도구가 필요하면 필요한 순서대로 계속 호출한다.
`;

export class FoodOrderAgent extends AIChatAgent<Env, OrderState> {
  initialState: OrderState = createInitialOrderState();

  validateStateChange(
    nextState: OrderState,
    source: Connection | "server",
  ): void {
    if (source !== "server") {
      throw new Error("주문 상태는 서버에서만 변경할 수 있습니다.");
    }

    for (const line of nextState.cart) {
      const menuItem = MENU_ITEMS.find((item) => item.id === line.itemId);

      if (
        !menuItem ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 20 ||
        line.name !== menuItem.name ||
        line.unitPrice !== menuItem.price
      ) {
        throw new Error("유효하지 않은 장바구니 상태입니다.");
      }
    }
  }

  protected sanitizeMessageForPersistence(message: UIMessage): UIMessage {
    return sanitizeMessage(message);
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    const tools: ToolSet = createOrderTools({
      getState: () => this.state,
      setState: (state) => this.setState(state),
    });

    const result = streamText({
      model: workersAI("@cf/zai-org/glm-4.7-flash", {
        reasoning_effort: null,
        chat_template_kwargs: { enable_thinking: false },
      }),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: isLoopFinished(),
      temperature: 0.2,
      maxOutputTokens: 500,
      abortSignal: options?.abortSignal,
      onFinish,
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
