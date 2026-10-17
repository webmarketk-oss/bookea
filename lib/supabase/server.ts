import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchForSupabaseKey } from "@/lib/supabase-fetch";

export async function createClient() {
  const cookieStore = await cookies();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      global: { fetch: fetchForSupabaseKey(key) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignoré dans les Server Components en lecture seule
          }
        },
      },
    }
  );
}
