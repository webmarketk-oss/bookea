# Connexion des agendas partenaires — API Bookea

Ce document a deux parties :

1. **Pour le partenaire** : lire les rendez-vous Bookea (API REST en lecture seule).
2. **Pour l'équipe Bookea** : générer / révoquer l'accès partenaire, et brancher l'API du partenaire.

Centres concernés au lancement : **JFG Clinic Clermont-Ferrand** et **JFG Clinic Terville**, chacun avec sa propre clé.

---

## 1. API Bookea pour le partenaire (lecture seule)

### Principe

- Accès **en lecture seule** : seules les requêtes `GET` sont acceptées. Création, modification et suppression sont refusées (`405`).
- Une clé donne accès **uniquement** aux agendas (centres) pour lesquels elle a été générée, éventuellement limités à certaines cabines.
- **Aucune donnée client** n'est transmise : ni nom, ni téléphone, ni e-mail, ni soin, ni notes. Uniquement l'horaire, l'agenda, la cabine, le statut et les dates de modification.
- Les créneaux que Bookea a lui-même importés depuis l'agenda du partenaire ne sont **jamais renvoyés** au partenaire (pas d'aller-retour).

### Adresse et authentification

```
Base URL : https://bookeai.fr/api/partner/v1
En-tête  : Authorization: Bearer bkp_xxxxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

L'en-tête `X-Api-Key: bkp_…` est aussi accepté. La clé doit rester côté serveur chez le partenaire (jamais dans une page web ou une application mobile).

Limite : **120 requêtes par minute** et par clé (au-delà : `429`).

### Fuseau horaire

Les horaires sont renvoyés en **ISO 8601 avec décalage** (ex. `2026-11-02T09:30:00+01:00`) et le champ `timezone` indique le fuseau du centre (`Europe/Paris`). L'heure d'été est prise en compte (`+02:00`).

---

### `GET /calendars` — agendas autorisés

Liste les agendas (un par centre) et leurs cabines accessibles avec la clé.

```bash
curl -s https://bookeai.fr/api/partner/v1/calendars \
  -H "Authorization: Bearer $BOOKEA_PARTNER_KEY"
```

```json
{
  "data": [
    {
      "id": "6f1c2a8e-5d1b-4a43-9a0e-2f7f1b3c9d10",
      "name": "JFG Clinic Clermont-Ferrand",
      "timezone": "Europe/Paris",
      "rooms": [
        { "id": "9b2e6c41-0f3a-4d55-8b7e-1a2b3c4d5e6f", "name": "Cabine 1" },
        { "id": "c3d4e5f6-1a2b-4c3d-9e8f-7a6b5c4d3e2f", "name": "Cabine 2" }
      ]
    }
  ]
}
```

---

### `GET /appointments` — rendez-vous

| Paramètre       | Format                     | Description |
|-----------------|----------------------------|-------------|
| `calendar_id`   | identifiant d'agenda       | Un agenda précis (doit être autorisé, sinon `403`). Par défaut : tous les agendas de la clé. |
| `room_id`       | identifiant de cabine      | Une cabine précise (doit être autorisée). |
| `from`          | `AAAA-MM-JJ`               | Premier jour inclus. |
| `to`            | `AAAA-MM-JJ`               | Dernier jour inclus. Période maximale : 366 jours. |
| `updated_since` | date-heure ISO 8601        | Seulement ce qui a changé depuis cet instant (création, modification, annulation, suppression). |
| `limit`         | entier 1–500               | Taille de page (défaut 100). |
| `cursor`        | texte                      | Page suivante (valeur `next_cursor` de la réponse précédente). |

Sans `updated_since` ni période, la réponse couvre **aujourd'hui → +90 jours**. Avec `updated_since` seul, toutes les dates sont concernées.

Les résultats sont triés par **dernière modification** puis identifiant : la pagination est stable.

#### Exemple : rendez-vous d'un agenda sur une période

```bash
curl -s "https://bookeai.fr/api/partner/v1/appointments?calendar_id=6f1c2a8e-5d1b-4a43-9a0e-2f7f1b3c9d10&from=2026-11-01&to=2026-11-30&limit=100" \
  -H "Authorization: Bearer $BOOKEA_PARTNER_KEY"
