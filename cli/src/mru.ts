/**
 * MRU model history — "recently used first" for the model picker (opencode
 * DialogModel parity: the models you used most recently float to the top of
 * the switch-model list, so switching back is one keystroke away).
 *
 * Pure decision + persistence seam (cost.ts / scorecard.ts discipline — no
 * LLM, no TUI, unit-testable):
 *
 *   - `recordModelUse`        — append/prepend a used {provider, model} pair
 *   - `sortByRecent`          — reorder catalog entries, MRU-hit first
 *   - `readMru` / `writeMru`  — user-level JSON persistence
 *
 * Storage: <userAihDir>/mru-models.json (same XDG resolution as config.json;
 * AIH_HOME > XDG_DATA_HOME/aih > ~/.local/share/aih). A small capped list —
 * nothing sensitive, no permissions involved; failures are silent (a broken
 * MRU file must never break the picker or the switch).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { userAihDir } from "./paths.js";

/** One recently-used model selection. */
export interface MruModel {
  /** provider name from the model catalog (e.g. "qwen", "(default)") */
  provider: string;
  /** model id */
  model: string;
  /** ISO timestamp of the switch */
  ts: string;
}

/** How many recent entries we keep. */
export const MRU_MAX = 20;

/** Canonical key: `${provider}/${model}` — used for dedupe + lookup. */
export function mruKey(m: Pick<MruModel, "provider" | "model">): string {
  return `${m.provider}/${m.model}`;
}

/** Path of the MRU store (user-level, XDG-resolved). */
export function mruModelsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(userAihDir(env), "mru-models.json");
}

/** Read the stored list (oldest first); `[]` on any failure (silent). */
export function readMru(env: NodeJS.ProcessEnv = process.env): MruModel[] {
  try {
    const raw = readFileSync(mruModelsPath(env), "utf8");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is MruModel =>
        !!e &&
        typeof (e as MruModel).provider === "string" &&
        typeof (e as MruModel).model === "string" &&
        typeof (e as MruModel).ts === "string",
    );
  } catch {
    return [];
  }
}

/** Persist the list (user-level dir, created on demand). Failures are silent. */
export function writeMru(list: MruModel[], env: NodeJS.ProcessEnv = process.env): void {
  try {
    const p = mruModelsPath(env);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(list, null, 2) + "\n", "utf8");
  } catch {
    /* advisory — never fail a model switch over a broken MRU store */
  }
}

/**
 * Record a model use: prepend (most recent first), dedupe by provider/model,
 * cap at MRU_MAX. Returns the new list. Write is best-effort (silent).
 */
export function recordModelUse(
  provider: string,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
  now: () => string = () => new Date().toISOString(),
): MruModel[] {
  const entry: MruModel = { provider, model, ts: now() };
  const list = readMru(env).filter((m) => mruKey(m) !== mruKey(entry));
  list.unshift(entry);
  const capped = list.slice(0, MRU_MAX);
  writeMru(capped, env);
  return capped;
}

/**
 * Sort catalog entries so the ones that appear in the MRU list come first,
 * ordered by most-recent use; the rest keep their original (config) order.
 * Pure: returns a new array, never mutates `entries`.
 */
export function sortByRecent<T extends { provider: string; model: string }>(
  entries: readonly T[],
  mru: readonly MruModel[],
): T[] {
  if (!mru.length) return [...entries];
  const rank = new Map<string, number>();
  mru.forEach((m, i) => {
    if (!(rank.has(mruKey(m)))) rank.set(mruKey(m), i);
  });
  const out = [...entries];
  out.sort((a, b) => {
    const ra = rank.get(mruKey(a));
    const rb = rank.get(mruKey(b));
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1; // a is recent → first
    if (rb !== undefined) return 1; // b is recent → first
    return 0; // both not recent → keep original order (stable)
  });
  return out;
}