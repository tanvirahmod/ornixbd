// ── Bounded-concurrency Supabase REST runner ──
// Firing 13+ queries at once over a single HTTP/2 connection trips the CDN's
// per-connection stream limit (ERR_HTTP2_SERVER_REFUSED_STREAM in the console,
// datasets silently rendering empty). This runs the same queries in small
// waves with a retry for transient network errors, so a login burst loads
// completely instead of half-failing.
//
// Callers pass FACTORIES that build a fresh supabase query each time (a
// PostgrestBuilder resolves only once, so retries must rebuild it). The
// mapped-tuple return keeps each slot's own { data, error } typing.

/** Anything awaitable that resolves to the PostgREST { data, error } envelope. */
type QueryFactory = () => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const CONCURRENCY = 3; // requests in flight at once — well under CDN stream caps
const RETRIES = 2; // per query, transient failures only
const RETRY_DELAY_MS = 350;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** True for failures worth retrying: HTTP/2 stream refusal, offline blips, server errors. */
function isTransient(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? '');
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('ERR_HTTP2') ||
    msg.includes('ERR_NETWORK') ||
    msg.includes('Server refused stream') ||
    /\b5\d\d\b/.test(msg)
  );
}

/**
 * Run query factories with bounded concurrency and per-query retry.
 * Results keep the callers' order AND each slot's own data type; network
 * failures land in `error` instead of throwing.
 */
export async function runBounded<F extends QueryFactory[]>(
  factories: F,
  opts: { concurrency?: number; retries?: number } = {},
): Promise<{ [K in keyof F]: F[K] extends () => PromiseLike<{ data: infer D; error: any }> ? { data: D | null; error: { message: string } | null } : never }> {
  const concurrency = Math.max(1, opts.concurrency ?? CONCURRENCY);
  const retries = Math.max(0, opts.retries ?? RETRIES);
  const results = new Array<unknown>(factories.length);
  let next = 0;

  const worker = async () => {
    while (next < factories.length) {
      const idx = next++;
      let result: { data: unknown; error: { message: string } | null } | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const { data, error } = await factories[idx]();
          result = error ? { data: null, error } : { data, error: null };
          break;
        } catch (thrown) {
          // A thrown error IS the failure — shape it like a PostgREST error.
          const message = String((thrown as Error)?.message ?? thrown);
          result = { data: null, error: { message } };
          if (attempt < retries && isTransient(thrown)) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          break;
        }
      }
      results[idx] = result ?? { data: null, error: { message: 'Unknown error' } };
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, factories.length) }, () => worker()));
  return results as { [K in keyof F]: F[K] extends () => PromiseLike<{ data: infer D; error: any }> ? { data: D | null; error: { message: string } | null } : never };
}
