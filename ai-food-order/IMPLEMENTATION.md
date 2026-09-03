# AI 음식 주문 에이전트 구현 설명

## 전체 구조

이 프로젝트는 Cloudflare `AIChatAgent`가 대화와 주문 상태를 Durable Object에 보관하고, AI SDK의 도구 호출을 이용해 메뉴 조회부터 주문 승인까지 진행한다.

주요 파일은 다음과 같다.

- `worker/tools.ts`: 메뉴, 매장, 장바구니 상태와 다섯 가지 도구
- `worker/index.ts`: 에이전트 루프, Workers AI 연결, 상태 검증, 저장 정제 훅
- `worker/sanitize.ts`: 카드번호 형태 문자열 마스킹
- `src/App.tsx`: 채팅, 브라우저 위치 조회, 장바구니 및 승인 UI

## 서버 상태

`OrderState`에는 현재 장바구니와 최근 주문이 들어간다. 장바구니 가격은 사용자나 모델이 전달하지 않는다. `addToCart`가 메뉴 ID를 받은 뒤 서버의 `MENU_ITEMS`에서 이름과 가격을 다시 찾아 저장한다.

`FoodOrderAgent.validateStateChange`는 클라이언트의 직접 상태 변경을 거부하고, 각 장바구니 항목의 ID, 이름, 가격, 수량이 서버 메뉴와 일치하는지 검사한다.

## 도구 구현

모든 도구는 `tool()`과 Zod `inputSchema`로 선언된다.

### `getMenu`

입력은 빈 객체이며 서버에서 메뉴와 매장 좌표를 반환한다. `execute`가 있으므로 서버 도구다.

### `addToCart`

`item.id`와 `item.quantity`를 받는다. 존재하지 않는 메뉴, 품절 메뉴, 20개를 넘는 수량을 거부한다. 성공하면 `this.setState()`를 통해 Durable Object 상태를 갱신한다.

### `viewCart`

입력은 빈 객체다. 현재 장바구니를 읽어 상품별 금액, 총수량, 총액을 서버에서 계산한다.

### `getLocation`

서버 도구 정의에는 `execute`가 없다. 모델이 이 도구를 호출하면 스트림이 브라우저 결과를 기다린다.

클라이언트의 `useAgentChat({ onToolCall })`가 `navigator.geolocation.getCurrentPosition()`을 실행하고 위도, 경도, 정확도를 `addToolOutput()`으로 돌려준다. 성공과 실패 모두 구조화된 결과로 반환하므로 에이전트가 자동으로 후속 대화를 이어갈 수 있다.

### `placeOrder`

`needsApproval: true`이므로 도구 입력이 준비되어도 `execute`는 즉시 실행되지 않는다. UI가 `waiting-approval` 상태를 감지해 서버 장바구니의 항목과 총액을 표시한다.

- **Approve**: `addToolApprovalResponse({ approved: true })`
- **거절**: `addToolApprovalResponse({ approved: false })`

승인 후 서버에서 장바구니 총액을 다시 계산하고 `crypto.randomUUID()`로 주문 ID를 만든다. 모델이 말한 합계를 결제 금액으로 신뢰하지 않는다. 이 예제는 실제 결제사를 호출하지 않고 주문 접수만 시뮬레이션한다.

## 에이전트 루프

`FoodOrderAgent.onChatMessage`가 매 요청마다 현재 에이전트 상태에 연결된 도구들을 생성한다.

```ts
const tools: ToolSet = createOrderTools({
  getState: () => this.state,
  setState: (state) => this.setState(state),
});
```

`streamText`에는 다음 종료 조건이 들어간다.

```ts
stopWhen: isLoopFinished()
```

따라서 메뉴 조회, 장바구니 추가, 장바구니 확인처럼 여러 도구가 필요한 요청은 모델이 응답을 마칠 때까지 같은 에이전트 턴에서 이어진다. 클라이언트 도구 결과와 승인 응답도 `autoContinueAfterToolResult: true`를 통해 이어진다.

## 저장 전 카드번호 정제

`FoodOrderAgent`는 다음 훅을 오버라이드한다.

```ts
protected sanitizeMessageForPersistence(message: UIMessage): UIMessage {
  return sanitizeMessage(message);
}
```

`sanitizeMessage`는 메시지 전체를 재귀적으로 순회한다. 일반 텍스트뿐 아니라 도구 입력과 출력 안의 문자열도 검사한다. 연속 숫자 또는 공백·하이픈으로 구분된 13~19자리 숫자열을 발견하면 저장 전에 `[CARD REDACTED]`로 바꾼다.

예시:

```text
4111 1111 1111 1111  →  [CARD REDACTED]
5500-0000-0000-0004  →  [CARD REDACTED]
주문번호 12345        →  주문번호 12345
```

정제는 UI에서 문자열을 숨기는 기능이 아니라 SQLite 대화 기록에 기록되기 전에 적용되는 방어선이다.

## 실행과 확인

```powershell
npm install
npm run dev
```

브라우저에서 다음 순서로 확인한다.

1. `메뉴를 보여줘`
2. `김치찌개 한 개 담고 장바구니 보여줘`
3. `내 위치에서 가까운 매장을 찾아줘`
4. `현재 장바구니로 주문해줘`
5. 승인 카드가 나타났을 때 주문이 아직 완료되지 않았는지 확인
6. **Approve**를 누른 뒤 주문 ID가 생기고 장바구니가 비워지는지 확인
7. 카드번호 형태 문자열을 전송한 뒤 새로고침했을 때 `[CARD REDACTED]`로 복원되는지 확인

정적 검증 명령은 다음과 같다.

```powershell
npm run build
npm run lint
```
