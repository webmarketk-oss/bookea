import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAuthFeedback } from "./auth-errors.ts";
import {
  fetchForSupabaseKey,
  isPublishableSupabaseKey,
  supabaseFetchTimeoutMs,
} from "./supabase-fetch.ts";

describe("requêtes Supabase bloquées", () => {
  it("un rafraîchissement de session qui ne répond pas est coupé, pour que Auth relance", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const fetcher = fetchForSupabaseKey("eyJ.jwt.key", hanging);
    const started = Date.now();
    await assert.rejects(
      fetcher("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" }),
    );
    assert.ok(Date.now() - started < 12000);
  });

  it("délai court pour Auth, long pour les données, aucun pour le stockage", () => {
    assert.equal(supabaseFetchTimeoutMs("https://x.supabase.co/auth/v1/token"), 8000);
    assert.equal(supabaseFetchTimeoutMs("https://x.supabase.co/rest/v1/leads?select=id"), 25000);
    assert.equal(supabaseFetchTimeoutMs("https://x.supabase.co/storage/v1/object/a.png"), 0);
  });

  it("garde l’annulation demandée par l’appelant", async () => {
    let received: AbortSignal | null | undefined;
    const fetcher = fetchForSupabaseKey("sb_publishable_abc", async (_input, init) => {
      received = init?.signal;
      return new Response("{}");
    });
    const caller = new AbortController();
    await fetcher("https://x.supabase.co/rest/v1/leads", { signal: caller.signal });
    caller.abort();
    assert.equal(received?.aborted, true);
  });
});

describe("connexion publishable", () => {
  it("reconnaît une clé qui ne doit pas partir en Bearer", () => {
    assert.equal(isPublishableSupabaseKey("sb_publishable_abc"), true);
    assert.equal(isPublishableSupabaseKey("eyJhbGciOiJIUzI1NiJ9.e30.sig"), false);
  });

  it("ne montre pas {} quand Auth renvoie un objet vide", () => {
    const feedback = getAuthFeedback({ message: "{}" } as never, "login");
    assert.equal(feedback.type, "error");
    assert.equal(feedback.message.includes("{}"), false);
  });
});
