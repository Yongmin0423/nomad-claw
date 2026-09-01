import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

type PublicGameState = {
  solved: boolean;
  questionCount: number;
  answer?: string;
};

const EXAMPLE_QUESTIONS = [
  "육지에 사나요?",
  "몸집이 큰가요?",
  "날개가 있나요?",
];

function App() {
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [isStartingNewGame, setIsStartingNewGame] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({ agent: "PotatoChatAgent" });
  const { messages, sendMessage, clearHistory, status, stop } = useAgentChat({
    agent,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const canAsk = status === "ready" && !gameState?.solved;

  useEffect(() => {
    if (status !== "ready") return;

    let cancelled = false;

    void agent
      .call("getGameState")
      .then((nextState) => {
        if (cancelled) return;

        setGameState(nextState as PublicGameState);
        setGameError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setGameError("게임 상태를 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agent, messages.length, status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  function askQuestion(text: string) {
    const question = text.trim();

    if (!question || !canAsk) return;

    sendMessage({ text: question });
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = event.currentTarget.elements.namedItem(
      "input",
    ) as HTMLInputElement;

    askQuestion(input.value);
    input.value = "";
  }

  async function handleNewGame() {
    setIsStartingNewGame(true);
    setGameError(null);

    try {
      stop();
      clearHistory();

      const nextState = (await agent.call(
        "newGame",
      )) as PublicGameState;

      setGameState(nextState);
    } catch {
      setGameError("새 게임을 시작하지 못했습니다.");
    } finally {
      setIsStartingNewGame(false);
    }
  }

  function renderMessage(message: UIMessage) {
    return message.parts.map((part, index) => {
      if (part.type !== "text") return null;

      return (
        <p key={index} className="whitespace-pre-wrap leading-7">
          {part.text}
        </p>
      );
    });
  }

  return (
    <div className="min-h-screen bg-[#f3efe5] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-900/10 bg-[#f3efe5]/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-emerald-950 text-xl text-white shadow-sm">
              ?
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
                Twenty Questions
              </p>
              <h1 className="text-lg font-bold tracking-tight">
                동물 스무고개
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleNewGame()}
            disabled={isBusy || isStartingNewGame}
            className="rounded-full border border-stone-900/15 bg-white/70 px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStartingNewGame ? "준비 중..." : "새 게임"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-40 pt-6 sm:px-6">
        <section className="mb-6 overflow-hidden rounded-[2rem] bg-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                카테고리 · 동물
              </span>
              <h2 className="mt-4 max-w-lg text-2xl font-bold leading-tight sm:text-3xl">
                질문으로 제가 생각한 동물을 맞혀보세요.
              </h2>
              <p className="mt-3 text-sm leading-6 text-emerald-100/75">
                특징을 하나씩 좁혀가세요. 정답이라고 생각하면 동물 이름을
                입력하면 됩니다.
              </p>
            </div>

            <div className="shrink-0 rounded-2xl bg-white/10 px-5 py-4 text-center">
              <p className="text-xs font-medium text-emerald-100/70">
                지금까지 질문
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {gameState?.questionCount ?? 0}
                <span className="ml-1 text-sm font-medium text-emerald-100/70">
                  회
                </span>
              </p>
            </div>
          </div>
        </section>

        {gameState?.solved && (
          <section className="mb-6 rounded-3xl border border-amber-300 bg-amber-100 px-5 py-5 text-amber-950 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
              Solved
            </p>
            <p className="mt-2 text-xl font-bold">
              정답은 {gameState.answer}였습니다! 🎉
            </p>
            <p className="mt-1 text-sm text-amber-800">
              새 게임을 누르면 다른 동물로 다시 시작합니다.
            </p>
          </section>
        )}

        {gameError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {gameError}
          </div>
        )}

        <section className="space-y-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="rounded-3xl border border-stone-900/10 bg-white/60 p-6 text-center shadow-sm">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-2xl">
                🐾
              </div>
              <h3 className="mt-4 font-bold">첫 질문을 던져보세요</h3>
              <p className="mt-1 text-sm text-stone-500">
                아래 예시를 누르거나 직접 질문할 수 있어요.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => askQuestion(question)}
                    disabled={!canAsk}
                    className="rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm font-medium transition hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <article
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-3xl px-5 py-3.5 text-[15px] shadow-sm sm:max-w-[78%] ${
                    isUser
                      ? "rounded-br-md bg-emerald-950 text-white"
                      : "rounded-bl-md border border-stone-900/10 bg-white text-stone-800"
                  }`}
                >
                  <p
                    className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${
                      isUser ? "text-emerald-200/70" : "text-stone-400"
                    }`}
                  >
                    {isUser ? "나" : "수수께끼 동물"}
                  </p>
                  {renderMessage(message)}
                </div>
              </article>
            );
          })}

          {isBusy && (
            <div className="flex justify-start">
              <div className="rounded-3xl rounded-bl-md border border-stone-900/10 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center gap-1.5" aria-label="답변 중">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="size-2 animate-pulse rounded-full bg-emerald-700"
                      style={{ animationDelay: `${dot * 160}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-900/10 bg-[#f3efe5]/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-stone-900/10 bg-white p-2 shadow-xl shadow-stone-900/10"
        >
          <input
            name="input"
            placeholder={
              gameState?.solved
                ? "새 게임을 시작해주세요."
                : "예: 물속에서 사나요?"
            }
            disabled={!canAsk}
            autoComplete="off"
            aria-label="질문 입력"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-stone-400 disabled:cursor-not-allowed"
          />

          {isBusy ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-200"
            >
              중지
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canAsk}
              className="rounded-xl bg-emerald-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              질문하기
            </button>
          )}
        </form>

        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-stone-500">
          {status === "error"
            ? "답변 중 문제가 발생했습니다. 다시 시도해주세요."
            : isBusy
              ? "AI가 지금까지의 대화를 바탕으로 답하고 있어요."
              : "정답은 서버에만 저장되며 AI가 직접 고르지 않습니다."}
        </p>
      </div>
    </div>
  );
}

export default App;
