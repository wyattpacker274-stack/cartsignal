#!/usr/bin/env bash
# Creates the GitHub repo, commits, and pushes. Run scripts/setup-github.sh [name] [public|private]
set -euo pipefail

REPO="${1:-cartsignal}"
VIS="${2:-public}"
cd "$(dirname "$0")/.."

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not logged in."
  echo "Run:  gh auth login"
  echo "  -> GitHub.com, HTTPS, Login with a web browser, paste the 8-digit code"
  exit 1
fi

LOGIN="$(gh api user --jq .login)"
NAME="$(gh api user --jq '.name // .login')"
EMAIL="${LOGIN}@users.noreply.github.com"

echo "account: $LOGIN"
echo "repo:    $LOGIN/$REPO ($VIS)"

[ -d .git ] || git init -b main >/dev/null

git add -A
if git diff --staged --quiet; then
  echo "nothing to commit"
else
  git -c user.name="$NAME" -c user.email="$EMAIL" commit -m "CartSignal initial" >/dev/null
  echo "committed"
fi

if gh repo view "$LOGIN/$REPO" >/dev/null 2>&1; then
  echo "repo exists; pushing"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$LOGIN/$REPO.git"
  git push -u origin main
else
  gh repo create "$LOGIN/$REPO" "--$VIS" --source . --remote origin --push
fi

echo
echo "done: https://github.com/$LOGIN/$REPO"
echo "next: Settings -> Pages -> Source: GitHub Actions"
echo "then: Actions -> cartsignal -> Run workflow"
