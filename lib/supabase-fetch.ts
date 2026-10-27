/** Les clés sb_publishable_ / sb_secret_ ne sont pas des JWT. */
export function isPublishableSupabaseKey(key: string) {
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
}

// Un rafraîchissement de session resté bloqué (onglet en veille, réseau coupé) faisait attendre
// toutes les requêtes indéfiniment. Avec un délai, Auth reçoit une erreur réseau et relance.
export const AUTH_FETCH_TIMEOUT_MS = 8000;
// Au-delà, la base a de toute façon coupé la requête (statement timeout).
export const REST_FETCH_TIMEOUT_MS = 25000;

export function supabaseFetchTimeoutMs(url: string) {
  if (/\/auth\/v1\//.test(url)) {
    return AUTH_FETCH_TIMEOUT_MS;
  }
  if (/\/rest\/v1\//.test(url)) {
    return REST_FETCH_TIMEOUT_MS;
  }
  return 0;
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function withTimeoutSignal(signal: AbortSignal | null | undefined, ms: number) {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) {
    return timeout;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeout]);
  }
  return signal;
}

/**
 * Le client Auth met la clé dans Authorization: Bearer.
 * Avec une clé publishable, Auth ne répond plus (erreur « {} »).
 * On laisse la clé dans apikey seulement.
 */
export function fetchForSupabaseKey(
  key: string,
  baseFetch: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  const publishable = isPublishableSupabaseKey(key);

  return (input, init) => {
    let nextInit = init;
    if (publishable) {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === `Bearer ${key}`) {
        headers.delete("Authorization");
      }
      nextInit = { ...nextInit, headers };
    }
    const timeoutMs = supabaseFetchTimeoutMs(requestUrl(input));
    if (timeoutMs > 0 && typeof AbortSignal.timeout === "function") {
      nextInit = { ...nextInit, signal: withTimeoutSignal(init?.signal, timeoutMs) };
    }
    return baseFetch(input, nextInit);
  };
}
