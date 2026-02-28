import { createClient } from "@supabase/supabase-js";

/**
 * Service role client — bypasses RLS.
 * Only use in server-side code (API routes, tick endpoint).
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
