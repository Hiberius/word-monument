import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// Backs the Next.js incremental cache (ISR + data cache) with the R2 bucket
// bound as NEXT_INC_CACHE_R2_BUCKET in wrangler.toml, instead of the default
// in-memory cache that would not survive across Worker invocations.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
