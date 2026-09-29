const test = require("node:test");
const assert = require("node:assert/strict");

function parseAuthRedirect(href) {
  const RESET_PASSWORD_PATH = "/auth/reset-password";
  const url = new URL(href);
  const hash = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const type = url.searchParams.get("type") || hash.get("type");
  const code = url.searchParams.get("code");
  const tokenHash =
    url.searchParams.get("token_hash") || url.searchParams.get("token");
  const next = url.searchParams.get("next");
  const isRecovery =
    type === "recovery" ||
    (next || "").includes(RESET_PASSWORD_PATH) ||
    url.pathname === RESET_PASSWORD_PATH ||
    hash.get("type") === "recovery";

  return {
    type,
    code,
    tokenHash,
    next,
    isRecovery,
    hasAuthPayload: Boolean(code || tokenHash || hash.get("access_token")),
  };
}

function buildPasswordRecoveryRedirectTo(origin) {
  const url = new URL("/auth/reset-password", origin);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

test("le mail de reset ouvre la page nouveau mot de passe, pas l’accueil", () => {
  assert.equal(
    buildPasswordRecoveryRedirectTo("https://www.bookeai.fr"),
    "https://www.bookeai.fr/auth/reset-password?type=recovery",
  );
});

test("un lien avec type=recovery est bien un reset", () => {
  const parsed = parseAuthRedirect(
    "https://www.bookeai.fr/auth/callback?code=abc&type=recovery",
  );
  assert.equal(parsed.isRecovery, true);
  assert.equal(parsed.hasAuthPayload, true);
});

test("un lien déjà sur /auth/reset-password reste un reset même sans type", () => {
  const parsed = parseAuthRedirect(
    "https://www.bookeai.fr/auth/reset-password?code=abc",
  );
  assert.equal(parsed.isRecovery, true);
  assert.equal(parsed.code, "abc");
});

test("un hash implicit recovery est détecté", () => {
  const parsed = parseAuthRedirect(
    "https://www.bookeai.fr/login#access_token=tok&type=recovery",
  );
  assert.equal(parsed.isRecovery, true);
  assert.equal(parsed.hasAuthPayload, true);
});
