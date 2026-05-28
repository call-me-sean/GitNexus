#!/usr/bin/env bash
# Devcontainer postCreate driver. Runs once after the container is created
# (per devcontainer.json `postCreateCommand`). Each labeled step is its own
# command, so a failure log line names the step that failed instead of an
# opaque `&&`-chain index.

set -euo pipefail

cd /workspace

echo "[post-create] 1/7: chown workspace node_modules + named-volume mount points"
# `updateRemoteUserUID: true` realigns the `node` user's UID/GID at runtime
# on Linux hosts (no-op on Mac/Windows where Docker Desktop translates UIDs
# via its VM layer). The Dockerfile chown at build time targets the original
# UID; empty named volumes created at first mount inherit that ownership and
# end up owned by the stale UID after realignment. Re-chown here, post-
# realignment, so npm install can write to ~/.npm, the AI CLIs can write
# to their config dirs, and zsh history writes to /commandhistory succeed
# on hosts with non-1000 UIDs.
sudo chown -R node:node \
    /workspace/node_modules \
    /workspace/gitnexus/node_modules \
    /workspace/gitnexus-web/node_modules \
    /workspace/gitnexus-shared/node_modules \
    /home/node/.npm \
    /home/node/.local \
    /home/node/.claude \
    /home/node/.codex \
    /home/node/.cursor \
    /commandhistory

echo "[post-create] 2/7: stage AI CLI config (read-only host share + per-container credentials)"
# Host's ~/.claude / ~/.codex / ~/.cursor are bind-mounted READ-ONLY at
# /host/.<cli>. The container's actual config dirs are per-devcontainer
# named volumes at /home/node/.<cli>. We selectively SYMLINK shareable
# subdirs (plugins, skills, agents, memory, commands) from /host into the
# named volume so installing a plugin on the host lets the container see
# it on next rebuild. Read-only mount means container code can't write
# back — a compromised npm dep can't drop a malicious agent / skill /
# plugin into the host config that the next host Claude session would
# autoload. We deliberately do NOT symlink `ide/` (lock-file PID
# collisions across host/container Claude Code instances), `projects/`
# (host and container encode the workspace path differently — host
# `D--development-coding-GitNexus` vs container `-workspace` — and
# bidirectional writes split memory across two ghost project dirs), or
# `settings.json` (container CLI is version-pinned while host floats;
# bidirectional writes cause silent schema drift). Those stay container-
# local in the named volume.
#
# CREDENTIALS (.credentials.json / auth.json / cli-config.json) and
# `.claude.json` (the onboarding-state file at $HOME) are COPIED on
# first run, not symlinked. The container then manages its own refresh
# in the named volume; the host's copies are untouched. Refresh-token
# divergence is real (Anthropic rotates on every use), so an unattended
# container session can hit a silent 401 if the host has refreshed since
# the copy — re-run `claude login` inside the container to refresh.

link_readonly_share() {
    local src_root=$1
    local dst_root=$2
    shift 2
    for name in "$@"; do
        # If dst exists as a non-symlink (stale from a prior run), remove
        # it first so the symlink can land. Skips if dst is already the
        # right symlink.
        if [ -e "$src_root/$name" ]; then
            if [ -L "$dst_root/$name" ]; then
                continue  # already a symlink — leave alone
            fi
            rm -rf "$dst_root/$name"
            ln -s "$src_root/$name" "$dst_root/$name"
        fi
    done
}

sync_from_host() {
    # ALWAYS overwrite from host on container-create, so a fresh container
    # starts in the same auth/trust state as the host. Guarding on
    # "[ ! -e $dst ]" was a bug: stale named volumes left over from earlier
    # builds (or from a previous container instance that wrote interim
    # state) made the guard return false and skip the copy, leaving the
    # container desynced from the host. Container can still mutate the
    # files after this point — divergence is reset only on container
    # rebuild (which is when `post-create.sh` runs).
    local src=$1
    local dst=$2
    local mode=${3:-600}
    if [ -f "$src" ]; then
        rm -f "$dst"
        cp "$src" "$dst"
        chmod "$mode" "$dst"
    fi
}

# Claude Code — share plugins, skills, agents, memory, commands (the
# user-installed surface). Skip ide/projects/settings.json per above.
link_readonly_share /host/.claude /home/node/.claude \
    plugins skills agents memory commands

# `~/.claude.json` at $HOME is one state file. There's a SECOND `.claude.json`
# inside CLAUDE_CONFIG_DIR (`/home/node/.claude/.claude.json`) carrying
# migration tracking, userID, and per-project trust state. If the userIDs
# between the two don't match (e.g., the in-config one is left over from
# a prior test session), Claude Code re-onboards. Sync BOTH from host.
sync_from_host /host/.claude.json /home/node/.claude.json 644
sync_from_host /host/.claude/.claude.json /home/node/.claude/.claude.json 644

# If neither host file existed, write a minimal stub at $HOME so the
# wizard is still bypassed for first-time hosts.
if [ ! -f /home/node/.claude.json ]; then
    echo '{"hasCompletedOnboarding":true,"installMethod":"global"}' \
        > /home/node/.claude.json
    chmod 644 /home/node/.claude.json
fi

# Credentials. Container managed its own refresh until next rebuild.
sync_from_host \
    /host/.claude/.credentials.json /home/node/.claude/.credentials.json

# Codex — share config.toml; copy auth.json on container create. Hosts
# using OS keyring storage (`cli_auth_credentials_store = "keyring"`,
# default on macOS) have no auth.json on disk — the copy silently
# no-ops and `codex login --device-auth` inside the container is the
# path.
link_readonly_share /host/.codex /home/node/.codex config.toml
sync_from_host \
    /host/.codex/auth.json /home/node/.codex/auth.json

# Cursor CLI — cli-config.json conflates auth + settings, no shareable
# subdirs. Copy on container create. Cursor has known upstream issues
# authenticating inside Docker even with correctly-copied config; if
# `cursor-agent` reports auth errors after copy, re-run
# `cursor-agent login` inside the container.
sync_from_host \
    /host/.cursor/cli-config.json /home/node/.cursor/cli-config.json

echo "[post-create] 3/7: clear stale .husky/_ runtime cache"
# Docker Desktop's Windows bind-mount permission translation refuses to let
# the new container's `node` user overwrite a `.husky/_/h` left by a prior
# container with a different effective UID. `.husky/_` is gitignored runtime
# cache; husky regenerates it during npm install.
rm -rf .husky/_

echo "[post-create] 4/7: npm install at root (husky + lint-staged + prettier + eslint)"
npm install

echo "[post-create] 5/7: npm install + build gitnexus-shared"
# gitnexus and gitnexus-web both consume gitnexus-shared via
# file:../gitnexus-shared, so it must be built before either installs.
cd /workspace/gitnexus-shared
npm install
npm run build

echo "[post-create] 6/7: npm install gitnexus-web"
# Must install BEFORE gitnexus: gitnexus's `prepare` script runs
# scripts/build.js, which compiles gitnexus-web when the directory is
# present. In the devcontainer the full workspace is bind-mounted, so
# gitnexus-web/ is present at gitnexus install time even though it
# wouldn't be in the production Dockerfiles (which COPY selectively).
cd /workspace/gitnexus-web
npm install

echo "[post-create] 7/7: npm install gitnexus (triggers prepare -> scripts/build.js)"
cd /workspace/gitnexus
npm install

echo "[post-create] done"
