import {
  getToolApproval,
  getToolInput,
  getToolPartState,
  useAgentChat,
} from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart } from "ai";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { OrderState } from "../worker/tools";

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const QUICK_REQUESTS = [
  "메뉴를 보여줘",
  "김치찌개 한 개 담고 장바구니 보여줘",
  "내 위치에서 가까운 매장을 찾아줘",
];

function formatPrice(value: number): string {
  return currencyFormatter.format(value);
}

function getFulfillmentLabel(input: unknown): string {
  if (!input || typeof input !== "object" || !("fulfillment" in input)) {
    return "주문 방식 확인 중";
  }

  const fulfillment = input.fulfillment;

  if (!fulfillment || typeof fulfillment !== "object") {
    return "주문 방식 확인 중";
  }

  if ("type" in fulfillment && fulfillment.type === "delivery") {
    return "현재 위치로 배달";
  }

  if ("type" in fulfillment && fulfillment.type === "pickup") {
    return "매장 픽업";
  }

  return "주문 방식 확인 중";
}

function ToolPart({
  part,
  orderState,
  approve,
}: {
  part: Parameters<typeof getToolName>[0];
  orderState: OrderState | null;
  approve: (approvalId: string, approved: boolean) => void;
}) {
  const toolName = getToolName(part);
  const toolState = getToolPartState(part);

  if (toolName === "placeOrder" && toolState === "waiting-approval") {
    const approval = getToolApproval(part);
    const total =
      orderState?.cart.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      ) ?? 0;

    return (
      <section className="mt-3 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 text-stone-900 shadow-sm">
        <div className="border-b border-amber-200 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
            결제 승인 필요
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {getFulfillmentLabel(getToolInput(part))}
          </p>
        </div>

        <div className="space-y-2 px-4 py-4">
          {orderState?.cart.map((item) => (
            <div key={item.itemId} className="flex justify-between gap-4 text-sm">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium">
                {formatPrice(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}

          <div className="flex justify-between border-t border-amber-200 pt-3 text-base font-bold">
            <span>총 결제 금액</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-white/60 p-3">
          <button
            type="button"
            disabled={!approval}
            onClick={() => approval && approve(approval.id, false)}
            className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold transition hover:bg-stone-100 disabled:opacity-40"
          >
            거절
          </button>
          <button
            type="button"
            disabled={!approval || total === 0}
            onClick={() => approval && approve(approval.id, true)}
            className="rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-400 disabled:opacity-40"
          >
            Approve
          </button>
        </div>
      </section>
    );
  }

  const labels: Record<string, string> = {
    getMenu: "메뉴 조회",
    addToCart: "장바구니 담기",
    viewCart: "장바구니 조회",
    getLocation: "현재 위치 확인",
    placeOrder: "주문 처리",
  };
  const stateLabels: Record<string, string> = {
    loading: "준비 중",
    streaming: "입력 확인 중",
    approved: "승인됨",
    complete: "완료",
    error: "오류",
    denied: "거절됨",
  };

  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <span>{labels[toolName] ?? toolName}</span>
      <span className="text-stone-400">·</span>
      <span>{stateLabels[toolState] ?? toolState}</span>
    </div>
  );
}

function App() {
  const [orderState, setOrderState] = useState<OrderState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: "FoodOrderAgent",
    onStateUpdate: (state) => setOrderState(state as OrderState),
  });

  const {
    messages,
    sendMessage,
    addToolApprovalResponse,
    status,
    isStreaming,
    isRecovering,
    stop,
  } = useAgentChat({
    agent,
    autoContinueAfterToolResult: true,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      if (toolCall.toolName !== "getLocation") return;

      if (!navigator.geolocation) {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: {
            success: false,
            error: "이 브라우저는 위치 조회를 지원하지 않습니다.",
          },
        });
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10_000,
              maximumAge: 60_000,
            });
          },
        );

        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: {
            success: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: Math.round(position.coords.accuracy),
          },
        });
      } catch (error) {
        const errorMessage =
          error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
            ? error.message
            : "알 수 없는 오류";

        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: {
            success: false,
            error: `위치를 가져오지 못했습니다: ${errorMessage}`,
          },
        });
      }
    },
  });

  const isBusy =
    status === "submitted" ||
    status === "streaming" ||
    isStreaming ||
    isRecovering;
  const cartTotal =
    orderState?.cart.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    ) ?? 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    sendMessage({ text: trimmed });
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem(
      "message",
    ) as HTMLInputElement;
    submitText(input.value);
    input.value = "";
  }

  return (
    <div className="min-h-screen bg-[#f6f3ed] text-stone-900">
      <header className="border-b border-stone-900/10 bg-[#14332b] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200/70">
              AI Food Order
            </p>
            <h1 className="mt-1 text-xl font-bold">한끼 주문 도우미</h1>
          </div>
          <div className="rounded-full bg-white/10 px-4 py-2 text-sm">
            장바구니 {orderState?.cart.length ?? 0}종 · {formatPrice(cartTotal)}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 pb-36 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          {messages.length === 0 && (
            <div className="rounded-[2rem] bg-[#e6b94b] p-7 shadow-sm sm:p-9">
              <p className="text-sm font-semibold text-stone-700">오늘 무엇을 드실래요?</p>
              <h2 className="mt-2 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
                메뉴 탐색부터 장바구니, 주문 승인까지 대화로 해결하세요.
              </h2>
              <div className="mt-7 flex flex-wrap gap-2">
                {QUICK_REQUESTS.map((request) => (
                  <button
                    key={request}
                    type="button"
                    disabled={isBusy}
                    onClick={() => submitText(request)}
                    className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white disabled:opacity-40"
                  >
                    {request}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 space-y-4" aria-live="polite">
            {messages.map((message) => {
              const isUser = message.role === "user";

              return (
                <article
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-3xl px-5 py-4 shadow-sm sm:max-w-[78%] ${
                      isUser
                        ? "rounded-br-md bg-[#14332b] text-white"
                        : "rounded-bl-md border border-stone-900/10 bg-white"
                    }`}
                  >
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] opacity-50">
                      {isUser ? "나" : "주문 도우미"}
                    </p>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <p key={index} className="whitespace-pre-wrap leading-7">
                            {part.text}
                          </p>
                        );
                      }

                      if (isToolUIPart(part)) {
                        return (
                          <ToolPart
                            key={`${part.toolCallId}-${index}`}
                            part={part}
                            orderState={orderState}
                            approve={(approvalId, approved) =>
                              addToolApprovalResponse({ id: approvalId, approved })
                            }
                          />
                        );
                      }

                      return null;
                    })}
                  </div>
                </article>
              );
            })}

            {isBusy && (
              <div className="text-sm text-stone-500">
                {isRecovering ? "대화를 복구하는 중…" : "주문을 처리하는 중…"}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

        <aside className="h-fit rounded-[2rem] border border-stone-900/10 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">장바구니</h2>
            <span className="text-xs text-stone-400">서버 상태</span>
          </div>

          {orderState?.cart.length ? (
            <div className="mt-5 space-y-4">
              {orderState.cart.map((item) => (
                <div key={item.itemId} className="flex justify-between gap-4 text-sm">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="mt-0.5 text-stone-500">{item.quantity}개</p>
                  </div>
                  <p className="font-semibold">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </p>
                </div>
              ))}
              <div className="flex justify-between border-t border-stone-200 pt-4 font-bold">
                <span>총액</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
              아직 담은 메뉴가 없습니다.
            </p>
          )}

          {orderState?.lastOrder && (
            <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-bold">최근 주문 접수 완료</p>
              <p className="mt-1 font-mono text-xs text-emerald-700">
                {orderState.lastOrder.id}
              </p>
              <p className="mt-2">{formatPrice(orderState.lastOrder.total)}</p>
            </div>
          )}
        </aside>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-900/10 bg-[#f6f3ed]/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-stone-900/10 bg-white p-2 shadow-xl"
        >
          <input
            name="message"
            disabled={isBusy}
            autoComplete="off"
            placeholder="예: 불고기 하나 담아줘"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed"
          />
          {isBusy ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-bold text-red-700"
            >
              중지
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-xl bg-[#14332b] px-5 py-2.5 text-sm font-bold text-white"
            >
              보내기
            </button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-stone-500">
          카드번호 형태의 문자열은 대화 저장 전에 자동으로 가려집니다.
        </p>
      </div>
    </div>
  );
}

export default App;
