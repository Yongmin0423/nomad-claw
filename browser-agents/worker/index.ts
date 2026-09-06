import { Buffer } from "node:buffer";
import puppeteer from "@cloudflare/puppeteer";
import type { Browser, Page } from "@cloudflare/puppeteer";
import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod/v4";


const auditUrlSchema = z
  .url()
  .refine((url) => {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use http:// or https://");

function createSeoAuditTool(browserBinding: Env["BROWSER"]) {
  return tool({
    description:
      "Visit a public web page in a real browser and run the eight-item SEO audit. Use this whenever the user asks to audit a URL.",
    inputSchema: z.object({
      url: auditUrlSchema.meta({
        description: "The complete http:// or https:// URL to audit",
      }),
    }),
    execute: async ({ url }) => {
      const browser = await puppeteer.launch(browserBinding);

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });

        const checks = await page.evaluate(() => {
          type BrowserElement = {
            textContent: string | null;
            getAttribute(name: string): string | null;
            hasAttribute(name: string): boolean;
          };
          type BrowserDocument = {
            querySelector(selector: string): BrowserElement | null;
            querySelectorAll(selector: string): ArrayLike<BrowserElement>;
            documentElement: BrowserElement;
          };
          const browserDocument = (
            globalThis as typeof globalThis & { document: BrowserDocument }
          ).document;

          const title =
            browserDocument.querySelector("title")?.textContent?.trim() ?? null;
          const description =
            browserDocument
              .querySelector('meta[name="description"]')
              ?.getAttribute("content")
              ?.trim() ?? null;
          const headings = Array.from(
            browserDocument.querySelectorAll("h1"),
          ).map((heading) => heading.textContent?.trim() ?? "");
          const images = Array.from(browserDocument.querySelectorAll("img"));
          const imagesMissingAlt = images
            .filter((image) => !image.hasAttribute("alt"))
            .map((image) => image.getAttribute("src") ?? "(no src)");
          const ogTitle =
            browserDocument
              .querySelector('meta[property="og:title"]')
              ?.getAttribute("content")
              ?.trim() ?? null;
          const ogImage =
            browserDocument
              .querySelector('meta[property="og:image"]')
              ?.getAttribute("content")
              ?.trim() ?? null;
          const canonical =
            browserDocument
              .querySelector('link[rel~="canonical"]')
              ?.getAttribute("href")
              ?.trim() ?? null;
          const viewport =
            browserDocument
              .querySelector('meta[name="viewport"]')
              ?.getAttribute("content")
              ?.trim() ?? null;
          const lang =
            browserDocument.documentElement.getAttribute("lang")?.trim() ?? null;

          return [
            {
              id: "title",
              label: "Title (10–60 characters)",
              passed: title !== null && title.length >= 10 && title.length <= 60,
              found: { value: title, length: title?.length ?? 0 },
            },
            {
              id: "description",
              label: "Meta description (50–160 characters)",
              passed:
                description !== null &&
                description.length >= 50 &&
                description.length <= 160,
              found: { value: description, length: description?.length ?? 0 },
            },
            {
              id: "h1",
              label: "Exactly one H1",
              passed: headings.length === 1,
              found: { count: headings.length, values: headings },
            },
            {
              id: "image-alt",
              label: "Every image has an alt attribute",
              passed: imagesMissingAlt.length === 0,
              found: {
                imageCount: images.length,
                missingAltCount: imagesMissingAlt.length,
                missingAltSources: imagesMissingAlt,
              },
            },
            {
              id: "open-graph",
              label: "Open Graph title and image",
              passed: ogTitle !== null && ogImage !== null,
              found: { title: ogTitle, image: ogImage },
            },
            {
              id: "canonical",
              label: "Canonical link",
              passed: canonical !== null,
              found: { href: canonical },
            },
            {
              id: "viewport",
              label: "Viewport meta tag",
              passed: viewport !== null,
              found: { content: viewport },
            },
            {
              id: "html-lang",
              label: "HTML language attribute",
              passed: lang !== null,
              found: { value: lang },
            },
          ];
        });

        const passedCount = checks.filter((check) => check.passed).length;
        const screenshot = await page.screenshot({ type: "png" });

        return {
          requestedUrl: url,
          finalUrl: page.url(),
          score: passedCount * 12.5,
          passedCount,
          totalChecks: checks.length,
          checks,
          screenshot: `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`,
        };
      } finally {
        await browser.close();
      }
    },
    toModelOutput: ({ output }) => ({
      type: "json",
      value: {
        requestedUrl: output.requestedUrl,
        finalUrl: output.finalUrl,
        score: output.score,
        passedCount: output.passedCount,
        totalChecks: output.totalChecks,
        checks: output.checks,
      },
    }),
  });
}

export type BrowserAgentState = {
  liveUrl?: string;
};

export class BrowserAgent extends AIChatAgent<Env, BrowserAgentState> {
  initialState = {
    liveUrl: null,
  };
  browser?: Browser;
  page?: Page;

  async getPage() {
    if (this.page && this.browser?.connected) return this.page;

    this.browser = await puppeteer.launch(this.env.BROWSER, {
      recording: true,
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({
      width: 1280,
      height: 720,
    });

    await this.getLiveViewUrl();

    return this.page;
  }

async getLiveViewUrl() {
    if (!this.browser) return;

    const sessionId = this.browser.sessionId();

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/browser-rendering/devtools/browser/${sessionId}/json/list`,
      {
        headers: {
          Authorization: `Bearer ${this.env.API_TOKEN}`,
        },
      },
    );

    const data = (await res.json()) as {
      type: string;
      devtoolsFrontendUrl: string;
    }[];

    const url = data.find(
      (target) => target.type === "page",
    ).devtoolsFrontendUrl;

    const liveUrl = new URL(url);
    liveUrl.searchParams.set("mode", "tab");
    this.setState({
      liveUrl: liveUrl.toString(),
    });
  }

  async onChatMessage() {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const tools = {
      auditSeo: createSeoAuditTool(this.env.BROWSER),
    };

    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      system: `You are an SEO audit assistant. When the user provides a URL or asks for an SEO audit, call auditSeo exactly once.
After the tool returns, answer in the user's language. Report the code-calculated score out of 100, list every failed check, and give a concrete fix for each failure. Do not recalculate or invent the score. Mention that the screenshot is attached to the audit result. If all checks pass, say so clearly.`,
      messages: await convertToModelMessages(this.messages, { tools }),
      tools: {
        takeScreenshot: tool({
          description: "Take a screenshot of the page",
          inputSchema: z.object({}),
          execute: async () => {
            const page = await this.getPage();
            const buffer = await page.screenshot({ type: "png" });
            const key = `screenshot/${crypto.randomUUID()}.png`;
            await this.env.FILES.put(key, buffer, {
              httpMetadata: {
                contentType: "image/png",
              },
            });
            return {ok: true, filename:key,
              data: `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`,
            };
          },
          toModelOutput: ({ output }) => ({
            type: "json",
            value: {
              screenshot: output.data,
            },
          }),
        })
      },
      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL (request.url);
    if(url.pathname.startsWith("/screenshots")){
      const key = url.pathname.slice(1);
      const file = await env.FILES.get(key);
      if(file) return new Response (file.body, {
        headers: {
          "Content-Type": file.httpMetadata.contentType ?? "application/octet-stream",
        }
      }) 
    }
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>; 
