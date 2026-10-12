const test = require("node:test");
const assert = require("node:assert/strict");
const { resetLink, sendPasswordResetLink } = require("./password-reset");

function fakeSupabase({ linkError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      admin: {
        async generateLink(params) {
          calls.push(params);
          return linkError
            ? { data: null, error: linkError }
            : { data: { properties: { hashed_token: "hash-123" } }, error: null };
        },
      },
    },
    from() {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    },
  };
}

function fakeFetch() {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({}) };
  };
  return { sent, fetchImpl };
}

const env = { BREVO_API_KEY: "test", BREVO_EMAIL_SENDER: "info@bookeai.fr" };

test("le lien mène à la page nouveau mot de passe avec un token_hash, sans dépendre du navigateur", () => {
  assert.equal(
    resetLink("hash-123"),
    "https://www.bookeai.fr/auth/reset-password?token_hash=hash-123&type=recovery",
  );
});

test("mot de passe oublié : Bookea envoie le lien par e-mail", async () => {
  const supabase = fakeSupabase();
  const { sent, fetchImpl } = fakeFetch();

  const result = await sendPasswordResetLink({
    supabase,
    email: "villefranche@jfg-clinic.com",
    fetchImpl,
    env,
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(supabase.calls[0].type, "recovery");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, [{ email: "villefranche@jfg-clinic.com" }]);
  assert.equal(sent[0].body.sender.email, "info@bookeai.fr");
  assert.match(sent[0].body.htmlContent, /token_hash=hash-123&amp;type=recovery|token_hash=hash-123&type=recovery/);
  assert.match(sent[0].body.textContent, /reset-password\?token_hash=hash-123/);
});

test("e-mail inconnu : rien n’est envoyé, sans erreur", async () => {
  const { sent, fetchImpl } = fakeFetch();
  const result = await sendPasswordResetLink({
    supabase: fakeSupabase({ linkError: { message: "User with this email not found" } }),
    email: "inconnu@exemple.fr",
    fetchImpl,
    env,
  });
  assert.deepEqual(result, { sent: false, reason: "unknown_email" });
  assert.equal(sent.length, 0);
});

test("sans Brevo : on laisse la page utiliser l’envoi Supabase", async () => {
  const supabase = fakeSupabase();
  const result = await sendPasswordResetLink({
    supabase,
    email: "a@b.fr",
    fetchImpl: fakeFetch().fetchImpl,
    env: {},
  });
  assert.deepEqual(result, { sent: false, reason: "missing_brevo" });
  assert.equal(supabase.calls.length, 0);
});
