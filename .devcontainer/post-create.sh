#!/usr/bin/env bash
# Devcontainer postCreate driver. Runs once after the container is created
# (per devcontainer.json `postCreateCommand`). Each labeled step is its own
# command, so a failure log line names the step that failed instead of an
# opaque `&&`-chain index.

set -euo pipefail

cd /workspace

echo "[post-create] 1/6: chown workspace node_modules + named-volume mount points"
# `updateRemoteUserUID: true` realigns the `node` user's UID/GID at runtime
# on Linux hosts (no-op on Mac/Windows where Docker Desktop translates UIDs
# via its VM layer). The Dockerfile chown at build time targets the original
# UID; empty named volumes created at first mount inherit that ownership and
# end up owned by the stale UID after realignment. Re-chown here, post-
# realignment, so npm install can write to ~/.npm and zsh history writes to
# /commandhistory succeed on hosts with non-1000 UIDs.
sudo chown -R node:node \
    /workspace/node_modules \
    /workspace/gitnexus/node_modules \
    /workspace/gitnexus-web/node_modules \
    /workspace/gitnexus-shared/node_modules \
    /home/node/.npm \
    /home/node/.local \
    /commandhistory

echo "[post-create] 2/6: clear stale .husky/_ runtime cache"
# Docker Desktop's Windows bind-mount permission translation refuses to let
# the new container's `node` user overwrite a `.husky/_/h` left by a prior
# container with a different effective UID. `.husky/_` is gitignored runtime
# cache; husky regenerates it during npm install.
rm -rf .husky/_

echo "[post-create] 3/6: npm install at root (husky + lint-staged + prettier + eslint)"
npm install

echo "[post-create] 4/6: npm install + build gitnexus-shared"
# gitnexus and gitnexus-web both consume gitnexus-shared via
# file:../gitnexus-shared, so it must be built before either installs.
cd /workspace/gitnexus-shared
npm install
npm run build

echo "[post-create] 5/6: npm install gitnexus-web"
# Must install BEFORE gitnexus: gitnexus's `prepare` script runs
# scripts/build.js, which compiles gitnexus-web when the directory is
# present. In the devcontainer the full workspace is bind-mounted, so
# gitnexus-web/ is present at gitnexus install time even though it
# wouldn't be in the production Dockerfiles (which COPY selectively).
cd /workspace/gitnexus-web
npm install

echo "[post-create] 6/6: npm install gitnexus (triggers prepare -> scripts/build.js)"
cd /workspace/gitnexus
npm install

echo "[post-create] done"
