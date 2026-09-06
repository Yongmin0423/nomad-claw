# SEO 감사 브라우저 에이전트 구현 설명

## 구현 목표

사용자가 채팅에 URL을 입력하면 에이전트가 Cloudflare Browser Run의 실제 Chromium 브라우저로 페이지를 방문한다. 렌더링된 DOM에서 8개 SEO 항목을 검사하고, 코드가 계산한 점수와 페이지 스크린샷을 반환한다. 이후 LLM은 검사 결과를 바탕으로 실패 항목과 수정 방법을 설명한다.

중요한 원칙은 다음과 같다.

- SEO 판정과 점수 계산은 LLM이 아니라 Worker 코드가 담당한다.
- LLM은 코드가 반환한 결과를 해석하고 설명만 한다.
- 한 번 감사할 때 브라우저를 열고, 작업이 끝나면 즉시 닫는다.
- 스크린샷은 채팅 UI에는 전달하지만 LLM 컨텍스트에는 넣지 않는다.

## 전체 구조

주요 파일은 다음과 같다.

- `worker/index.ts`: `auditSeo` 도구, Puppeteer 실행, SEO 검사, 점수 계산, LLM 호출
- `src/App.tsx`: 채팅 UI, 감사 결과 카드, 스크린샷과 8개 검사 결과 렌더링
- `wrangler.jsonc`: AI, Durable Object, Browser Run 바인딩 설정
- `worker-configuration.d.ts`: Wrangler가 생성한 바인딩 타입
- `package.json`: Agents SDK, AI SDK, Puppeteer 등 의존성과 실행 명령

전체 요청 흐름은 다음과 같다.

```text
사용자가 URL 전송
  → React의 useAgentChat
  → BrowserAgent.onChatMessage()
  → LLM이 auditSeo 도구 호출
  → env.BROWSER로 Chromium 실행
  → page.goto(url)
  → page.evaluate()로 DOM 검사
  → 코드에서 점수 계산
  → page.screenshot() 실행
  → 브라우저 종료
  → UI에는 결과 카드와 스크린샷 표시
  → LLM은 실패 항목과 수정 방법을 채팅으로 설명
```

## Wrangler 바인딩

`wrangler.jsonc`에는 세 가지 핵심 바인딩이 있다.

### `AI`

Workers AI 모델을 호출하기 위한 바인딩이다.

```jsonc
"ai": {
  "binding": "AI"
}
```

로컬 개발에서도 AI 바인딩은 원격 리소스에 접근한다. 따라서 `pnpm dev` 실행 시 사용 요금 가능성을 알리는 경고가 나타날 수 있으며, 이는 오류가 아니다.

### `BrowserAgent`

`AIChatAgent`를 Durable Object로 실행하고 대화 상태를 유지하기 위한 바인딩이다.

```jsonc
"durable_objects": {
  "bindings": [
    {
      "class_name": "BrowserAgent",
      "name": "BrowserAgent"
    }
  ]
}
```

### `BROWSER`

Cloudflare Browser Run에 연결되는 바인딩이다.

```jsonc
"browser": {
  "binding": "BROWSER"
}
```

Worker에서는 이 바인딩을 `puppeteer.launch(this.env.BROWSER)`에 전달한다.

### 주석 처리한 `worker_loaders`

`worker_loaders`는 런타임에 별도의 Dynamic Worker를 만드는 기능이다. 현재 SEO 감사에는 필요하지 않다. 이 바인딩이 활성화되면 Workers Free 플랜 배포가 `code: 10195`로 거부되므로 설정은 이유와 함께 주석으로 보존했다.

```jsonc
// Disabled because Dynamic Workers require the Workers Paid plan.
// Keep this commented out when deploying on the Workers Free plan.
// "worker_loaders": [
//   {
//     "binding": "LOADER"
//   }
// ]
```

`worker-configuration.d.ts`는 직접 작성하지 않는다. 바인딩을 변경한 뒤 다음 명령으로 다시 생성한다.

```powershell
pnpm exec wrangler types
```

## `auditSeo` 도구 구현

도구는 `worker/index.ts`의 `createSeoAuditTool()`에서 만들어지고, `onChatMessage()`에서 `auditSeo`라는 이름으로 모델에 전달된다.

```ts
const tools = {
  auditSeo: createSeoAuditTool(this.env.BROWSER),
};
```

### URL 검증

입력은 Zod 스키마로 검증한다. 유효한 URL이면서 프로토콜이 `http:` 또는 `https:`인 경우만 허용한다.

```ts
const auditUrlSchema = z
  .url()
  .refine((url) => {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use http:// or https://");
```

