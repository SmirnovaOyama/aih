import { randomBytes } from "node:crypto";
import type {
  ChatMessage,
  ContentBlock,
  LLMRequest,
  LLMResponse,
  TokenUsage,
  ToolCall,
  ToolSchema,
} from "../types.js";
import type { LLMAdapter } from "./llm.js";

/**
 * Generate a 26-char id body in opencode's exact format (src/id/id.ts `create()`):
 *   12 hex chars = (Date.now() × 4096 + counter) big-endian, 6 bytes
 *     - high 44 bits: millisecond timestamp
 *     - low  12 bits: per-millisecond counter (0-4095, resets when ms changes)
 *   + 14 random base62 chars (randomBytes(14) % 62)
 * The counter guarantees distinct ids even when two are minted in the same ms.
 */
let idLastTs = 0;
let idCounter = 0;
/**
 * Normalize a caller-supplied id into the gateway-accepted form
 * ("ses_" + 26 base62). The gateway validates the id FORMAT (not just the
 * prefix), so ids from other tools (aih session files "s-YYYYMMDD-HHMMSS",
 * other providers' own "ses_*" ids) are remapped to a fresh valid body.
 * The mapping is stable per input so the gateway keeps one conversation =
 * one session id across requests.
 */
const SID_BODY_RE = /^[A-Za-z0-9]{26}$/;
const sidBodyCache = new Map<string, string>();
function normalizeSid(raw: string, key: string): string {
  // The gateway validates the id FORMAT ("ses_" + 26 base62), not just the
  // prefix. aih session files are named "s-YYYYMMDD-HHMMSS" and were passed
  // straight into x-opencode-session → every request was rejected. Remap
  // non-conforming ids to a fresh valid body, STABLE per input (one
  // conversation = one gateway session across requests; aux calls keep their
  // own identity, P#36⑤). Templates carry the "ses_" prefix ("ses_{sid}");
  // this returns the FULL qualified form so configs and the catalog default
  // agree on one shape.
  const body = raw.startsWith("ses_") ? raw.slice(4) : raw;
  if (SID_BODY_RE.test(body)) return `ses_${body}`;
  const hit = sidBodyCache.get(key);
  if (hit) return hit;
  const fresh = `ses_${opencodeIDBody()}`;
  sidBodyCache.set(key, fresh);
  return fresh;
}

export function opencodeIDBody(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let rand = "";
  const bytes = randomBytes(14);
  for (let i = 0; i < 14; i++) rand += chars[bytes[i] % 62];
  const ts = Date.now();
  if (ts !== idLastTs) {
    idLastTs = ts;
    idCounter = 0;
  }
  idCounter++;
  const now = BigInt(ts) * BigInt(0x1000) + BigInt(idCounter);
  const timeBytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff));
  return timeBytes.toString("hex") + rand;
}

