# Bookea officiel

Ce dossier est la version principale à conserver et à pousser sur GitHub.

## Dossier principal

`/Users/khl/Documents/Codex/bookea-officiel`

## Ce que GitHub garde

- Le code source de Bookea
- L'historique des modifications
- Les migrations de base de données
- La documentation technique

## Ce que GitHub ne doit pas garder

- Les données clientes
- Les mots de passe
- Les clés Supabase, Stripe, Google ou OpenAI
- Les fichiers `.env.local`

## Où vont les données utilisateurs

Les données doivent aller dans une vraie base cloud, par exemple Supabase/Postgres.
GitHub sert à déployer et versionner le code, pas à stocker les clientes,
les rendez-vous, les paiements ou les factures.

## Objectif SaaS

Pour supporter beaucoup d'utilisateurs, le projet doit rester structuré ainsi :

- Code sur GitHub privé
- Déploiement sur Vercel, Sites ou équivalent
- Base Postgres/Supabase pour les données
- Sauvegardes automatiques de la base
- Variables sensibles stockées côté hébergeur
- Tests avant chaque déploiement
