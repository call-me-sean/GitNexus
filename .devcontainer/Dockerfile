# syntax=docker/dockerfile:1

# Base image: Microsoft's TypeScript+Node devcontainer image. Multi-arch
# (linux/amd64, linux/arm64), monthly security patching, ships the non-root
# `node` user (UID 1000), zsh + Oh My Zsh, eslint global, `gh` CLI.
FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Build args drive both the image build and lifecycle-time references. The
# matching ENV declarations below promote each ARG into the container's
# runtime environment so postCreateCommand and shells can resolve them
# (Docker ARG values are build-only by default).
ARG CLAUDE_CODE_VERSION=2.1.153
ARG CODEX_VERSION=0.134.0
ARG CURSOR_VERSION=latest
ARG TZ=UTC
ARG USERNAME=node

ENV CLAUDE_CODE_VERSION=${CLAUDE_CODE_VERSION} \
    CODEX_VERSION=${CODEX_VERSION} \
    CURSOR_VERSION=${CURSOR_VERSION} \
    TZ=${TZ} \
    DEVCONTAINER=true \
    NODE_OPTIONS=--max-old-space-size=4096 \
    CLAUDE_CONFIG_DIR=/home/${USERNAME}/.claude \
    POWERLEVEL9K_DISABLE_GITSTATUS=true

# Native build toolchain required by gitnexus/postinstall: tree-sitter
# native bindings, vendored Dart/Proto/Swift grammars, @ladybugdb/core
# N-API addon. python3/make/g++ are non-negotiable; mirrors the apt block
# in the existing Dockerfile.cli / gitnexus/Dockerfile.test images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 make g++ git curl ca-certificates bash \
    && rm -rf /var/lib/apt/lists/*

# Pre-create credential and history mount points owned by `node` BEFORE the
# devcontainer.json named volumes attach. Docker copies image-side ownership
# onto an empty named volume on first mount, so first-run `claude login`,
# `codex login --device-auth`, and `cursor-agent login` write into a
# node-owned directory instead of EACCES'ing on a root-owned volume.
RUN mkdir -p \
        /home/${USERNAME}/.claude \
        /home/${USERNAME}/.codex \
        /home/${USERNAME}/.cursor \
        /home/${USERNAME}/.npm \
        /home/${USERNAME}/.local/bin \
        /commandhistory \
    && chown -R ${USERNAME}:${USERNAME} \
        /home/${USERNAME}/.claude \
        /home/${USERNAME}/.codex \
        /home/${USERNAME}/.cursor \
        /home/${USERNAME}/.npm \
        /home/${USERNAME}/.local \
        /commandhistory

USER ${USERNAME}

# Install Codex CLI globally as the `node` user. The base image configures
# /usr/local/share/npm-global as the npm-global prefix with the `npm` group
# writable by `node`, so this works without sudo.
RUN npm install -g @openai/codex@${CODEX_VERSION}

# Cursor CLI install. The official installer (cursor.com/install) does not
# expose a clean version-pinning flag; CURSOR_VERSION is carried for
# traceability only and the installer always pulls the latest at build time.
# To bump Cursor: rebuild the image. Auto-update in the running container is
# suppressed by not invoking `cursor-agent update`.
RUN curl -fsS https://cursor.com/install | bash

# Ensure ~/.local/bin (where Cursor's installer drops `agent` and
# `cursor-agent` symlinks) is on PATH for interactive shells and lifecycle
# scripts.
ENV PATH=/home/${USERNAME}/.local/bin:${PATH}