export interface OpenAICompatibleOptions {
  baseUrl: string;
  /** bearer key; optional for providers that authenticate by client identity (headers) */
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  /** extra request headers sent with every completion call (e.g. client identity) */
  headers?: Record<string, string>;
  /**
   * Extra OpenAI-format tools appended to every request body's `tools` array
   * (deduped by function name; real tools win on collision). Lets a provider
   * whose gateway fingerprints the client tool set be satisfied from config
   * alone — the stubs are never advertised to the model as callable AIH tools.
   */
  extraTools?: Array<ReturnType<typeof toOpenAITool>>;
  /**
   * Explicit, conversation-stable session id for "{sid}" header placeholders
   * (opencode Go requires `x-opencode-session` per conversation: "Send a
   * stable session ID ... for each conversation so we can optimize routing
   * and prompt caching"). Without it a random id is minted per adapter
   * instance — which changes whenever the runtime rebuilds the adapter
   * (model switch / mode switch), breaking gateway-side session affinity.
   * Per-request `req.sessionId` (compaction summaries) still overrides.
   */
  sessionId?: string;
  /**
   * Cap for the model's max_tokens (max output tokens) per request. Some free
   * tiers reject requests that ask for more output than the account can afford
   * (e.g. OpenRouter upstreams 503 when max_tokens > remaining quota) — send an
   * explicit cap to stay under it. Undefined → omit the field (provider default).
   */
  maxTokens?: number;
  /**
   * OC#7 — credential ownership isolation. When set, the provider's "owner"
   * name for degradation attribution (a provider id such as "empero"). Undefined
   * for consumers that are not owner-tracked (defaults off; no-op).
   */
  owner?: string;
  /**
   * OC#7 — invoked when a credential-class failure (auth rejection, or quota
   * exhaustion) is observed for `owner`. The runtime NEVER auto-falls back to a
   * different credential — this hook only RECORDS the degradation (marks the
   * owner unavailable) so a report can name it; the original error still
   * propagates. Undefined → no hook (default behavior unchanged).
   *
   * `reason` is the raw failure text; the recorder is responsible for redacting
   * it before persistence (see owner-state.redactCredential).
   */
  onCredentialFailure?: (owner: string, cls: "credential" | "quota", reason: string) => void;
  /**
   * OC#7 — invoked on a SUCCESSFUL completion for `owner`. Used to auto-clear a
   * prior degradation once the credential demonstrably works again (recovery).
   */
  onOwnerSuccess?: (owner: string) => void;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | Array<Record<string, unknown> | ContentBlock>;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

function toOpenAIMessage(message: ChatMessage): OpenAIMessage {
  // Content-block form (multi-modal): pass through verbatim so providers
  // receive [{type:"text"}, {type:"image_url",...}] unchanged.
  const rawContent: string | ContentBlock[] | null = message.content ?? null;
  const content: OpenAIMessage["content"] = Array.isArray(rawContent)
    ? (rawContent as Array<Record<string, unknown> | ContentBlock>)
    : rawContent;
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content,
      ...(message.toolCalls && message.toolCalls.length > 0
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          }
        : {}),
    };
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      content: typeof content === "string" ? content : (content ?? null),
      tool_call_id: message.toolCallId,
    };
  }
  return { role: message.role, content: message.content };
}

function toOpenAITool(schema: ToolSchema) {
  return {
    type: "function" as const,
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    },
  };
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { _raw: raw };
  }
}

// TP#2: Import consumeSSEStream and classifyProviderError from llm-sse.ts
import {
  consumeSSEStream,
  classifyProviderError,
  isQuotaExhaustion,
  retryAfterHintFromHeaders,
  QuotaError,
  ReasoningRunawayError,
  StallError,
  isNetworkErrorFinish,
  NetworkFinishError,
  NETWORK_FAILURE_RE,
  NETWORK_UNREACHABLE_RE,
  errFullText,
} from "./llm-sse.js";

// CC#49 — stream-stall guards. Headers received but no data frame within
// firstTokenMs, or silence between frames within stallMs → abort the request.
// 0 disables a guard. Defaults: first token 180s, inter-frame 60s.
const FIRST_TOKEN_TIMEOUT_MS = () =>
  Number(process.env.AIH_FIRST_TOKEN_TIMEOUT_MS ?? "") || 180_000;
const STALL_TIMEOUT_MS = () =>
  Number(process.env.AIH_STALL_TIMEOUT_MS ?? "") || 60_000;
// CC#51 — response-HEADER timeout. The stall guards above only start AFTER the
// HTTP response headers arrive; a provider that accepts the TCP/SOCKS
// connection but never answers the HTTP request (observed: opencode zen
// models that time out silently — deepseek-v4-flash-free /
// nemotron-3.5-lightning-free) would otherwise hang the fetch forever and
// leave the TUI spinning with no turn/end. This bounds the header wait so the
// failure folds into the (extended) network retry budget, and ultimately the
// turn-level park cap in the agent loop. 0 disables.
const RESPONSE_HEADER_TIMEOUT_MS = () =>
  Number(process.env.AIH_RESPONSE_HEADER_TIMEOUT_MS ?? "") || 60_000;
