// ── socks5 proxy for webfetch / websearch (config `proxy` block) ─────────────
// Node 22 has no built-in SOCKS support (that's Node 24+ experimental), so we
// route through undici's official Socks5ProxyAgent (undici >= 8.9). It handles
// the SOCKS5 CONNECT handshake, optional username/password auth, AND the TLS
// wrap for https targets — exactly what webfetch/websearch need. Zero native
// deps (pure JS), so the offline package bundles it fine.
//
// Config (aih.json / user config / project config, later layers win):
//   { "proxy": { "socks5": "127.0.0.1:1080" } }
//   { "proxy": { "socks5": "127.0.0.1:1080", "username": "u", "password": "p" } }
// Env override (wins over config): AIH_SOCKS5_PROXY=127.0.0.1:1080
//
// Design: lazily build ONE Socks5ProxyAgent per endpoint (key = url:auth).
// `socksFetch` is a drop-in `fetch` returning undici's Response (spec-compatible
// with the global Response for the surface webfetch uses: .ok/.status/.headers/
// .arrayBuffer()).

import { Socks5ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

export interface SocksProxyConfig {
  /** host:port (default port 1080 when omitted) */
  socks5?: string;
  username?: string;
  password?: string;
  /** per-connection timeout ms (default 15s) */
  timeoutMs?: number;
}

export function resolveSocksProxy(
  config?: SocksProxyConfig,
  env?: NodeJS.ProcessEnv,
): SocksProxyConfig | undefined {
  const e = env ?? process.env;
  const raw = e.AIH_SOCKS5_PROXY || config?.socks5;
  if (!raw) return undefined;
  const [host] = raw.split(":");
  if (!host) return undefined;
  return {
    socks5: raw,
    username: config?.username,
    password: config?.password,
    timeoutMs: config?.timeoutMs ?? 15_000,
  };
}

// One agent per endpoint (key = url:auth). undici agents pool the SOCKS
// connections, so repeated fetches reuse the tunnel.
const agents = new Map<string, Dispatcher>();

function proxyUrlFor(cfg: SocksProxyConfig): string {
  const [host, portStr] = (cfg.socks5 ?? "").split(":");
  const port = Number(portStr ?? "1080");
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error(`proxy socks5 endpoint is invalid: "${cfg.socks5}" (expected host:port)`);
  }
  const user = cfg.username ? `${encodeURIComponent(cfg.username)}:` : "";
  const pass = cfg.username && cfg.password ? `${encodeURIComponent(cfg.password)}@` : "";
  return `socks5://${user}${pass}${host}:${port}`;
}

function agentFor(cfg: SocksProxyConfig): Dispatcher {
  const url = proxyUrlFor(cfg);
  const key = `${url}:${cfg.username ? "auth" : ""}`;
  const hit = agents.get(key);
  if (hit) return hit;
  const dispatcher: Dispatcher = new Socks5ProxyAgent(url, {
    connectTimeout: cfg.timeoutMs ?? 15_000,
  });
  agents.set(key, dispatcher);
  return dispatcher;
}

/**
 * fetch through the SOCKS5 tunnel. `init` is a plain object (method/headers/
 * body/signal/redirect) — typed loosely because undici's RequestInit and the
 * global RequestInit disagree on FormData identity; the fields webfetch/
 * websearch use are structurally compatible.
 */
export async function socksFetch(
  url: string | URL,
  init: Record<string, unknown> = {},
  cfg?: SocksProxyConfig,
): Promise<unknown> {
  const resolved = cfg ?? resolveSocksProxy();
  if (!resolved) throw new Error("socksFetch called without a socks5 proxy configured");
  const { dispatcher, ...rest } = init as Record<string, unknown> & { dispatcher?: Dispatcher };
  return undiciFetch(url, {
    ...rest,
    dispatcher: dispatcher ?? agentFor(resolved),
  } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<unknown>;
}
