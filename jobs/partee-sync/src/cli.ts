// CLI entry point (bun / node): bun src/cli.ts [--dry] [--from=YYYY-MM-DD --to=YYYY-MM-DD]
// Env: PARTEE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Prints the counts-only JSON run summary to stdout. Errors print a short code to stderr
// (never response bodies, never env values). Exit code 1 when the run aborted, any call
// failed or Partee rate-limited us, so GitHub e-mails the failure.
import { exitCodeFor, parseCliArgs } from './logic';
import { runSync } from './sync';
import type { Env } from './types';

const REQUIRED = ['PARTEE_API_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

function abort(code: string, extra: Record<string, unknown> = {}): never {
  console.error(JSON.stringify({ error: code, ...extra }));
  process.exit(2);
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) abort(parsed.error);

  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) abort('missing_env', { missing }); // names only

  const env: Env = {
    PARTEE_API_TOKEN: process.env.PARTEE_API_TOKEN!,
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };

  let summary;
  try {
    summary = await runSync(env, parsed.args);
  } catch (e) {
    // Messages come from fixed codes and HTTP statuses only (no bodies, no URLs).
    abort(e instanceof Error ? e.message.slice(0, 80) : 'unknown');
  }
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = exitCodeFor(summary);
}

void main();