// FA#3 — reasoning-runaway watchdog. A reasoning-only stream (no content, no
// tool call) that exceeds these budgets throws ReasoningRunawayError.
// 0 disables a guard. Defaults: reasoning-only 120s, 16K reasoning chars.
const REASONING_ONLY_TIMEOUT_MS = () =>
  Number(process.env.AIH_REASONING_ONLY_TIMEOUT_MS ?? "") || 120_000;
const REASONING_ONLY_MAX_CHARS = () =>
  Number(process.env.AIH_REASONING_ONLY_MAX_CHARS ?? "") || 16_384;

/** Arm a stall watchdog: fires `fire` after `ms` unless disarmed/reset. */
function armStallTimer(ms: number, fire: () => void): { reset(): void; disarm(): void } {
  if (ms <= 0) return { reset() {}, disarm() {} };
  let handle: ReturnType<typeof setTimeout> | undefined = setTimeout(fire, ms);
  return {
    reset() {
      if (handle) {
        clearTimeout(handle);
        handle = setTimeout(fire, ms);
      }
    },
    disarm() {
      if (handle) {
        clearTimeout(handle);
        handle = undefined;
      }
    },
  };
}

export class OpenAICompatibleLLM implements LLMAdapter {
  #options: OpenAICompatibleOptions;
  #fetch: typeof fetch;
  /** Stable id minted once per client instance; "{sid}" headers keep it across requests. */
  #sid: string;

  constructor(options: OpenAICompatibleOptions) {
    this.#options = options;
    this.#fetch = options.fetchImpl ?? fetch;
    // A caller-supplied session id wins: it survives adapter rebuilds
    // (model/mode switches) so the gateway sees one conversation, one id.
    this.#sid = options.sessionId ?? opencodeIDBody();
  }