이 검증은 `file:`, `javascript:` 같은 프로토콜이 브라우저로 전달되는 것을 막는다. 공개 서비스로 확장한다면 허용 또는 차단할 호스트 정책도 추가로 고려할 수 있다.

### 브라우저 실행과 페이지 이동

감사를 시작할 때 새 브라우저와 페이지를 만든다.

```ts
const browser = await puppeteer.launch(browserBinding);
const page = await browser.newPage();

await page.setViewport({ width: 1280, height: 720 });
await page.goto(url, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
```

- 뷰포트는 `1280 × 720`이다.
- `domcontentloaded`까지 기다린 뒤 DOM을 검사한다.
- 페이지 이동 제한 시간은 30초다.
- 리다이렉트가 발생하면 `page.url()`로 최종 URL도 반환한다.

### `page.evaluate()`와 실행 컨텍스트

SEO 검사는 모두 하나의 `page.evaluate()` 안에서 실행된다. 이 함수 내부 코드는 Worker가 아니라 방문한 페이지의 브라우저 컨텍스트에서 실행되므로 실제 `document`를 조회할 수 있다.

Worker용 TypeScript 설정에는 브라우저 DOM 전역 타입이 없기 때문에, 코드에서는 `BrowserElement`와 `BrowserDocument`라는 최소 타입을 선언했다. 이 타입은 런타임 객체를 만드는 것이 아니라 `page.evaluate()` 내부의 `document` 사용을 TypeScript에 설명하는 역할만 한다.

DOM 요소 자체는 Worker로 반환할 수 없으므로 문자열, 숫자, 불리언, 배열, 일반 객체로 변환해서 반환한다.

## 8개 SEO 검사

각 검사 결과는 같은 형태를 가진다.

```ts
{
  id: "title",
  label: "Title (10–60 characters)",
  passed: true,
  found: {
    value: "찾은 실제 값",
    length: 20
  }
}
```

`passed`는 통과 여부이고, `found`에는 페이지에서 실제로 발견한 값 또는 개수를 넣는다.

| 번호 | 검사 | 통과 조건 | `found`에 기록하는 값 |
|---:|---|---|---|
| 1 | `<title>` | 존재하며 10~60자 | 제목 문자열, 길이 |
| 2 | `<meta name="description">` | 존재하며 50~160자 | `content`, 길이 |
| 3 | `<h1>` | 정확히 1개 | 개수, 모든 H1 텍스트 |
| 4 | `<img alt>` | 모든 이미지에 `alt` 속성이 존재 | 전체 이미지 수, 누락 수, 누락 이미지 `src` |
| 5 | Open Graph | `og:title`과 `og:image`가 모두 존재 | 두 `content` 값 |
| 6 | Canonical | `<link rel="canonical">`이 존재 | `href` 값 |
| 7 | Viewport | `<meta name="viewport">`가 존재 | `content` 값 |
| 8 | HTML 언어 | `<html>`에 `lang` 속성이 존재 | `lang` 값 |

빈 문자열인 속성도 “속성이 존재함”으로 취급하는 항목이 있다. 예를 들어 이미지 검사는 `hasAttribute("alt")`를 사용하므로 장식용 이미지의 `alt=""`는 통과한다. 이미지가 하나도 없는 페이지 역시 “alt가 누락된 이미지가 없음”으로 통과한다.

## 점수 계산

점수는 도구 실행 코드가 계산한다.

```ts
const passedCount = checks.filter((check) => check.passed).length;
const score = passedCount * 12.5;
```

검사는 총 8개이므로 한 항목당 12.5점이며, 가능한 점수는 다음과 같다.

```text
0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100
```

LLM에는 “점수를 다시 계산하거나 임의로 만들지 말고 도구가 반환한 점수를 그대로 사용하라”고 시스템 프롬프트로 지시한다.

## 스크린샷 처리

DOM 검사가 끝나면 현재 뷰포트를 PNG로 캡처한다.

```ts
const screenshot = await page.screenshot({ type: "png" });

const screenshotDataUrl =
  `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;
```

Puppeteer가 반환한 바이너리를 Base64 데이터 URL로 바꾸면 JSON 도구 결과에 포함할 수 있고, React에서는 그대로 `<img src={...}>`에 사용할 수 있다.

현재 설정은 `fullPage: true`가 아니므로 전체 문서가 아니라 `1280 × 720` 뷰포트 스크린샷을 만든다. 이는 결과 크기와 저장량을 줄이기 위한 선택이다.

## 브라우저 사용 시간 최소화

브라우저는 도구 호출마다 새로 열고 반드시 `finally`에서 닫는다.

```ts
const browser = await puppeteer.launch(browserBinding);

