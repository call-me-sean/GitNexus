# GitNexus Devcontainer

A cross-platform Dev Container that pre-installs Claude Code, OpenAI Codex CLI, and Cursor CLI alongside the GitNexus native build chain. Designed for Windows 11 (Docker Desktop + WSL2 backend) as the primary host with first-class support for macOS and Linux.

## Quick start

1. Install [Docker Desktop](https://docs.docker.com/desktop/) (Windows/macOS) or Docker Engine (Linux).
2. Install [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
3. Open the repo in VS Code → Command Palette → **Dev Containers: Reopen in Container**.
4. Wait for the first build (~3–6 minutes) and `postCreateCommand` to finish installing workspace dependencies.
5. Authenticate the three CLIs once — see [First-time CLI authentication](#first-time-cli-authentication) below.

## Windows 11 (primary host) — WSL2 setup

**Clone the repo inside WSL2, not on the Windows side.** Bind-mounting a Windows-side path (`C:\…`) through Docker Desktop's WSL2 backend works but suffers from poor IO and unreliable file watchers (Vite/jest `--watch` will miss changes). The fix is to clone into the WSL2 filesystem.

```bash
# 1. Install WSL2 and a Linux distro if you haven't already.
wsl --install -d Ubuntu

# 2. Enter WSL.
wsl

# 3. Clone the repo inside your WSL2 home directory.
cd ~
git clone https://github.com/abhigyanpatwari/GitNexus.git
cd GitNexus

# 4. Launch VS Code from inside WSL — this opens VS Code attached to the WSL2
#    filesystem, so subsequent "Reopen in Container" uses the WSL2-side path.
code .
```

Then run **Dev Containers: Reopen in Container**. The workspace will be bind-mounted from `\\wsl$\Ubuntu\home\<user>\GitNexus`, which is fast and gives reliable file-system events.

**Make sure Docker Desktop's WSL integration is enabled** for your distro: Docker Desktop → Settings → Resources → WSL Integration → toggle on the distro you cloned into.

## macOS

Open the repo folder in VS Code → **Reopen in Container**. The image is multi-arch; on Apple Silicon you'll pull the `linux/arm64` variant automatically.

## Linux

Same as macOS — open in VS Code and reopen in container. `updateRemoteUserUID: true` (default) shifts the container's `node` user UID/GID to match your host user, so bind-mounted files stay writable without extra setup.

## First-time CLI authentication

Each CLI persists its config in a per-devcontainer named volume scoped by `${devcontainerId}`, so authentication survives container rebuilds. You only need to log in once per workspace.

### Claude Code

```bash
claude login
```

This opens a browser auth flow; VS Code's port forwarding handles the callback. After auth, `~/.claude/` is populated in the named volume and persists across rebuilds. The `DISABLE_AUTOUPDATER=1` env var prevents the running CLI from updating itself — rebuild the container to pick up a newer Claude Code.

### OpenAI Codex CLI

The browser-callback flow can be flaky inside containers; the device-code flow is more reliable:

```bash
codex login --device-auth
```

Visit the URL it prints on your host browser and paste the displayed code. After auth, `~/.codex/auth.json` persists in the named volume.

For CI/headless use: set `OPENAI_API_KEY` in your host shell before opening the devcontainer — VS Code's `${localEnv:OPENAI_API_KEY}` would resolve it, but it's currently not wired into `containerEnv`. If you need this, add it to `.devcontainer/devcontainer.json` and rebuild.

### Cursor CLI

Preferred path is the `CURSOR_API_KEY` environment variable:

1. Generate an API key from the Cursor dashboard → Integrations.
2. Set it on the host shell that launches VS Code: `export CURSOR_API_KEY=...` (or set in your shell rc / Windows env vars).
3. **Rebuild the container** — `containerEnv` resolves `${localEnv:CURSOR_API_KEY}` at container-create time, so a new key only lands after a rebuild.

Verify with `cursor-agent status` inside the container.

If you'd rather log in interactively:

```bash
cursor-agent login
```

This opens a browser flow and stores credentials under `~/.cursor/` in the named volume.

## Port forwarding

| Port | Service | Notes |
|------|---------|-------|
| `5173` | Vite dev server (`gitnexus-web`) | Auto-forwarded with notification |
| `4747` | `gitnexus serve` HTTP API | **Must not be remapped** — `gitnexus-web` hardcodes `http://localhost:4747` as the default backend URL |
| `4173` | Static web (Vite preview) | Silently forwarded |

VS Code's Ports panel shows forwarded ports once their listener starts.

## Known gotchas

- **LadybugDB integration tests may fail in containers** (file-locking, `AGENTS.md` § Testing). Default to `npm run test:unit` inside the container; run integration tests on the host. Tracking issue: documented as a known limitation.
- **Single-writer LadybugDB constraint** (`GUARDRAILS.md` § LadybugDB lock). Don't run `gitnexus analyze` on the host and inside the container against the same `.gitnexus/` directory simultaneously — the second writer will get `database busy`.
- **Native grammar builds add ~30s to first install.** Tree-sitter Dart/Proto/Swift grammars build during `gitnexus`'s `postinstall`. To skip them (loses parsing for those three languages), set `GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1` in your shell or add it to `remoteEnv` and rebuild.
- **`tree-sitter-kotlin` warnings on install** are expected (per `AGENTS.md`). Ignore them.
- **`.mcp.json` works inside the container**: `npx -y gitnexus@latest mcp` resolves cleanly because npm registry is reachable and the workspace bind mount exposes the same `.mcp.json` the host sees.
- **Husky pre-commit fires inside the container** without extra setup. The root `npm install` (run automatically in `postCreateCommand`) installs the hook via `package.json` `prepare`.

## Rebuild / reset

- **Rebuild Container** (Command Palette) — re-runs the Dockerfile build and `postCreateCommand` against the existing named volumes (auth + history persist).
- **Rebuild Container Without Cache** — fresh image layers, same volumes.
- **To clear a stale named volume** (e.g., force a re-login):
  ```bash
  docker volume ls | grep gitnexus   # find the per-devcontainer volume
  docker volume rm <volume-name>
  ```
  Then rebuild.

## Bumping CLI versions

Three build args control pinned versions:

- `CLAUDE_CODE_VERSION` — informational. Anthropic's official Feature (`ghcr.io/anthropics/devcontainer-features/claude-code:1`) installs the latest stable at build time; rebuild to pick up a newer Claude Code. `DISABLE_AUTOUPDATER=1` keeps it locked between rebuilds.
- `CODEX_VERSION` — pinned in `.devcontainer/devcontainer.json` `build.args` and consumed by `npm install -g @openai/codex@${CODEX_VERSION}`. Bump the value and rebuild.
- `CURSOR_VERSION` — informational only. The Cursor installer (`cursor.com/install`) does not expose version pinning; it always pulls latest at build time. To bump, rebuild the container; auto-update inside the running container is suppressed by not invoking `cursor-agent update`.

## What's not included (yet)

- **Egress firewall.** The original plan included an opt-in iptables/ipset firewall adapted from Anthropic's reference devcontainer. It was deferred to a follow-up PR — `runArgs` is static in `devcontainer.json`, so toggling NET_ADMIN/NET_RAW capabilities cleanly requires either a separate `devcontainer-firewall.json` profile or an `initializeCommand`-generated overlay. Track at the project's issue tracker if you need this.
- **Codespaces tuning.** The current config works in Codespaces incidentally (no privileged capabilities, no host-mount assumptions), but isn't actively tested there.
- **Playwright e2e support.** `gitnexus-web`'s `npm run test:e2e` needs Chromium libs that the base image doesn't ship. Use the host for e2e until a Playwright layer is added.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `EACCES` on first `claude login` / `codex login` / `cursor-agent login` | Named volume mount got a stale state | `docker volume rm` the relevant `*-config-<devcontainerId>` volume and rebuild |
| Vite never hot-reloads on Windows | Repo cloned on Windows side, not WSL2 | Re-clone inside WSL2 (see [WSL2 setup](#windows-11-primary-host--wsl2-setup)) |
| `gitnexus-web` can't reach the backend | `4747` was remapped or backend isn't running | Verify the Ports panel shows `4747` forwarded with no remap; start the backend with `cd gitnexus && npx gitnexus serve` |
| `npm install` fails on tree-sitter-swift / proto / dart | Native build toolchain missing | This shouldn't happen in the devcontainer — verify the apt layer installed `python3 make g++`. If iterating, set `GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1` to skip the vendored grammars |
| Integration tests fail with `database busy` | LadybugDB single-writer constraint | Don't run host-side `gitnexus analyze` while the container is also analyzing the same repo; choose one writer |
| `CURSOR_API_KEY` set on host but not visible in container | Host env not propagated, or container started before key was set | Rebuild the container after setting the host env var |