  /**
   * OC#7 — record a credential-class degradation for this client's owner.
   * Only fires when the client is owner-tracked AND a hook is installed; the
   * original error is NOT swallowed (no auto-fallback; it continues to throw).
   */
  #notifyDeGrade(cls: "credential" | "quota", reason: string): void {
    const { owner, onCredentialFailure } = this.#options;
    if (!owner || !onCredentialFailure) return;
    try {
      onCredentialFailure(owner, cls, reason);
    } catch {
      /* the recorder must never break the request path */
    }
  }

  /** OC#7 — a successful completion clears any prior degradation for the owner. */
  #notifySuccess(): void {
    const { owner, onOwnerSuccess } = this.#options;
    if (!owner || !onOwnerSuccess) return;
    try {
      onOwnerSuccess(owner);
    } catch {
      /* best-effort; never break the success path */
    }
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const startedAt = Date.now(); // F#30: per-request generation span
    const { baseUrl, apiKey, model: defaultModel } = this.#options;
    // Per-request model override (compaction FreeTierError fallback): the
    // compaction summary passes `req.model` when the primary model is
    // contributor-gated so compaction survives without touching the user's
    // active main-loop model.
    const model = req.model ?? defaultModel;
    // opencode.ai: the gateway rejects NON-streaming requests from keyless
    // clients as non-opencode (FreeTierError "can only be used from within
    // opencode"). The main loop always streams (AgentLoop.send injects a no-op
    // onDelta), but auxiliary calls — goal judge, best_of_n judge, MEA
    // guardian/auditor, dream distill, title, branch distill — call complete()
    // directly without onDelta → stream:false → rejected. Force streaming for
    // keyless opencode.ai so EVERY path survives. A no-op onDelta still yields
    // the final text (consumeSSEStream assembles it; onDelta is only an
    // optional per-token hook), so this is safe for text-only auxiliary calls.
    if (!req.onDelta) {
      const host = (() => { try { return new URL(baseUrl).hostname; } catch { return ""; } })();
      if (!apiKey && /(^|\.)(opencode\.ai)$/i.test(host)) {
        req = { ...req, onDelta: () => {} };
      }
    }
    // Materialize header placeholders per request (opencode id format: 12 hex ts + 14 base62):
    //  - "{sid}"  → a stable id minted once per client instance (session identity,
    //               e.g. opencode's x-opencode-session — must not change mid-conversation
    //               or the server loses its per-session state).
    //  - "{rand}" → a fresh id on every request (request identity, e.g. x-opencode-request).
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.#options.headers ?? {})) {
      let out = v;
      // P#36: auxiliary calls (compaction summaries) carry their own
      // session id so "{sid}" resolves to the side-channel identity.
      if (out.includes("{sid}"))
        out = out
          .split("{sid}")
          .join(normalizeSid(req.sessionId ?? this.#sid, req.sessionId ?? this.#sid));
      if (out.includes("{rand}")) out = out.split("{rand}").join(opencodeIDBody());
      headers[k] = out;
    }
    const normalized = baseUrl
      .replace(/\/$/, "")
      .replace(/\/chat\/completions$/, "");
    const url = `${normalized}/chat/completions`;
    // opencode.ai host check (shared by the auth sentinel below and the
    // keyless-streaming rule): true when baseUrl points at opencode.ai or a
    // subdomain.
    const isOpencodeAi = /(^|\.)(opencode\.ai)$/i.test(normalized.split("/")[2] ?? "");
    const body: Record<string, unknown> = {
      model,
      messages: req.messages.map(toOpenAIMessage),
    };
    const tools = req.tools.length > 0 ? req.tools.map(toOpenAITool) : [];
    // extraTools (config-driven): append, deduped by function name — a real
    // tool of the same name wins over the stub.
    for (const t of this.#options.extraTools ?? []) {
      if (t && typeof t.function?.name === "string" && !tools.some((x) => x.function?.name === t.function.name))
        tools.push(t);
    }
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    const maxTokens = req.maxTokens ?? this.#options.maxTokens;
    if (maxTokens !== undefined) {
      body.max_tokens = maxTokens;
    }
    if (req.thinking) {
      body.thinking = { type: "enabled" };
    }
    // Streaming decision. Normally a request streams only when the caller asked
    // for deltas (req.onDelta). But the opencode.ai pool rejects non-streaming
    // requests as non-opencode clients — the same root cause as the
    // sub-agent fix. Auxiliary calls (goal judge, best_of_n, MEA
    // guardian/auditor, dream/title/branch distillation) bypass
    // AgentLoop.send()'s no-op onDelta injection, so they would emit
    // stream:false and be rejected. Enforce streaming for the keyless
    // opencode.ai case so EVERY such call is covered at the owner (the adapter
    // decides stream:false). consumeSSEStream treats onDelta as optional (onDelta?.()),
    // so a caller that only needs the final text still gets a fully assembled
    // response.
    const streaming =
      req.onDelta !== undefined || (isOpencodeAi && !apiKey);
    if (streaming) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    const payload = JSON.stringify(body);
    const maxAttempts = (this.#options.retries ?? DEFAULT_RETRIES) + 1;

    let lastError: unknown;
    let attempts = maxAttempts; // grows when a capacity-classified error shows up
    // OCL-R#4 — a server Retry-After hint is a LOWER bound: the next wait
    // must be at least that long (jitter rounds UP from the hint, never
    // down), otherwise we deterministically re-hit the 429. undefined →
    // plain symmetric-jitter exponential backoff.
    let retryFloorSec: number | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        // Exponential backoff with ±25% jitter, capped at 8s per gap. The
        // opencode.ai pool (and Cloudflare-fronted endpoints generally) fail in
        // bursts lasting tens of seconds ("Upstream request failed" /
        // connection resets); opencode survives the same bursts by retrying
        // far longer than a flat ~2s budget, so its users never see them.
        req.onRetry?.(attempt, lastError);
        await sleep(retryBackoffMs(attempt - 1, retryFloorSec));
      }
      let res: Response;
      try {
        // opencode.ai: a keyless client MUST still present the sentinel
        // "Bearer public" (captured from the official opencode 1.18.31 client
        // via mitmproxy). Absent the header entirely the gateway rejects with
        // FreeTierError "can only be used from within opencode"; with
        // "public" it routes to the anonymous pool (or 429 when that pool is
        // exhausted). Real keys always win over the sentinel.
        const authValue = apiKey
          ? `Bearer ${apiKey}`
          : isOpencodeAi
            ? "Bearer public"
            : undefined;
        res = await this.#fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authValue ? { authorization: authValue } : {}),
            ...headers,
          },
          body: payload,
          ...(req.signal ? { signal: req.signal } : {}),
          // CC#51 — bound the header wait. Without this a provider that
          // accepts the connection but never answers hangs the fetch forever
          // (TUI spins, no turn/end). A manual timer + catch below converts
          // the timeout into a distinctive "fetch timeout" error message that
          // NETWORK_FAILURE_RE matches, so the retry/park path owns it
          // (AbortSignal.timeout's TimeoutError message would NOT match).
          ...(RESPONSE_HEADER_TIMEOUT_MS() > 0
            ? { signal: req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(RESPONSE_HEADER_TIMEOUT_MS())]) : AbortSignal.timeout(RESPONSE_HEADER_TIMEOUT_MS()) }
            : {}),
        });
      } catch (err) {
        if (req.signal?.aborted) throw err;
        // CC#51 — response-header timeout: the provider accepted the
        // connection but never answered the HTTP request. Reclassify the
        // TimeoutError into a message NETWORK_FAILURE_RE matches ("fetch
        // timeout …"), so it enters the extended network retry budget (and
        // the agent-loop turn-level park cap) instead of being a fatal that
        // kills the turn.
        if (
          RESPONSE_HEADER_TIMEOUT_MS() > 0 &&
          (err as { name?: string })?.name === "TimeoutError"
        ) {
          lastError = new Error(`llm request failed: fetch failed (HTTP response headers not received within ${RESPONSE_HEADER_TIMEOUT_MS()}ms — provider accepted the connection but never answered)`);
          if (attempt < attempts - 1) continue;
          throw lastError;
        }
        lastError = err;
        // Classify over message + cause: undici wraps every network failure
        // as "fetch failed" and hides the OS code in err.cause.
        const msg = errFullText(err);
        const cls = classifyProviderError(0, msg);
        if (cls === "capacity") {
          attempts = Math.max(attempts, maxAttempts * CAPACITY_ATTEMPT_FACTOR);
        }
        // Network bursts outlast the flat retry budget: "fetch failed" /
        // connection resets come in bursts of tens of seconds (opencode.ai
        // pool, Cloudflare fronting) while the default budget tolerates ~20s — the
        // turn then dies on a transient blip ("run_cmd … fetch failed" then
        // the conversation just ends). Extend the budget for network-class
        // failures the same way capacity errors are (×3): ~2min of tolerance
        // instead of ~20s. opencode survives the same bursts exactly by
        // retrying far longer. UNREACHABLE endpoints (connection refused /
        // no such host) stay on the base budget: the failure is instant and
        // persistent — minutes of retrying a dead port helps nobody.
        // persists (a misconfigured port, a dead box) — do not retry at all:
        // fail on the first attempt so `aih run` against a dead endpoint
        // reports the error instantly instead of burning the backoff budget.
        if (NETWORK_FAILURE_RE.test(msg) && !NETWORK_UNREACHABLE_RE.test(msg)) {
          attempts = Math.max(attempts, maxAttempts * NETWORK_ATTEMPT_FACTOR);
        } else if (NETWORK_UNREACHABLE_RE.test(msg)) {
          attempts = 1;
        }
        if (attempt < attempts - 1) continue;
        throw err;
      }
      if (!res.ok) {
        const text = await res.text();
        const message = `llm request failed: HTTP ${res.status} ${text}`;
        // CC#51 — a quota/usage-window 429 is NOT a transient blip: it resets
        // on a schedule (minutes). Throw QuotaError so the AgentLoop can wait
        // for the reset and re-issue the SAME call (instead of burning the
        // retry budget and ending the turn with an error).
        // OMP-R#1 — take the MAXIMUM retry hint across ALL header sources
        // (retry-after-ms / retry-after / x-ratelimit-reset*), not just
        // retry-after; the horizon is authoritative, so the AgentLoop waits
        // exactly as long as the provider demanded.
        const retryAfterSec = retryAfterHintFromHeaders(res.headers);
        // OCL-R#4 — remember the hint as the floor for the NEXT backoff gap
        // (only for short/transient hints; long quota windows go through the
        // QuotaError path, which waits exactly that long in the AgentLoop).
        if (retryAfterSec !== undefined) retryFloorSec = retryAfterSec;
        if (isQuotaExhaustion(res.status, text, retryAfterSec)) {
          this.#notifyDeGrade("quota", message);
          throw new QuotaError(res.status, text, retryAfterSec ?? 0);
        }
        const cls = classifyProviderError(res.status, text);
        if (cls === "capacity") {
          attempts = Math.max(attempts, maxAttempts * CAPACITY_ATTEMPT_FACTOR);
        }
        const httpError = new Error(message);
        if (cls === "auth") this.#notifyDeGrade("credential", message);
        if ((cls === "retryable" || cls === "capacity") && attempt < attempts - 1) {
          lastError = httpError;
          continue;
        }
        throw httpError;
      }
      try {
        if (streaming && res.body) {
          // CC#49 — stall watchdogs: (1) the first data frame must arrive
          // within AIH_FIRST_TOKEN_TIMEOUT_MS; (2) frames must keep flowing
          // within AIH_STALL_TIMEOUT_MS. Firing cancels the read, which ends
          // the for-await inside consumeSSEStream. With partial text we throw
          // StallError (the AgentLoop resumes honestly); with none we fold
          // into the normal retry budget below.
          //
          // The body is read through an explicit reader: res.body.cancel() is
          // REJECTED while the stream is locked by the parse loop ("Invalid
          // state: ReadableStream is locked") — only reader.cancel() can
          // settle the pending read (it resolves it as {done:true}).
          const reader = res.body.getReader();
          const body = new ReadableStream<Uint8Array>({
            pull(controller) {
              return reader.read().then((r) =>
                r.done ? controller.close() : controller.enqueue(r.value),
              );
            },
          });
          let stalled = false;
          let stallMs = 0;
          const fire = (ms: number) => {
            if (stalled) return;
            stalled = true;
            stallMs = ms;
            reader.cancel().catch(() => {});
          };          const firstTimer = armStallTimer(FIRST_TOKEN_TIMEOUT_MS(), () => fire(FIRST_TOKEN_TIMEOUT_MS()));
          let stallTimer = armStallTimer(0, () => {});
          const activity = () => {
            // First activity disarms the first-token guard; every activity
            // re-arms the inter-frame guard.
            firstTimer.disarm();
            stallTimer.disarm();
            stallTimer = armStallTimer(STALL_TIMEOUT_MS(), () => fire(STALL_TIMEOUT_MS()));
          };
          let accOut: Awaited<ReturnType<typeof consumeSSEStream>>;
          try {
            accOut = await consumeSSEStream(body, {
              onDelta: req.onDelta,
              onReasoning: (req as any).onReasoning,
              onActivity: activity,
              // FA#3 — reasoning-runaway watchdog (disabled if either guard is 0).
              ...(REASONING_ONLY_TIMEOUT_MS() > 0 || REASONING_ONLY_MAX_CHARS() > 0
                ? {
                    reasoningWatchdog: {
                      maxChars: REASONING_ONLY_MAX_CHARS(),
                      timeoutMs: REASONING_ONLY_TIMEOUT_MS(),
                    },
                  }
                : {}),
            });
          } finally {
            firstTimer.disarm();
            stallTimer.disarm();
          }
          if (stalled) {
            throw new StallError(accOut.text, stallMs);
          }
          // OC-R#1 — a stream that ends with finish_reason network_error (HTTP
          // 200) is a connection cut masquerading as a normal end. Same family
          // as a stall: with partial text throw immediately so the AgentLoop
          // resumes honestly; without text fold into the retry budget below.
          if (isNetworkErrorFinish(accOut.finishReason)) {
            throw new NetworkFinishError(accOut.text, accOut.finishReason ?? "network_error");
          }
          this.#notifySuccess();
          return {
            text: accOut.text,
            toolCalls: accOut.toolCalls,
            stopReason: accOut.toolCalls.length > 0 ? "tool_use" : "end_turn",
            ...(accOut.finishReason ? { finishReason: accOut.finishReason } : {}),
            ...(accOut.usage ? { usage: accOut.usage } : {}),
            // F#30: real per-request generation time (request → last delta),
            // enabling a true streaming TPS metric (completion tokens / genMs).
            genMs: Math.max(0, Date.now() - startedAt),
          };
        }
        const ok = toResponse(await res.json());
        this.#notifySuccess();
        return ok;
      } catch (err) {
        if (req.signal?.aborted) throw err;
        // CC#49 — a stall with partial content is NOT retryable-blind: the
        // caller (AgentLoop) resumes from the partial text. With NO content,
        // fold into the normal retry budget like any transient failure.
        if (err instanceof StallError) {
          if (err.partialText.trim() !== "") throw err;
          if (attempt < maxAttempts - 1) {
            lastError = err;
            continue;
          }
        } else if (err instanceof NetworkFinishError) {
          // OC-R#1 — the stream ended cleanly (HTTP 200) but declared a
          // network error. With partial text, propagate so the AgentLoop
          // resumes honestly (the partial is preserved in the transcript);
          // without text it is a blind retry — fold into the budget.
          if (err.partialText.trim() !== "") throw err;
          if (attempt < maxAttempts - 1) {
            lastError = err;
            continue;
          }
        } else if (err instanceof ReasoningRunawayError) {
          // FA#3 — the stream reasoned forever without producing content or a
          // tool call. There is no partial text to resume from, so fold into
          // the retry budget (a fresh attempt may produce content).
          if (attempt < maxAttempts - 1) {
            lastError = err;
            continue;
          }
        } else if (attempt < maxAttempts - 1) {
          lastError = err;
          continue;
        }
        lastError = err;
        throw err;
      }
    }
    throw lastError;
  }
}