try {
  // 페이지 이동, DOM 검사, 스크린샷
} finally {
  await browser.close();
}
```

페이지 이동이나 DOM 검사에서 예외가 발생해도 `finally`는 실행된다. 따라서 실패한 요청이 브라우저 세션을 불필요하게 열어둔 채 사용 시간을 계속 소비하는 상황을 줄인다.

Workers Free 플랜의 Browser Run 제공량은 하루 10분이다. 새 브라우저 인스턴스 생성에도 제한이 있으므로 짧은 시간에 여러 번 연속 호출하면 제한 응답을 받을 수 있다. 이 프로젝트는 감사 한 건에 필요한 작업만 처리한 뒤 바로 세션을 종료하는 방식으로 구현했다.

## 도구 출력과 LLM 출력 분리

`execute()`가 반환하는 전체 결과에는 스크린샷이 들어간다.

```ts
return {
  requestedUrl: url,
  finalUrl,
  score,
  passedCount,
  totalChecks,
  checks,
  screenshot,
};
```

하지만 PNG Base64 문자열은 매우 크고, LLM이 실패 항목을 설명하는 데 필요하지 않다. `toModelOutput()`에서 스크린샷을 제거한 결과만 모델에 전달한다.

```ts
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
})
```

결과적으로 다음 두 소비자가 서로 필요한 데이터만 사용한다.

- React UI: 8개 검사 결과와 스크린샷을 모두 사용
- LLM: 점수와 검사 결과만 사용하고 수정 방법을 작성

`convertToModelMessages(this.messages, { tools })`에도 같은 도구 정의를 전달해야 이전 도구 결과를 모델 메시지로 변환할 때 `toModelOutput()`이 적용된다.

## LLM 리포트 생성

`BrowserAgent`는 `AIChatAgent<Env>`를 상속하고 `onChatMessage()`에서 Workers AI 모델을 호출한다.

```ts
const workersAi = createWorkersAI({ binding: this.env.AI });

