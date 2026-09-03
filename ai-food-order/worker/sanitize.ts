import type { UIMessage } from "ai";

const CARD_NUMBER_CANDIDATE =
  /(^|[^\d])((?:\d[ -]?){12,18}\d)(?!\d)/g;

export function redactCardNumbers(text: string): string {
  return text.replace(
    CARD_NUMBER_CANDIDATE,
    (_match, prefix: string) => `${prefix}[CARD REDACTED]`,
  );
}

function redactStrings<T>(value: T): T {
  if (typeof value === "string") {
    return redactCardNumbers(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactStrings(item)) as T;
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactStrings(item)]),
    ) as T;
  }

  return value;
}

export function sanitizeMessage(message: UIMessage): UIMessage {
  return redactStrings(message);
}
