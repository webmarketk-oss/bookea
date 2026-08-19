# Supabase, Multi-Centres Et Authentification

Cette base permet de garder l'interface actuelle et de la brancher progressivement sur une vraie plateforme Bookea.

## Les 3 Espaces

- `bookeai.fr` : interface publique cliente.
- `app.bookeai.fr` : espace centre, CRM, agenda, facturation, documents.
- `admin.bookeai.fr` : espace WebK/Bookea pour gérer les centres, utilisateurs, droits, abonnements, support et supervision globale.

## Regle Principale

Toutes les donnees d'un centre doivent porter un `center_id`.

Supabase RLS verifie ensuite que l'utilisateur connecte appartient bien au centre avant de lire ou modifier les donnees. Un centre ne peut donc pas voir les clientes, rendez-vous, factures, documents, messages ou statistiques d'un autre centre.

## Un Utilisateur Peut Avoir Plusieurs Centres

Un meme compte peut etre rattache a plusieurs centres via `center_members`.

Exemple :

- Samantha peut avoir acces a `JFG Clinique Clermont`.
- Samantha peut aussi avoir acces a un deuxieme centre.
- Dans l'interface pro, elle choisit le centre actif avec un selecteur rapide.
- Le dernier centre utilise est stocke dans `center_user_preferences.last_center_id`.

Important : toutes les requetes de l'application pro doivent utiliser le `center_id` actif. Quand l'utilisateur change de centre, l'interface recharge uniquement les donnees de ce centre.

## Droits Et Modules

Les modules sont geres par :

- `bookea_features` : liste des modules disponibles.
- `center_feature_flags` : modules actifs ou non pour un centre.
- `member_permission_overrides` : exceptions par utilisateur.

Exemples de modules :

- CRM Leads
- CRM Clients
- Seya CRM
- Marketing
- Messagerie Bookea
- Mailing
- Envoi SMS
- Agenda
- Facturation
- Documents
- Statistiques
- Parametres interface client

Comme ca, WebK peut dire : ce centre a la facturation mais pas encore le mailing, ou cette praticienne peut voir l'agenda mais pas les chiffres.

## Bookea Admin

`bookea_admins` sert a donner a ton equipe WebK/Bookea un acces global.

L'admin pourra ensuite :

- creer un centre ;
- rattacher des utilisateurs ;
- activer ou couper des modules ;
- aider le support ;
- voir les statistiques globales ;
- superviser les campagnes globales ;
- corriger les doublons ou erreurs de configuration.

## Leads Publics Et Attribution Automatique

Quand une cliente reserve depuis Bookea public, l'interface publique envoie une demande dans `lead_routing_requests`.

La demande contient :

- nom, prenom, telephone, email ;
- ville ou coordonnees GPS ;
- prestation ou categorie recherchee ;
- campagne eventuelle ;
- date ou creneau souhaite.

Supabase attribue ensuite automatiquement le lead :

1. au centre public le plus proche si latitude/longitude disponibles ;
2. sinon au centre de la meme ville ;
3. sinon au premier centre compatible avec la categorie.

Le centre recoit alors le lead avec :

- `source_channel = organique` si ca vient directement de Bookea ;
- `assigned_by = public_nearest_center`, `public_city_match` ou `public_category_fallback` ;
- statut de rendez-vous confirme si la cliente a reserve un creneau ;
- presence dans le planning du centre.

## Campagnes Globales

Une campagne peut etre globale avec `campaigns.is_global = true`.

Exemple : Bookea lance une campagne nationale Hydrafacial. Une cliente reserve depuis Aubiere. Le lead est attribue au centre le plus proche qui propose Hydrafacial, tout en gardant la campagne d'origine.

Ca permet de distinguer :

- organique pur ;
- campagne centre ;
- campagne globale Bookea ;
- conversion par centre.

## Anti-Doublon

Pour eviter d'avoir plusieurs fiches pour la meme personne :

1. email normalise ;
2. telephone normalise ;
3. prenom + nom + date de naissance si disponible.

Si la cliente existe deja dans le centre, on reutilise sa fiche. Si elle existe comme cliente, on ne recree pas un prospect : on ajoute seulement le rendez-vous confirme et l'historique.

## Installation Supabase

1. Creer un projet Supabase, idealement en region Europe pour les utilisateurs francais.
2. Ouvrir le SQL Editor Supabase.
3. Executer `supabase/migrations/0001_bookea_core.sql`.
4. Executer `supabase/migrations/0002_multi_center_platform.sql`.
5. Dans Authentication > URL Configuration, ajouter les URLs de redirection :
   - `http://localhost:3001/auth/callback`
   - `https://bookeai.fr/auth/callback`
   - `https://app.bookeai.fr/auth/callback`
   - `https://admin.bookeai.fr/auth/callback`
6. Copier les variables dans `.env.local` puis dans l'hebergement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. Ajouter le premier admin Bookea :

```sql
insert into public.bookea_admins (profile_id, label)
values ('UUID_DU_PROFIL_ADMIN', 'Samantha');
```

8. Configurer le premier centre avec `public_slug`, adresse, ville, latitude, longitude et `is_public = true`.
9. Rattacher les utilisateurs au centre dans `center_members`.

## Ordre De Branchement De L'Interface

1. Authentification : connexion, inscription, session utilisateur.
2. Selecteur de centre : afficher les centres accessibles et sauvegarder le centre actif.
3. Permissions : masquer les menus non autorises.
4. CRM leads et clients : brancher listes, statuts, commentaires, doublons.
5. Agenda : rendez-vous, cabines, praticiennes, indisponibilites, notes du jour.
6. Interface publique : reservation organique, compte client, fidelite, messagerie.
7. Facturation et documents : devis, factures, paiements, fichiers clients.
8. Automatisations : SMS, WhatsApp, email, anniversaires, relances et agent Seya.

## Ce Qui Est Pret

- La structure multi-centres.
- Les permissions par centre et par utilisateur.
- Le socle Bookea Admin.
- Le routage des leads publics vers le centre le plus proche.
- Le dedoublonnage de base par email, telephone et identite.
- Les campagnes globales.

## Ce Qu'il Reste A Brancher

La migration prepare la base. Ensuite il faut connecter les ecrans existants :

- chaque requete pro doit filtrer par `center_id` actif ;
- le menu doit afficher uniquement les modules autorises ;
- la reservation publique doit creer une ligne dans `lead_routing_requests` ;
- l'admin doit permettre de creer centres, utilisateurs, droits et modules ;
- la fusion de doublons doit avoir une vraie interface de validation.