const result = streamText({
  model: workersAi("@cf/zai-org/glm-4.7-flash"),
  messages: await convertToModelMessages(this.messages, { tools }),
  tools,
  stopWhen: isLoopFinished(),
});
```

시스템 프롬프트에는 다음 규칙이 들어 있다.

- URL 또는 SEO 감사 요청을 받으면 `auditSeo`를 한 번 호출한다.
- 사용자가 사용한 언어로 답한다.
- 코드가 계산한 100점 만점 점수를 보고한다.
- 모든 실패 항목을 나열한다.
- 실패 항목마다 구체적인 수정 방법을 제안한다.
- 결과 카드에 스크린샷이 첨부되어 있음을 알린다.

`stopWhen: isLoopFinished()`를 사용하므로 모델이 도구를 호출한 뒤 결과를 받아 같은 턴에서 최종 설명까지 이어서 생성할 수 있다.

## Worker 요청 라우팅

기본 `fetch` 핸들러는 Agents SDK의 `routeAgentRequest()`에 요청을 전달한다.

```ts
export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
```

Agents SDK가 처리하지 않는 경로는 404를 반환한다. 현재 SDK의 라우팅 함수가 비동기 결과를 반환하므로 먼저 `await`한 뒤 `null` 여부를 확인한다.

## React 결과 UI

`src/App.tsx`는 다음 두 훅을 사용한다.

- `useAgent({ agent: "BrowserAgent" })`: 브라우저와 Worker 에이전트를 연결한다.
- `useAgentChat({ agent })`: 메시지, 전송, 중지, 기록 삭제 기능을 제공한다.

도구가 완료되면 메시지 파트의 상태가 `output-available`이 된다. 도구 이름이 `auditSeo`이고 결과 구조가 올바르면 `SeoAuditCard`를 렌더링한다.

### 런타임 타입 검사

서버에서 전달되는 도구 출력은 런타임 데이터이므로 TypeScript 타입 선언만 믿지 않고 `isSeoAuditOutput()`으로 구조를 확인한다.

검사하는 핵심 값은 다음과 같다.

- 최종 URL이 문자열인지
- 점수와 통과 개수가 숫자인지
- `checks`가 배열인지
- 각 검사에 `id`, `label`, `passed`가 있는지
- 스크린샷이 PNG 데이터 URL인지

검사를 통과하면 카드에 다음 정보를 표시한다.

- 최종 URL
- `점수 / 100`
- `통과 수 / 8`
- 페이지 스크린샷
- 8개 항목의 통과 또는 실패 표시
- 각 항목의 실제 발견 값

텍스트 리포트는 별도의 일반 assistant 메시지로 이어서 표시된다.

## 의존성 변경

주요 의존성의 역할은 다음과 같다.

| 패키지 | 역할 |
|---|---|
| `@cloudflare/puppeteer` | Browser Run용 Puppeteer 구현 |
| `@cloudflare/ai-chat` | `AIChatAgent`와 React 채팅 훅 |
| `agents` | 에이전트 라우팅과 React 연결 |
| `ai` | `streamText`, `tool`, 메시지 변환 |
| `workers-ai-provider` | Workers AI를 AI SDK 모델로 연결 |
| `zod` | `auditSeo` 입력 URL 검증 |
| `@babel/plugin-proposal-decorators` | Agents SDK의 Vite 변환 과정에서 필요한 플러그인 |

`@cloudflare/ai-chat`과 `agents`는 번들 시 서로 기대하는 export가 일치하도록 호환되는 버전으로 함께 갱신했다.

## 로컬 실행

프로젝트 디렉터리에서 의존성을 설치하고 개발 서버를 실행한다.

```powershell
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:5173/`에 접속한 뒤 다음처럼 입력한다.

```text
https://example.com SEO 감사해줘
```

또는 URL만 붙여넣어도 시스템 프롬프트에 따라 감사 도구를 호출하도록 구성되어 있다.

AI와 Browser Run은 로컬 개발에서도 Cloudflare 원격 리소스를 사용할 수 있으므로 계정 로그인과 사용량에 주의한다.

## 빌드와 배포

정적 검증 명령은 다음과 같다.

```powershell
pnpm build
pnpm lint
pnpm exec wrangler deploy --dry-run
```

실제 배포는 프로젝트 스크립트를 사용하는 것이 안전하다. 이 스크립트는 최신 소스를 먼저 빌드한 뒤 Wrangler를 실행한다.

```powershell
pnpm deploy
```

`npx wrangler deploy`를 직접 실행하면 기존 `dist` 결과를 사용할 수 있으므로 소스나 `wrangler.jsonc`를 수정한 뒤에는 먼저 `pnpm build`를 실행해야 한다.

## 문제 해결 기록

### `Cannot find package '@babel/plugin-proposal-decorators'`

Agents SDK의 Vite 변환 과정에서 프로젝트 루트의 Babel 플러그인을 찾지 못할 때 발생한다. 해당 플러그인을 개발 의존성에 명시적으로 추가했다. 설치 직후 같은 오류가 나면 의존성 설치가 끝났는지 확인하고 다시 실행한다.

```powershell
pnpm install
pnpm dev
```

### 배포 오류 `code: 10195`

오류 메시지는 Dynamic Workers를 사용하려면 Paid 플랜이 필요하다는 뜻이다. 원인은 활성화된 `worker_loaders` 바인딩이었다. SEO 감사 로직에서는 `env.LOADER`를 사용하지 않으므로 해당 설정을 무료 플랜 사유와 함께 주석 처리했다.

### AI 바인딩 원격 연결 경고

다음 형태의 경고는 AI 바인딩이 로컬 에뮬레이터가 아니라 원격 Cloudflare 리소스를 사용한다는 안내다.

```text
AI bindings always access remote resources, and so may incur usage charges
```

개발 서버가 정상적으로 `ready` 상태가 된다면 이 문구 자체는 실행 실패가 아니다.

## 현재 구현의 범위와 주의점

- 한 URL의 한 페이지를 감사하며 사이트 전체를 크롤링하지 않는다.
- `DOMContentLoaded` 시점의 DOM을 검사한다. 그 이후 늦게 삽입되는 메타데이터는 반영되지 않을 수 있다.
- 로그인, CAPTCHA, 강한 봇 차단이 있는 페이지는 정상적으로 열리지 않을 수 있다.
- `alt`의 내용 품질은 평가하지 않고 속성 존재 여부만 검사한다.
- canonical 및 Open Graph URL의 절대 URL 여부나 실제 접근 가능성은 검사하지 않는다.
- 스크린샷은 전체 페이지가 아닌 첫 화면 뷰포트다.
- Base64 스크린샷은 대화 결과 크기를 늘리므로 대량 감사 기능으로 확장할 때는 R2 저장 후 URL만 반환하는 구조를 고려할 수 있다.

## 공식 참고 문서

- [Cloudflare Browser Run - Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/)
- [Cloudflare Browser Run - Limits](https://developers.cloudflare.com/browser-run/limits/)
- [Cloudflare Browser Run - Pricing](https://developers.cloudflare.com/browser-run/pricing/)
- [Cloudflare Agents - Chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/)
- [Cloudflare Workers - Best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare Dynamic Workers - Pricing](https://developers.cloudflare.com/dynamic-workers/pricing/)
