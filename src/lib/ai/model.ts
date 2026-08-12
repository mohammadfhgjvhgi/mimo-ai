// ===================================================================
// MiMo AI — Model Gateway (z-ai-web-dev-sdk wrapper)
// ===================================================================
// ADR-001: All AI calls go through this gateway. Single source of truth.
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
}

/**
 * Non-streaming chat completion.
 */
export async function chat(
  messages: ZaiChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const start = Date.now();
  const zai = await getModel();

  const finalMessages: ZaiChatMessage[] = [];
  if (options.system) {
    finalMessages.push({ role: "system", content: options.system });
  }
  finalMessages.push(...messages);

  try {
    const response = await zai.chat.completions.create({
      messages: finalMessages,
      stream: false,
      thinking: { type: options.thinking ? "enabled" : "disabled" },
    });

    const content = response.choices?.[0]?.message?.content ?? "";
    const finishReason = response.choices?.[0]?.finish_reason;
    const usage = response.usage ?? {};

    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens ?? undefined,
        completionTokens: usage.completion_tokens ?? undefined,
        totalTokens: usage.total_tokens ?? undefined,
      },
      durationMs: Date.now() - start,
      finishReason: finishReason ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Chat failed: ${msg}`);
  }
}

/**
 * Streaming chat completion — async generator yielding string deltas.
 */
export async function* chatStream(
  messages: ZaiChatMessage[],
  options: ChatOptions = {}
): AsyncGenerator<string, ChatResult, unknown> {
  const start = Date.now();
  const zai = await getModel();

  const finalMessages: ZaiChatMessage[] = [];
  if (options.system) {
    finalMessages.push({ role: "system", content: options.system });
  }
  finalMessages.push(...messages);

  let fullContent = "";
  let finishReason: string | undefined;
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } = {};

  try {
    const stream = await zai.chat.completions.create({
      messages: finalMessages,
      stream: true,
      thinking: { type: options.thinking ? "enabled" : "disabled" },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        yield delta;
      }
      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Chat stream failed: ${msg}`);
  }

  return {
    content: fullContent,
    usage: {
      promptTokens: usage.prompt_tokens ?? undefined,
      completionTokens: usage.completion_tokens ?? undefined,
      totalTokens: usage.total_tokens ?? undefined,
    },
    durationMs: Date.now() - start,
    finishReason,
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
    // Try direct parse
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
  try {
    const result = await zai.functions.invoke(name, args);
    return result as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Function ${name} failed: ${msg}`);
  }
}
