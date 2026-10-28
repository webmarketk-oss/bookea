/**
 * Fournisseurs d'agenda externes.
 *
 * Un fournisseur décrit comment parler à l'API du partenaire. Tant que sa documentation
 * n'est pas reçue, `configured` reste false : aucune requête n'est envoyée et la synchro
 * s'arrête avec « provider_not_configured ». Aucun endpoint n'est deviné.
 *
 * Pour finaliser un fournisseur, il faut renseigner :
 *  - defaultBaseUrl : URL de base de leur API (ou base_url sur la connexion) ;
 *  - authHeaders(secret) : en-têtes d'authentification selon leur méthode (Bearer, clé en en-tête…) ;
 *  - listAppointments({ request, from, to, updatedSince, cursor }) : appel de lecture et pagination ;
 *  - normalize(raw) : conversion d'un rendez-vous de leur format vers le format commun :
 *      { externalId, calendarId, start, end, timezone, status: "confirmed" | "cancelled",
 *        updatedAt, sourceRef }
 *    sourceRef = identifiant Bookea si le rendez-vous vient de chez nous (pour ne pas le réimporter).
 */
const PROVIDERS = {
  gascon: {
    label: "Agenda partenaire Thierry Gascon",
    configured: false,
    pending: [
      "documentation de l'API REST",
      "URL de base (test et production)",
      "méthode d'authentification de la clé API",
      "endpoint de lecture des rendez-vous, filtres et pagination",
      "signalement des annulations et suppressions",
      "identifiants des agendas à connecter (Clermont-Ferrand, Terville)",
      "accès de test",
    ],
  },
};

function getProvider(name, registry = PROVIDERS) {
  return registry[String(name || "").trim().toLowerCase()] || null;
}

module.exports = { PROVIDERS, getProvider };
