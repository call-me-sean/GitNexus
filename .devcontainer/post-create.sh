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

echo "[post-create] 2/7: sync AI CLI credentials + identity from host"
# Plugins, skills, agents, memory, commands, settings.json, $HOME/.claude.json,
# Codex config.toml/memories/skills are all RW bind-mounted directly from
# host in devcontainer.json — they live on host and reads/writes go
# bidirectionally. Nothing for this script to do for those.
#
# What stays per-container (in the named volume) and gets SYNCED from
# host on container-create:
#   - .credentials.json (Claude OAuth tokens)
#   - .claude/.claude.json (Claude identity: userID, oauthAccount,
#     migration tracking — different file from $HOME/.claude.json)
#   - auth.json (Codex)
#   - cli-config.json (Cursor — conflates auth + settings)
#
# Sync semantics: ALWAYS overwrite from host on container-create, so a
# fresh container starts logged in as host's user (if host had creds).
# Container manages its own refresh from there until next rebuild.
# Logging out in container doesn't affect host. Per-container login is
# the design goal; bind-mounting these would make logout shared.

sync_from_host() {
    local src=$1
    local dst=$2
    local mode=${3:-600}
    if [ -f "$src" ]; then
        rm -f "$dst"
        cp "$src" "$dst"
        chmod "$mode" "$dst"
    fi
}

sync_from_host \
    /host/.claude/.credentials.json /home/node/.claude/.credentials.json
sync_from_host \
    /host/.claude/.claude.json /home/node/.claude/.claude.json 644

# Plugin registry path translation. Claude writes absolute OS-native paths
# into known_marketplaces.json (`installLocation`), installed_plugins.json
# (`installPath`), and plugin-catalog-cache.json — `C:\Users\X\.claude\...`
# on Windows hosts, `/Users/X/.claude/...` on macOS — so the host versions
# can't be bind-mounted into the Linux container (Claude would fail with
# `cache-miss` trying to resolve a Windows path inside Linux). Read host's
# registry files, rewrite every absolute path that ends in
# `/.claude/plugins/<rest>` to `/home/node/.claude/plugins/<rest>`, and
# write the result into the container's named volume.
mkdir -p /home/node/.claude/plugins
node <<'NODE'
const fs = require("fs");
const path = require("path");

const HOST = "/host/.claude/plugins";
const CTR = "/home/node/.claude/plugins";

// Match any absolute path (Windows `C:\Users\…\.claude\plugins\<rest>`
// or POSIX `/Users/…/.claude/plugins/<rest>` or
// `/home/…/.claude/plugins/<rest>`) and translate to the container path.
const rewrite = (s) => {
    if (typeof s !== "string") return s;
    return s.replace(
        /^(?:[A-Za-z]:)?[\\/].*?[\\/]\.claude[\\/]plugins[\\/](.*)$/,
        (_, rest) => `${CTR}/${rest.replace(/\\/g, "/")}`,
    );
};

const rewriteDeep = (obj) => {
    if (Array.isArray(obj)) return obj.map(rewriteDeep);
    if (obj && typeof obj === "object") {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = typeof v === "string" ? rewrite(v) : rewriteDeep(v);
        }
        return out;
    }
    return obj;
};

for (const name of [
    "known_marketplaces.json",
    "installed_plugins.json",
    "plugin-catalog-cache.json",
]) {
    const src = path.join(HOST, name);
    const dst = path.join(CTR, name);
    if (!fs.existsSync(src) || fs.statSync(src).size === 0) continue;
    let data;
    try {
        data = JSON.parse(fs.readFileSync(src, "utf8"));
    } catch {
        continue;
    }
    fs.writeFileSync(dst, JSON.stringify(rewriteDeep(data), null, 2));
}
NODE

# Codex auth. Hosts using OS keyring storage
# (`cli_auth_credentials_store = "keyring"`, default on macOS) have no
# auth.json on disk — the copy silently no-ops and
# `codex login --device-auth` inside the container is the path.
sync_from_host \
    /host/.codex/auth.json /home/node/.codex/auth.json

# Cursor CLI — cli-config.json conflates auth + settings. Cursor has known
# upstream issues authenticating inside Docker even with correctly-copied
# config; if `cursor-agent` reports auth errors after copy, re-run
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
