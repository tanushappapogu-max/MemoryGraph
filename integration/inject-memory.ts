/**
 * inject-memory.ts — Drop-in function to add memory context to any LLM call.
 *
 * USAGE:
 *   import { withMemory } from "./integration/inject-memory";
 *
 *   // Before (no memory):
 *   const response = await openai.chat.completions.create({
 *     model: "gpt-4",
 *     messages: [{ role: "user", content: userMessage }],
 *   });
 *
 *   // After (with memory):
 *   const response = await openai.chat.completions.create({
 *     model: "gpt-4",
 *     messages: await withMemory(userMessage, [{ role: "user", content: userMessage }]),
 *   });
 *
 * That's it. One function wrapping your messages array.
 */

const MEMORYGRAPH_URL = process.env.MEMORYGRAPH_URL || "http://127.0.0.1:3033";

type Message = { role: string; content: string | null; [key: string]: unknown };

/**
 * Wrap a messages array with memory context.
 * Fetches relevant memories from the local MemoryGraph daemon and
 * injects a <memorygraph> system prompt block.
 */
export async function withMemory(
  currentDialogue: string,
  messages: Message[],
  options: { maxTokenBudget?: number; timeout?: number } = {},
): Promise<Message[]> {
  try {
    const res = await fetch(`${MEMORYGRAPH_URL}/api/v1/cluely/system-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dialogue: currentDialogue,
        maxTokenBudget: options.maxTokenBudget || 1200,
      }),
      signal: AbortSignal.timeout(options.timeout || 2000),
    });

    const data = await res.json();
    if (!data.ok || !data.prompt || data.memoryCount === 0) {
      return messages; // No relevant memory — return messages unchanged
    }

    // Inject memory context into the system prompt
    const result = [...messages];
    const systemIdx = result.findIndex((m) => m.role === "system");

    if (systemIdx >= 0 && result[systemIdx].content) {
      result[systemIdx] = {
        ...result[systemIdx],
        content: data.prompt + "\n\n" + result[systemIdx].content,
      };
    } else {
      result.unshift({ role: "system", content: data.prompt });
    }

    return result;
  } catch {
    // MemoryGraph daemon not running — return messages unchanged
    return messages;
  }
}

/**
 * Auto-capture a conversation turn into the memory graph.
 * Fire-and-forget — does not block.
 */
export function captureToMemory(text: string, source = "cluely"): void {
  if (!text || text.length < 12) return;
  fetch(`${MEMORYGRAPH_URL}/api/v1/capture/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source, title: `${source} capture` }),
  }).catch(() => {});
}