```

```json
{
  "data": [
    {
      "id": "0b7f3d2a-8c41-4e9b-b1a3-5d6e7f8091a2",
      "calendar_id": "6f1c2a8e-5d1b-4a43-9a0e-2f7f1b3c9d10",
      "room_id": "9b2e6c41-0f3a-4d55-8b7e-1a2b3c4d5e6f",
      "type": "appointment",
      "start": "2026-11-02T09:30:00+01:00",
      "end": "2026-11-02T10:15:00+01:00",
      "timezone": "Europe/Paris",
      "status": "confirmed",
      "cancelled": false,
      "deleted": false,
      "created_at": "2026-10-20T08:00:00.000Z",
      "updated_at": "2026-10-27T08:00:00.000Z"
    },
    {
      "id": "4a5b6c7d-8e9f-4a1b-8c2d-3e4f5a6b7c8d",
      "calendar_id": "6f1c2a8e-5d1b-4a43-9a0e-2f7f1b3c9d10",
      "room_id": "c3d4e5f6-1a2b-4c3d-9e8f-7a6b5c4d3e2f",
      "type": "block",
      "block_kind": "Pause",
      "start": "2026-11-03T12:30:00+01:00",
      "end": "2026-11-03T13:30:00+01:00",
      "timezone": "Europe/Paris",
      "status": "confirmed",
      "cancelled": false,
      "deleted": false,
      "created_at": "2026-10-21T09:00:00.000Z",
      "updated_at": "2026-10-21T09:00:00.000Z"
    }
  ],
  "deleted": [],
  "next_cursor": null
}
```

#### Exemple : synchronisation incrémentale (recommandée)

Le partenaire garde la date de sa dernière lecture et ne demande que les changements :

```bash
curl -s "https://bookeai.fr/api/partner/v1/appointments?updated_since=2026-10-28T09:00:00Z&limit=500" \
  -H "Authorization: Bearer $BOOKEA_PARTNER_KEY"
