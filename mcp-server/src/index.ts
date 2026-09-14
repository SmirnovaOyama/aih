#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TodoAppAdapter } from "./app-adapter.js";
import type { AppAdapter, AppActionDef } from "./app-adapter.js";

function textResult(payload: unknown) {
  // G2 fix: replace non-serializable values instead of letting JSON.stringify
  // throw (circular refs / bigint / functions in an error payload would crash
  // the whole response).
  const text = JSON.stringify(payload, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "function") return "[Function]";
    return v;
  }, 2);
  return {
    content: [{ type: "text" as const, text }],
  };
}

/** G3 fix: per-tool-call timeout so a slow action cannot block stdio forever. */
const TOOL_CALL_TIMEOUT_MS = Number(process.env.AIH_MCP_TOOL_TIMEOUT_MS ?? "") || 120_000;

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${TOOL_CALL_TIMEOUT_MS}ms`)), TOOL_CALL_TIMEOUT_MS);
  });
  // Unref the timer so a pending call does NOT keep the event loop (and the
  // stdio transport's host process) alive after all real work is done.
  timer?.unref?.();
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function buildServer(adapter: AppAdapter): McpServer {
  const server = new McpServer({
    name: adapter.descriptor.name,
    version: adapter.descriptor.version,
  });

  server.registerTool(
    "app_describe",
    {
      description:
        "Describe this application: available context queries and actions with their permission levels. Call this first when unsure what the app can do.",
      inputSchema: {},
    },
    async () => textResult(adapter.descriptor),
  );

  server.registerTool(
    "app_context",
    {
      description: `Read application state. Supported queries: ${adapter.descriptor.contextQueries.join(", ")}.`,
      inputSchema: { query: z.string().describe("which state snapshot to read") },
    },
    async ({ query }) => textResult(await adapter.context(query)),
  );

  for (const [name, def] of Object.entries(adapter.actions)) {
    // Validate that parameters is a valid Zod object shape before registration
    if (def.parameters && typeof def.parameters !== "object") {
      throw new Error(`Action "${name}" has invalid parameters type: ${typeof def.parameters}`);
    }
    server.registerTool(
      name,
      {
        description: `${def.description} [kind=${def.kind}, permission=${def.permission}]`,
        inputSchema: shapeOf(def),
      },
      async (args) => textResult(await withTimeout(def.run(args), `action ${def.kind}`)),
    );
  }

  return server;
}

function shapeOf(def: AppActionDef): z.ZodRawShape {
  // G1 fix (audited 2026-09-13): validate the action's parameter schema before
  // registering instead of blindly casting. AppActionDef.parameters is a whole
  // Zod value schema (z.ZodTypeAny, e.g. z.object({...})); the bundled action
  // defs are always Zod objects, so unwrap them. Anything else fails fast with
  // a descriptive error rather than crashing at request time. Duck-typing on
  // `_def` instead of instanceof handles duplicate zod installs too.
  const params: unknown = def.parameters;
  const looksZod = !!params && typeof params === "object" && "_def" in params;
  if (!looksZod) {
    throw new TypeError(
      `[aih-mcp-server] action "${def.kind}" has invalid parameters: expected a Zod schema`,
    );
  }
  if (typeof (params as { safeParse?: unknown }).safeParse !== "function") {
    throw new TypeError(
      `[aih-mcp-server] action "${def.kind}" parameters failed the Zod sanity check`,
    );
  }
  // MCP registerTool expects a ZodRawShape; the app adapter always builds
  // z.object(...) wrappers, so unwrap. A bare ZodRawShape-ish plain object of
  // Zod values is passed through unchanged for backwards compatibility.
  const anyParams = params as { _def?: { shape?: unknown } };
  if (anyParams._def && typeof anyParams._def.shape === "function") {
    return (params as unknown as { _def: { shape: () => z.ZodRawShape } })._def.shape();
  }
  return params as z.ZodRawShape;
}

async function main(): Promise<void> {
  const adapter = new TodoAppAdapter(process.env.AIH_TODO_STORE);
  const server = buildServer(adapter);
  await server.connect(new StdioServerTransport());
  console.error(`[aih-mcp-server] serving app "${adapter.descriptor.name}" over stdio`);
}

main().catch((err) => {
  console.error("[aih-mcp-server] fatal:", err);
  process.exit(1);
});
