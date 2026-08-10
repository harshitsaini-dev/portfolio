#!/usr/bin/env bash
# Deploys one app's Worker. Usage: deploy.sh <web|admin>
#
# This is the ONLY sanctioned deploy entry point, and it exists partly for the
# tooling around the repository: an exact, argument-checked script can be
# allowlisted narrowly, where a free-form `wrangler deploy` invocation cannot.
#
# It must be run from a Linux environment (the WSL clone): OpenNext's bundling
# step recreates pnpm symlinks, which Windows denies without Developer Mode.
# The nvm/pnpm setup below is required because non-interactive shells do not
# source the profile that puts them on PATH.
#
# It deploys ONLY. It never creates, migrates, or deletes Cloudflare
# resources; bindings and vars are declared in each app's wrangler.jsonc
# (`keep_vars` keeps dashboard-set vars intact across deploys).
set -euo pipefail

APP="${1:?usage: deploy.sh <web|admin>}"
case "$APP" in
  web | admin) ;;
  *)
    echo "unknown app: $APP (expected web or admin)" >&2
    exit 1
    ;;
esac

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.local/share/pnpm:$PATH"

cd "$(dirname "$0")"

# BUILD, then deploy. `opennextjs-cloudflare deploy` uploads whatever is
# already in `.open-next/` — it does NOT rebuild. Deploying without this line
# silently ships the previous build: three commits in a row appeared to deploy
# successfully, reported fresh Version IDs, and served stale assets, which cost
# an hour of debugging a feature that had never actually left the machine. The
# asset hash in the served HTML was identical across all of them.
pnpm --filter "@portfolio/$APP" exec opennextjs-cloudflare build
exec pnpm --filter "@portfolio/$APP" exec opennextjs-cloudflare deploy
