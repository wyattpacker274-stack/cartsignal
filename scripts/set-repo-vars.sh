#!/usr/bin/env bash
# Sets the variables and secrets the workflow needs.
# Usage: scripts/set-repo-vars.sh <owner/repo> <baseUrl> <ownerEmail> <fromAddress> [resendApiKey]
set -euo pipefail

REPO="${1:?usage: set-repo-vars.sh <owner/repo> <baseUrl> <ownerEmail> <fromAddress> [resendApiKey]}"
BASE="${2:?base url required, e.g. https://you.github.io/cartsignal}"
EMAIL="${3:?owner email required}"
FROM="${4:?from address required, e.g. CartSignal <onboarding@resend.dev>}"
KEY="${5:-}"

gh variable set CARTSIGNAL_BASE_URL -R "$REPO" -b "$BASE"
gh variable set CARTSIGNAL_FROM -R "$REPO" -b "$FROM"
gh variable set CARTSIGNAL_BRAND -R "$REPO" -b "CartSignal"
gh secret set CARTSIGNAL_OWNER_EMAIL -R "$REPO" -b "$EMAIL"

if [ -n "$KEY" ]; then
  gh secret set RESEND_API_KEY -R "$REPO" -b "$KEY"
else
  echo "note: no Resend key passed; set RESEND_API_KEY later"
fi

echo
echo "set on $REPO:"
gh variable list -R "$REPO"
gh secret list -R "$REPO"
