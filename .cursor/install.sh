#!/usr/bin/env bash
set -euo pipefail

# Repository bootstrap for the Bookea Cloud Agent environment.
# Runs after the repository is checked out. Must be idempotent.

cd "$(dirname "$0")/.."

# Install locked dependencies.
npm ci

# Bookea reads its Supabase/Brevo/Meta configuration from environment variables
# (NEXT_PUBLIC_* are inlined by Next.js). When real credentials are provided as
# environment secrets, Next.js resolves them from process.env first, so they take
# precedence over the file written below. When no secrets are configured, these
# safe placeholders let the app boot and run on its built-in local/mock data.
if [ ! -f .env.local ]; then
  cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key

NEXT_PUBLIC_BOOKEA_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_BOOKEA_PRO_URL=http://localhost:3000
NEXT_PUBLIC_BOOKEA_ADMIN_URL=http://localhost:3000

NEXT_PUBLIC_DEFAULT_CENTER_SLUG=jfg-clinique-clermont
EOF
  echo "Wrote placeholder .env.local (app runs on local/mock data)."
else
  echo ".env.local already present; leaving it untouched."
fi
