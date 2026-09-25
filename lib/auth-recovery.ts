export const RESET_PASSWORD_PATH = "/auth/reset-password";
export const AUTH_CALLBACK_PATH = "/auth/callback";

const PASSWORD_RECOVERY_FLAG = "bookea-password-recovery";
const PASSWORD_RECOVERY_MAX_AGE_MS = 60 * 60 * 1000;

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

export function markPasswordRecoveryPending() {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, String(Date.now()));
  } catch {
    // sessionStorage can be blocked in private mode
  }
}

export function isPasswordRecoveryPending(
  maxAgeMs = PASSWORD_RECOVERY_MAX_AGE_MS,
) {
  try {
    const raw = sessionStorage.getItem(PASSWORD_RECOVERY_FLAG);
    if (!raw) {
      return false;
    }

    const startedAt = Number(raw);
    return Number.isFinite(startedAt) && Date.now() - startedAt < maxAgeMs;
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryPending() {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG);
  } catch {
    // ignore
  }
}

export function buildPasswordRecoveryRedirectTo(origin: string) {
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set("next", RESET_PASSWORD_PATH);
  url.searchParams.set("type", "recovery");
  return url.toString();
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

export function buildCallbackHref(href = window.location.href) {
  const { url, isRecovery } = parseAuthRedirect(href);
  const nextUrl = new URL(AUTH_CALLBACK_PATH, url.origin);
  url.searchParams.forEach((value, key) => {
    nextUrl.searchParams.set(key, value);
  });
  if (isRecovery) {
    nextUrl.searchParams.set("type", "recovery");
    nextUrl.searchParams.set("next", RESET_PASSWORD_PATH);
  }
  nextUrl.hash = url.hash;
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}
