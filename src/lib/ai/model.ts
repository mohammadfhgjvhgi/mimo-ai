// ===================================================================
// MiMo AI — Model Gateway (z-ai-web-dev-sdk wrapper)
// ===================================================================
// ADR-001: All AI calls go through this gateway. Single source of truth.
// NOTE: ZAI SDK streaming returns empty chunks — we use non-streaming
// and simulate streaming by chunking the full response into word bursts.
// ===================================================================

import ZAI, { ChatMessage as ZaiChatMessage } from "z-ai-web-dev-sdk";

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

export async function getModel() {
  if (!_zai) {
    try {
      _zai = await ZAI.create();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to initialize ZAI model: ${msg}`);
    }
  }
  return _zai;
}

export interface ChatOptions {
  system?: string;
  temperature?: number;
  thinking?: boolean;
  maxTokens?: number;
  maxRetries?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export interface ChatResult {
  content: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  durationMs: number;
  finishReason?: string;
  toolCalls?: unknown;
  raw?: unknown;
}

const RATE_LIMIT_DELAY_MS = 2000;
const MAX_RETRIES = 3;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("timeout") ||
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up")
    );
  }
  return false;
}

/**
 * Non-streaming chat completion with retry + rate-limit handling.
 */
export async function chat(
  messages: ZaiChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const start = Date.now();
  const zai = await getModel();
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  const finalMessages: ZaiChatMessage[] = [];
  if (options.system) {
    finalMessages.push({ role: "system", content: options.system });
  }
  finalMessages.push(...messages);

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const requestBody: Record<string, unknown> = {
        messages: finalMessages,
        stream: false,
        thinking: { type: options.thinking ? "enabled" : "disabled" },
      };

      // Add tools if provided (native function calling)
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
      }

      const response = await zai.chat.completions.create(requestBody as Parameters<typeof zai.chat.completions.create>[0]);

      const choice = response.choices?.[0];
      const content = choice?.message?.content ?? "";
      const finishReason = choice?.finish_reason;
      const usage = response.usage ?? {};
      const toolCalls = (choice as { message?: { tool_calls?: unknown } })?.message?.tool_calls;

      return {
        content,
        usage: {
          promptTokens: usage.prompt_tokens ?? undefined,
          completionTokens: usage.completion_tokens ?? undefined,
          totalTokens: usage.total_tokens ?? undefined,
        },
        durationMs: Date.now() - start,
        finishReason: finishReason ?? undefined,
        toolCalls: toolCalls ?? undefined,
        raw: response,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (isRetryableError(err) && attempt < maxRetries) {
        const delay = RATE_LIMIT_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ?? new Error("Chat failed after retries");
}

/**
 * Simulated streaming — calls non-streaming chat (since ZAI SDK streaming
 * is broken), then yields the response in word bursts for UX.
 */
export async function* chatStream(
  messages: ZaiChatMessage[],
  options: ChatOptions = {}
): AsyncGenerator<string, ChatResult, unknown> {
  const start = Date.now();

  // First: emit a "thinking" indicator immediately so user sees activity
  yield "";

  // Call non-streaming chat
  const result = await chat(messages, options);

  // If empty content, yield nothing more
  if (!result.content) {
    return {
      content: "",
      usage: result.usage,
      durationMs: Date.now() - start,
      finishReason: result.finishReason,
    };
  }

  // Chunk the response into word bursts for streaming UX
  const words = result.content.split(/(\s+)/); // keep whitespace
  const BURST_SIZE = 3; // words per burst
  const BURST_DELAY_MS = 20; // delay between bursts

  let yielded = "";
  for (let i = 0; i < words.length; i += BURST_SIZE) {
    const burst = words.slice(i, i + BURST_SIZE).join("");
    yielded += burst;
    yield burst;
    if (BURST_DELAY_MS > 0 && i + BURST_SIZE < words.length) {
      await sleep(BURST_DELAY_MS);
    }
  }

  return {
    content: yielded,
    usage: result.usage,
    durationMs: Date.now() - start,
    finishReason: result.finishReason,
  };
}

/**
 * Generate structured output by asking for JSON.
 */
export async function generateStructured<T = unknown>(
  messages: ZaiChatMessage[],
  schemaDescription: string,
  options: ChatOptions = {}
): Promise<T> {
  const sys =
    (options.system ?? "") +
    `\n\nYou MUST respond with valid JSON only, matching this schema:\n${schemaDescription}\n\nNo markdown, no code fences, no commentary — JSON only.`;

  const result = await chat(messages, { ...options, system: sys });

  try {
    return JSON.parse(result.content) as T;
  } catch {
    // Try extracting JSON from markdown fences
    const match = result.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]) as T;
      } catch {
        // fall through
      }
    }
    // Try finding first { ... last }
    const first = result.content.indexOf("{");
    const last = result.content.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(result.content.slice(first, last + 1)) as T;
      } catch {
        // fall through
      }
    }
    // Try array
    const firstArr = result.content.indexOf("[");
    const lastArr = result.content.lastIndexOf("]");
    if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
      try {
        return JSON.parse(result.content.slice(firstArr, lastArr + 1)) as T;
      } catch {
        // fall through
      }
    }
    throw new Error(
      `Failed to parse structured output. Raw: ${result.content.slice(0, 500)}`
    );
  }
}

/**
 * Invoke a ZAI function tool (web_search, web_reader, etc.).
 */
export async function invokeFunction<T = unknown>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const zai = await getModel();
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const functions = zai.functions as unknown as {
        invoke: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      };
      const result = await functions.invoke(name, args);
      return result as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        await sleep(RATE_LIMIT_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ?? new Error(`Function ${name} failed`);
}
