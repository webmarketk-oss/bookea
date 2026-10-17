import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAuthFeedback } from "./auth-errors.ts";
import { isPublishableSupabaseKey } from "./supabase-fetch.ts";

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
