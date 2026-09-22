export const RESET_PASSWORD_PATH = "/auth/reset-password";
export const AUTH_CALLBACK_PATH = "/auth/callback";

export function parseAuthRedirect(href = window.location.href) {
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
    url.pathname === RESET_PASSWORD_PATH;

  return {
    url,
    hash,
    type,
    code,
    tokenHash,
    next,
    isRecovery,
    hasAuthPayload: Boolean(code || tokenHash || hash.get("access_token")),
  };
}

export function buildResetPasswordHref(href = window.location.href) {
  const { url } = parseAuthRedirect(href);
  const nextUrl = new URL(RESET_PASSWORD_PATH, url.origin);
  url.searchParams.forEach((value, key) => {
    if (key !== "next") {
      nextUrl.searchParams.set(key, value);
    }
  });
  nextUrl.hash = url.hash;
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}