// TP#2: RETRYABLE / CAPACITY_ERROR / CAPACITY_ATTEMPT_FACTOR moved to llm-sse.ts classifyProviderError
// Kept as legacy re-export for backward compatibility.
const CAPACITY_ATTEMPT_FACTOR = 3;
/** Network-class failures get the same ×3 budget extension (see the fetch-catch). */
const NETWORK_ATTEMPT_FACTOR = 3;

/** Default transient-failure retry budget: 7 attempts ≈ 20s of backoff. */
export const DEFAULT_RETRIES = 6;

/**
 * Backoff before retry `attempt` (0-based): 400ms doubling to an 8s cap,
 * with ±25% jitter so concurrent clients don't re-synchronize.
 */
export function retryBackoffMs(attempt: number, floorSec?: number): number {
  // OCL-R#4 — an authoritative server hint is a LOWER bound: wait at least
  // that long, jitter strictly upward (hint → hint×1.5), so we never
  // deterministically re-hit a 429 by waiting less than demanded.
  if (floorSec !== undefined && floorSec > 0) {
    const floorMs = Math.min(floorSec * 1000, 60_000);
    return Math.round(floorMs * (1 + Math.random() * 0.5));
  }
  const base = Math.min(8000, 400 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TP#2: consumeStream removed — replaced by consumeSSEStream from llm-sse.ts
// Re-export for backward compatibility if any caller imported it.
export { consumeSSEStream as consumeStream } from "./llm-sse.js";

function mapUsage(u: any): TokenUsage {
  const cached =
    Number(u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens ?? u.cache_read_input_tokens) > 0
      ? Number(u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens ?? u.cache_read_input_tokens)
      : undefined;
  // F#30 — cache WRITE tokens (Anthropic cache_creation_input_tokens analog).
  const cacheWrite = Number(u.cache_creation_input_tokens) > 0 ? Number(u.cache_creation_input_tokens) : undefined;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
    ...(cached ? { cachedTokens: cached } : {}),
    ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}),
  };
}

function toResponse(data: any): LLMResponse {
  const message = data.choices?.[0]?.message ?? {};
  const finishReason: string | undefined = data.choices?.[0]?.finish_reason;
  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    args: parseArguments(tc.function.arguments),
  }));
  const usage: TokenUsage | undefined = data.usage ? mapUsage(data.usage) : undefined;

  return {
    text: message.content ?? "",
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}
