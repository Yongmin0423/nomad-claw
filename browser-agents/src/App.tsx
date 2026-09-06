import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { BrowserAgent, BrowserAgentState } from "../worker/index";

type SeoCheck = {
  id: string;
  label: string;
  passed: boolean;
  found: unknown;
};

type SeoAuditOutput = {
  finalUrl: string;
  score: number;
  passedCount: number;
  totalChecks: number;
  checks: SeoCheck[];
  screenshot: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSeoAuditOutput(value: unknown): value is SeoAuditOutput {
  return (
    isRecord(value) &&
    typeof value.finalUrl === "string" &&
    typeof value.score === "number" &&
    typeof value.passedCount === "number" &&
    typeof value.totalChecks === "number" &&
    Array.isArray(value.checks) &&
    value.checks.every(
      (check) =>
        isRecord(check) &&
        typeof check.id === "string" &&
        typeof check.label === "string" &&
        typeof check.passed === "boolean",
    ) &&
    typeof value.screenshot === "string" &&
    value.screenshot.startsWith("data:image/png;base64,")
  );
}

function SeoAuditCard({ output }: { output: SeoAuditOutput }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <div>
          <div className="text-xs font-medium text-zinc-500">SEO audit</div>
          <div className="max-w-sm truncate text-xs text-zinc-400">
            {output.finalUrl}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">{output.score}/100</div>
          <div className="text-[10px] text-zinc-500">
            {output.passedCount}/{output.totalChecks} passed
          </div>
        </div>
      </div>

      <img
        src={output.screenshot}
        alt={`Screenshot of the audited page at ${output.finalUrl}`}
        className="aspect-video w-full border-b border-zinc-200 object-cover object-top"
      />

      <ul className="divide-y divide-zinc-100">
        {output.checks.map((check) => (
          <li key={check.id} className="px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span aria-hidden="true">{check.passed ? "✅" : "❌"}</span>
              <span>{check.label}</span>
            </div>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-zinc-500">
              {JSON.stringify(check.found, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

function App() {
  const agent = useAgent<BrowserAgent, BrowserAgentState>({
    agent: "BrowserAgent",
  });
  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text")
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.text}
          </p>
        );
      if (part.type === "reasoning")
        return (
          <p key={i} className="text-xs italic text-zinc-500">
            {part.text}
          </p>
        );
      if (isToolUIPart(part)) {
        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1"
            >
              <div>
                <strong>Approve {getToolName(part)}?</strong>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-1">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="px-3 py-1 bg-green-500 text-white rounded"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: true,
                    })
                  }
                >
                  Approve
                </button>
                <button
                  className="px-3 py-1 bg-red-500 text-white rounded"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: false,
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          );
        }

        if (part.state === "output-denied") {
          return (
            <div
              key={i}
              className="text-sm bg-red-50 border border-red-300 p-2 rounded my-1"
            >
              <strong>{getToolName(part)}</strong> — Rejected
            </div>
          );
        }

        if (
          getToolName(part) === "auditSeo" &&
          part.state === "output-available" &&
          isSeoAuditOutput(part.output)
        ) {
          return <SeoAuditCard key={i} output={part.output} />;
        }

        return (
          <div
            key={i}
            className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {getToolName(part)}
              </span>
              <span className="text-zinc-500">{part.state}</span>
            </div>
            {"input" in part && part.input != null && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}
            {part.state === "output-available" && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            )}
          </div>
        );
      }
      return null;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            🔎 SEO Audit Agent
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              name="input"
              placeholder="Paste a URL to audit..."
              autoComplete="off"
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Send
            </button>
          </form>
          <button
            onClick={clearHistory}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            Clear
          </button>
          <button
            onClick={stop}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
          >
            Stop
          </button>
          <span className="shrink-0 text-xs text-zinc-400">{status}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 pb-24">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
              Paste a page URL to run an 8-point SEO audit.
            </div>
          )}
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-900"
                  }`}
                >
                  {renderMessage(message)}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default App;
