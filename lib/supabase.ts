import { createBrowserClient } from "@supabase/ssr";
import { fetchForSupabaseKey } from "@/lib/supabase-fetch";

export function createClient() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    global: { fetch: fetchForSupabaseKey(key) },
  });
}