```

```json
{
  "data": [
    {
      "id": "0b7f3d2a-8c41-4e9b-b1a3-5d6e7f8091a2",
      "calendar_id": "6f1c2a8e-5d1b-4a43-9a0e-2f7f1b3c9d10",
      "room_id": "9b2e6c41-0f3a-4d55-8b7e-1a2b3c4d5e6f",
      "type": "appointment",
      "start": "2026-11-02T09:30:00+01:00",
      "end": "2026-11-02T10:15:00+01:00",
      "timezone": "Europe/Paris",
      "status": "cancelled",
      "cancelled": true,
      "deleted": false,
      "created_at": "2026-10-20T08:00:00.000Z",
      "updated_at": "2026-10-28T09:12:41.512000Z"
    }
  ],
  "deleted": [
    {
      "id": "7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b",
      "calendar_id": "6f1c2a8e-5d1b-4a43-9a0e-2f7f1b3c9d10",
      "room_id": "9b2e6c41-0f3a-4d55-8b7e-1a2b3c4d5e6f",
      "start": "2026-11-04T14:00:00+01:00",
      "end": "2026-11-04T15:00:00+01:00",
      "timezone": "Europe/Paris",
      "status": "deleted",
      "cancelled": true,
      "deleted": true,
      "updated_at": "2026-10-28T09:30:02.000Z"
    }
  ],
  "next_cursor": null
}
```

Recommandation : relire **toutes les 5 minutes** avec `updated_since` = instant de la lecture précédente **moins 1 minute** (marge), puis suivre `next_cursor` jusqu'à `null`. Les éléments déjà connus se reconnaissent à leur `id` (stable) : il suffit de les mettre à jour, sans créer de doublon. La liste `deleted` est renvoyée sur la première page d'une lecture `updated_since`.

#### Champs

| Champ         | Description |
|---------------|-------------|
| `id`          | Identifiant **stable** du rendez-vous Bookea (ne change jamais, même si l'horaire est déplacé). |
| `calendar_id` | Agenda (centre). |
| `room_id`     | Cabine, ou `null`. |
| `type`        | `appointment` (rendez-vous) ou `block` (pause, formation, indisponibilité). |
| `block_kind`  | Pour un `block` : `Pause`, `Formation` ou `Indisponible`. |
| `start`, `end`| Début et fin, ISO 8601 avec décalage. |
| `timezone`    | Fuseau du centre (`Europe/Paris`). |
| `status`      | `confirmed`, `to_confirm`, `present`, `in_progress`, `done`, `no_show`, `quote`, `sold`, `cancelled` ; `deleted` dans la liste `deleted`. |
| `cancelled`   | `true` si le rendez-vous est annulé ou supprimé : le créneau est libre. |
| `deleted`     | `true` si le rendez-vous a été supprimé de l'agenda. |
| `updated_at`  | Dernière modification (UTC). |

#### Erreurs

```json
{ "error": { "code": "calendar_not_allowed", "message": "Cet agenda n'est pas autorisé pour cette clé." } }
```

| HTTP | `code` | Cas |
|------|--------|-----|
| 400 | `invalid_from`, `invalid_to`, `invalid_period`, `period_too_long`, `invalid_updated_since`, `invalid_limit`, `invalid_cursor`, `invalid_calendar_id`, `invalid_room_id` | Paramètre invalide. |
| 401 | `invalid_api_key`, `revoked_api_key` | Clé absente, inconnue ou révoquée. |
| 403 | `calendar_not_allowed`, `room_not_allowed`, `insufficient_scope` | Agenda ou cabine non autorisé pour la clé. |
| 405 | `method_not_allowed` | Autre verbe que `GET`. |
| 429 | `too_many_requests` | Plus de 120 requêtes / minute. |
| 500 | `appointments_unavailable`, `calendars_unavailable` | Erreur temporaire : réessayer. |

---

## 2. Procédure interne Bookea

### Prérequis (une seule fois)

Lancer `supabase/migrations/0011_partner_calendar_api.sql` dans l'éditeur SQL Supabase.

### Générer une clé partenaire

Retrouver les identifiants courts (« slug ») des centres :

```sql
select name, slug from public.centers
where name ilike '%clermont%' or name ilike '%terville%';
```

Une clé **par centre** (chaque centre son accès) :

```sql
select * from public.create_partner_api_key(
  'Thierry Gascon',
  array['jfg-clinic-clermont'],          -- slug du centre
  'Agenda partenaire — Clermont-Ferrand'
);
```

Le résultat affiche `key_id` et `api_key`. **La clé n'est affichée qu'une seule fois** (seule son empreinte est stockée). La transmettre au partenaire par un canal sûr (pas par e-mail en clair si possible), puis recommencer pour Terville.

Limiter la clé à certaines cabines (facultatif) :

```sql
update public.partner_api_keys
set room_ids = array['<id cabine 1>', '<id cabine 2>']::uuid[]
where id = '<key_id>';
```

### Voir les accès existants

```sql
select id, partner_name, note, center_ids, room_ids, created_at, last_used_at, revoked_at
from public.partner_api_keys
order by created_at desc;
```

### Révoquer un accès

Effet immédiat (toutes les requêtes suivantes reçoivent `401 revoked_api_key`) :

```sql
select public.revoke_partner_api_key('<key_id>');
```

Pour remplacer une clé : en générer une nouvelle, la transmettre, puis révoquer l'ancienne.

---

## 3. Lire les rendez-vous du partenaire (côté Bookea)

### Lecture ou import : deux modes

| Mode | Effet |
|------|-------|
| `read` (défaut) | Les rendez-vous du partenaire sont lus et rangés dans `external_appointments` (horaire, statut, agenda d'origine). **L'agenda Bookea n'est pas modifié.** |
| `import` | En plus, chaque rendez-vous du partenaire **bloque un créneau « Indisponible »** dans la cabine liée de l'agenda Bookea. Déplacé si le partenaire le modifie, annulé s'il l'annule ou le supprime. |

Garde-fous :

- Un rendez-vous partenaire = **une seule ligne** (clé : identifiant du partenaire). Relire plusieurs fois ne crée pas de doublon.
- Un rendez-vous qui vient de Bookea et que le partenaire nous renvoie n'est **pas réimporté** (si leur API fournit notre identifiant).
- Les créneaux importés (`origin = partner_import`) ne sont **jamais renvoyés** au partenaire par notre API.
- Le connecteur **n'écrit jamais chez le partenaire** (lecture seule).
- Le partenaire **ne peut rien créer, modifier ni supprimer** chez nous. Toute écriture devra faire l'objet d'une validation explicite.
- Les annulations sont prises en compte quand le partenaire les signale (statut annulé) ou, lors d'une relecture complète, quand un rendez-vous connu disparaît de leur réponse.

### Stockage du secret

La clé API du partenaire est stockée **uniquement dans les variables d'environnement Vercel** (jamais dans la base, le dépôt ou le navigateur) :

```
EXTERNAL_CALENDAR_GASCON_CLERMONT=<clé fournie pour Clermont>
EXTERNAL_CALENDAR_GASCON_TERVILLE=<clé fournie pour Terville>
```

Seules les variables commençant par `EXTERNAL_CALENDAR_` peuvent servir de secret partenaire.

### Déclarer une connexion (une par centre)

```sql
insert into public.external_calendar_connections (center_id, provider, label, base_url, secret_env, mode, enabled)
select id, 'gascon', 'Agenda Thierry Gascon', '<URL de base de leur API>', 'EXTERNAL_CALENDAR_GASCON_CLERMONT', 'read', false
from public.centers where slug = 'jfg-clinic-clermont';
```

Relier chaque agenda du partenaire à une cabine Bookea :

```sql
insert into public.external_calendar_mappings (connection_id, external_calendar_id, room_id)
values ('<id connexion>', '<identifiant de leur agenda>', '<id cabine Bookea>');
```

Activer quand le fournisseur est finalisé (voir ci-dessous), puis lancer une lecture :

```sql
update public.external_calendar_connections set enabled = true where id = '<id connexion>';
```

```bash
curl -X POST https://bookeai.fr/api/integrations/external-calendar-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

