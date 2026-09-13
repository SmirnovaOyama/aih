// Shell environment policy (borrowed from Codex CLI's shell_environment_policy,
// Apache-2.0): spawned commands get a filtered environment so secrets
// (API keys, tokens, passwords) are not exposed to agent-executed processes.

const SECRET_HINT = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|CREDENTIAL)/i;

/**
 * Provider API-key env var names (provider-catalog `apiKeyEnv` + the generic
 * `AIH_API_KEY`). buildChildEnv() filters out every name matching SECRET_HINT
 * — which would also strip the LLM credential a BACKGROUND agent (`aih run`)
 * legitimately needs. Callers that spawn a child which itself runs an AI
 * turn (jobs.ts spawnJob, teams dispatchTask) should re-inject exactly these
 * names via `opts.set` when the value exists in the parent env.
 */
export const LLM_API_KEY_ENVS: readonly string[] = [
  "AIH_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENCODE_API_KEY",
  "OPENROUTER_API_KEY",
  "GITHUB_COPILOT_API_KEY",
  "DEEPSEEK_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "XAI_API_KEY",
  "MOONSHOT_API_KEY",
  "ZHIPU_API_KEY",
  "DASHSCOPE_API_KEY",
  "SILICONFLOW_API_KEY",
] as const;

export interface EnvPolicyOptions {
  /** Extra vars to force-set in the child env after filtering (Codex `set`). */
  set?: Record<string, string>;
}

/**
 * Build the child process env:
 *  1. drop variables whose NAME looks secret-bearing (default excludes);
 *  2. drop AIH provider credentials explicitly (AIH_API_KEY etc.);
 *  3. apply forced `set` entries last.
 * PATH/HOME/TERM/SHELL and other benign vars pass through untouched.
 */
export function buildChildEnv(
  parent: NodeJS.ProcessEnv = process.env,
  opts: EnvPolicyOptions = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    // Default excludes: name contains a secret hint (KEY, TOKEN, SECRET...).
    if (SECRET_HINT.test(name)) continue;
    env[name] = value;
  }
  // The CLI's own provider credential never reaches child processes even if
  // renamed without a hint word.
  for (const name of Object.keys(env)) {
    if (name.startsWith("AIH_") && /API/i.test(name)) delete env[name];
  }
  if (opts.set) Object.assign(env, opts.set);
  return env;
}
