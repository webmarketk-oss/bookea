/**
 * Client serveur vers l'API d'un partenaire d'agenda.
 * Le secret vient d'une variable d'environnement (nom stocké sur la connexion), jamais de la base
 * ni du navigateur, et il n'apparaît dans aucun message d'erreur.
 */
const { getProvider } = require("./providers");

// Seules ces variables peuvent servir de secret partenaire (jamais SUPABASE_SERVICE_ROLE_KEY, etc.).
const SECRET_ENV = /^EXTERNAL_CALENDAR_[A-Z0-9_]{2,60}$/;
const REQUEST_TIMEOUT_MS = 15_000;

class ExternalCalendarError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.code = code;
    this.details = details;
  }
}

function resolveSecret(connection, env = process.env) {
  const name = String(connection?.secret_env || "").trim();
  if (!SECRET_ENV.test(name)) {
    throw new ExternalCalendarError(
      "invalid_secret_env",
      "secret_env doit être une variable EXTERNAL_CALENDAR_… définie côté serveur.",
    );
  }
  const secret = String(env[name] || "").trim();
  if (!secret) {
    throw new ExternalCalendarError("missing_secret", `Variable ${name} absente sur le serveur.`);
  }
  return secret;
}

function createExternalCalendarClient(
  connection,
  { env = process.env, fetchImpl = globalThis.fetch, registry } = {},
) {
  const provider = getProvider(connection?.provider, registry);
  if (!provider) {
    throw new ExternalCalendarError("unknown_provider", `Fournisseur inconnu : ${connection?.provider}`);
  }
  if (!provider.configured || typeof provider.listAppointments !== "function") {
    throw new ExternalCalendarError(
      "provider_not_configured",
      `${provider.label} : intégration en attente de la documentation du partenaire.`,
      { pending: provider.pending || [] },
    );
  }
  const secret = resolveSecret(connection, env);
  const baseUrl = String(connection.base_url || provider.defaultBaseUrl || "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(baseUrl)) {
    throw new ExternalCalendarError("invalid_base_url", "URL de l'API partenaire absente ou non HTTPS.");
  }

  async function request(path, { query = {}, method = "GET" } = {}) {
    if (method !== "GET") {
      throw new ExternalCalendarError("read_only", "Le connecteur partenaire est en lecture seule.");
    }
    const url = new URL(`${baseUrl}/${String(path).replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers: { Accept: "application/json", ...(provider.authHeaders?.(secret) || {}) },
        signal: controller.signal,
      });
    } catch (error) {
      throw new ExternalCalendarError(
        error?.name === "AbortError" ? "partner_timeout" : "partner_unreachable",
        "API partenaire injoignable.",
      );
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ExternalCalendarError("partner_auth_failed", "Clé API partenaire refusée.", {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ExternalCalendarError("partner_http_error", `API partenaire : HTTP ${response.status}.`, {
        status: response.status,
      });
    }
    return response.json();
  }

  return {
    provider,
    /** Rendez-vous du partenaire, déjà convertis au format commun. */
    async listAppointments(params) {
      const raw = await provider.listAppointments({ ...params, request });
      return (Array.isArray(raw) ? raw : []).map((item) => provider.normalize(item));
    },
  };
}

module.exports = {
  ExternalCalendarError,
  SECRET_ENV,
  createExternalCalendarClient,
  resolveSecret,
};
