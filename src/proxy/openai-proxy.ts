/**
 * OpenAI-Compatible Proxy — the ACTUAL Cluely integration.
 *
 * This proxy intercepts OpenAI API calls, injects memory graph context
 * into the system prompt, forwards to the real OpenAI API, and returns
 * the enriched response. Cluely (or any AI tool) just points its
 * base URL at this proxy instead of api.openai.com.
 *
 * HOW TO USE:
 *   1. Start the proxy: npm run proxy
 *   2. In Cluely (or any app), set API base URL to: http://localhost:4000/v1
 *   3. Keep your real OPENAI_API_KEY — the proxy forwards it
 *   4. Every response is now enriched with your memory graph
 *
 * The proxy also auto-captures every conversation into the memory graph,
 * so it gets smarter with every interaction.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { buildCluelySystemPrompt } from "../cluely/adapter";
import { ingestContent } from "../core/ingest";

const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const PROXY_PORT = Number(process.env.PROXY_PORT || 4000);
const AUTO_CAPTURE = process.env.PROXY_AUTO_CAPTURE !== "false";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  [key: string]: unknown;
};

export function startProxy(port = PROXY_PORT) {
  const server = createServer(handleProxyRequest);
  server.listen(port, "127.0.0.1", () => {
    console.log(`[memorygraph-proxy] OpenAI-compatible proxy running on http://127.0.0.1:${port}`);
    console.log(`[memorygraph-proxy] Point your AI tool's base URL to: http://127.0.0.1:${port}/v1`);
    console.log(`[memorygraph-proxy] Auto-capture: ${AUTO_CAPTURE ? "ON" : "OFF"}`);
    console.log(`[memorygraph-proxy] Forwarding to: ${OPENAI_BASE}`);
  });
  return server;
}

async function handleProxyRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only intercept chat completions — forward everything else as-is
  if (url.includes("/chat/completions") && req.method === "POST") {
    return handleChatCompletion(req, res);
  }

  // Forward all other requests (models, embeddings, etc.) directly
  return forwardRequest(req, res, url);
}

async function handleChatCompletion(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    const request = JSON.parse(body) as ChatCompletionRequest;

    // Extract the user's latest message for context retrieval
    const userMessages = request.messages.filter((m) => m.role === "user" && m.content);
    const latestUserMessage = userMessages[userMessages.length - 1]?.content || "";
    const allUserContent = userMessages.map((m) => m.content).join("\n");

    // Build memory-enriched system prompt
    const memoryContext = await buildCluelySystemPrompt(
      latestUserMessage || allUserContent,
      { maxTokenBudget: 1500 },
    );

    // Inject memory context into the messages
    if (memoryContext.memoryCount > 0) {
      const existingSystem = request.messages.find((m) => m.role === "system");
      if (existingSystem && existingSystem.content) {
        // Prepend memory context to existing system prompt
        existingSystem.content = memoryContext.prompt + "\n\n" + existingSystem.content;
      } else {
        // Add as new system message at the beginning
        request.messages.unshift({
          role: "system",
          content: memoryContext.prompt,
        });
      }
      console.log(
        `[memorygraph-proxy] Injected ${memoryContext.memoryCount} memories, ${memoryContext.patternCount} patterns`,
      );
    }

    // Auto-capture the conversation into the graph
    if (AUTO_CAPTURE && latestUserMessage.length >= 12) {
      // Fire and forget — don't block the response
      ingestContent({
        text: latestUserMessage,
        source: "cluely",
        title: "Proxy capture",
        dedupe: true,
        extract: latestUserMessage.length >= 50, // Only extract from substantial messages
      }).catch(() => {});
    }

    // Forward the modified request to OpenAI
    const apiKey = req.headers["authorization"] || `Bearer ${process.env.OPENAI_API_KEY}`;
    const targetUrl = `${OPENAI_BASE}/v1/chat/completions`;

    const modifiedBody = JSON.stringify(request);

    const upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey as string,
        ...(request.stream ? { Accept: "text/event-stream" } : {}),
      },
      body: modifiedBody,
    });

    // Stream the response back
    res.writeHead(upstreamRes.status, {
      "Content-Type": upstreamRes.headers.get("content-type") || "application/json",
      ...(request.stream ? { "Transfer-Encoding": "chunked", "Cache-Control": "no-cache" } : {}),
    });

    if (request.stream && upstreamRes.body) {
      // Stream SSE chunks directly
      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);

        // Try to capture assistant response for the graph
        if (AUTO_CAPTURE) {
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) assistantContent += delta;
            } catch {}
          }
        }
      }
      res.end();

      // Capture assistant response if substantial
      if (AUTO_CAPTURE && assistantContent.length >= 50) {
        ingestContent({
          text: `User asked: ${latestUserMessage}\nAssistant answered: ${assistantContent.slice(0, 2000)}`,
          source: "cluely",
          title: "Proxy conversation capture",
          dedupe: true,
          extract: true,
        }).catch(() => {});
      }
    } else {
      // Non-streaming: read full response and forward
      const responseBody = await upstreamRes.text();
      res.end(responseBody);

      // Capture assistant response
      if (AUTO_CAPTURE) {
        try {
          const parsed = JSON.parse(responseBody);
          const assistantContent = parsed.choices?.[0]?.message?.content;
          if (assistantContent && assistantContent.length >= 50) {
            ingestContent({
              text: `User asked: ${latestUserMessage}\nAssistant answered: ${assistantContent.slice(0, 2000)}`,
              source: "cluely",
              title: "Proxy conversation capture",
              dedupe: true,
              extract: true,
            }).catch(() => {});
          }
        } catch {}
      }
    }
  } catch (error) {
    console.error("[memorygraph-proxy] Error:", error);
    res.writeHead(502);
    res.end(JSON.stringify({ error: { message: "Proxy error", type: "proxy_error" } }));
  }
}

async function forwardRequest(req: IncomingMessage, res: ServerResponse, path: string) {
  try {
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const targetUrl = `${OPENAI_BASE}${path}`;

    const headers: Record<string, string> = {};
    if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"] as string;
    if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"] as string;

    const upstreamRes = await fetch(targetUrl, {
      method: req.method || "GET",
      headers,
      body,
    });

    res.writeHead(upstreamRes.status, {
      "Content-Type": upstreamRes.headers.get("content-type") || "application/json",
    });
    const responseBody = await upstreamRes.text();
    res.end(responseBody);
  } catch (error) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: { message: "Forward error", type: "proxy_error" } }));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// If run directly
if (require.main === module || process.argv[1]?.includes("openai-proxy")) {
  startProxy();
}