Une fois validée, la lecture pourra être planifiée (ex. toutes les 5 minutes) dans `vercel.json`.

### Ce qui reste à faire côté code

Le fournisseur `gascon` (`api/integrations/_external-calendar/providers.js`) est volontairement **non configuré** : aucun endpoint n'a été deviné. Tant qu'il ne l'est pas, la synchro s'arrête avec `provider_not_configured` et liste les informations manquantes. À la réception de leur documentation, il faudra renseigner : URL de base, en-têtes d'authentification, appel de lecture et pagination, conversion de leur format vers le format commun.

---

## 4. Informations à obtenir du partenaire

1. **Documentation de leur API REST** (lecture des rendez-vous).
2. **URL de base** de test et de production.
3. **Méthode d'authentification** de leur clé API (en-tête `Authorization: Bearer`, en-tête dédié, paramètre…), durée de validité, rotation.
4. **Endpoint de lecture** des rendez-vous : filtres disponibles (période, agenda, dernière modification), pagination, limites de débit.
5. **Format d'un rendez-vous** : identifiant stable, début/fin, fuseau, statut, date de modification.
6. **Annulations et suppressions** : comment elles apparaissent (statut, liste dédiée, disparition).
7. **Identifiants de leurs agendas** pour Clermont-Ferrand et Terville, et à quelles cabines Bookea ils correspondent.
8. **Accès de test** (clé et agenda de test) avant la production.
9. S'ils conservent notre `id` quand ils lisent nos rendez-vous : le renvoyer dans leur API permet d'éviter tout réimport.
10. **Mode souhaité** chez nous : simple lecture, ou blocage des créneaux dans l'agenda Bookea (import).
