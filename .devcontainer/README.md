# GitNexus Devcontainer

A cross-platform Dev Container that pre-installs Claude Code, OpenAI Codex CLI, and Cursor CLI alongside the GitNexus native build chain. Supported hosts: **macOS, Linux, and Windows 11 via WSL2** (Windows-native is unsupported — see below).

## Quick start

1. Install [Docker Desktop](https://docs.docker.com/desktop/) (Windows/macOS) or Docker Engine (Linux).
2. Install [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
3. Open the repo in VS Code → Command Palette → **Dev Containers: Reopen in Container**.
4. Wait for the first build (~3–6 minutes) and `postCreateCommand` to finish installing workspace dependencies.
5. Authenticate the three CLIs once — see [First-time CLI authentication](#first-time-cli-authentication) below.

## Windows 11 — WSL2 is required

**Windows-native is unsupported.** The devcontainer bind-mounts host config dirs via `${localEnv:HOME}/.claude` (and `.codex`, `.cursor`, `.gitconfig`, `.config/gh`). On Windows-native, the host has `USERPROFILE` set but no `HOME` — VS Code resolves the missing `HOME` to an empty string and Docker tries to bind-mount paths from filesystem root, which silently breaks the host-sync feature. The same checkout-from-Windows-side path also has poor IO and unreliable file watchers (Vite/jest `--watch` will miss changes). The fix is to clone and open the repo inside WSL2:

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
#    filesystem, so `${localEnv:HOME}` resolves to the WSL user's home and
#    subsequent "Reopen in Container" uses the WSL2-side path.
code .
```

Then run **Dev Containers: Reopen in Container**. The workspace will be bind-mounted from `\\wsl$\Ubuntu\home\<user>\GitNexus`, which is fast and gives reliable file-system events. **Make sure Docker Desktop's WSL integration is enabled** for your distro: Docker Desktop → Settings → Resources → WSL Integration → toggle on the distro you cloned into.

## macOS

Open the repo folder in VS Code → **Reopen in Container**. The image is multi-arch; on Apple Silicon you'll pull the `linux/arm64` variant automatically.

## Linux

Same as macOS — open in VS Code and reopen in container. `updateRemoteUserUID: true` (default) shifts the container's `node` user UID/GID to match your host user, so bind-mounted files stay writable without extra setup.

## How CLI state is shared with your host

The following directories inside the container are **bind-mounted directly from your host's `$HOME`**:

| Container path | Host source | Mode |
|---|---|---|
| `~/.claude` | `$HOME/.claude` | read-write |
| `~/.codex` | `$HOME/.codex` | read-write |
| `~/.cursor` | `$HOME/.cursor` | read-write |
| `~/.gitconfig` | `$HOME/.gitconfig` | **read-only** |
| `~/.config/gh` | `$HOME/.config/gh` | read-write |

That means:

- **Authentication is shared.** If you're already logged in on the host (`claude login`, `codex login`, `cursor-agent login`, `gh auth login`), you're already logged in inside the container. No second login step.
- **Plugins, skills, agents, memory, and settings sync both ways.** Install a plugin from inside the container and it shows up on the host; add a custom agent on the host and the container sees it immediately. The auto-memory store at `~/.claude/projects/<workspace>/memory/` is the same file tree from both sides.
- **Git identity comes from the host.** Commits from inside the container use your host's `user.name` / `user.email`. The mount is read-only so container-side `git config --global` doesn't leak to your host config — set those values from the host shell.
- **`gh` auth is shared.** `gh pr create`, `gh pr checks`, `gh issue create` work inside the container without re-authenticating.
- **No per-workspace duplication.** All your devcontainers across all your projects see the same host CLI state, just like all your host shells do.

The bind mount source directories are guaranteed to exist by the `initializeCommand` (`mkdir -p $HOME/.claude $HOME/.codex $HOME/.cursor $HOME/.config/gh`), which runs on the host shell before container create.

### Trust boundary, concretely

Host and container share a single trust boundary by design — fine for personal-dev, but the consequence is concrete: any malicious npm package or `postinstall` script in the workspace dep tree, running inside the container with these bind mounts active, has direct read access to your OAuth refresh tokens for all three CLIs, your `gh` token, and `~/.claude/projects/<workspace>/memory/MEMORY.md` (which may contain user-stored secrets if you've used the `/remember` skill). The egress firewall is deferred (see "What's not included (yet)" below) so a compromised package would also have unrestricted network to exfiltrate.

**If a workspace dep is ever found compromised**, rotate credentials at the vendor side — local file deletion is insufficient because tokens may have already left:

- Anthropic: [console.anthropic.com → Settings → Keys](https://console.anthropic.com/settings/keys), revoke the OAuth session under Account
- OpenAI / Codex: [platform.openai.com/api-keys](https://platform.openai.com/api-keys), revoke session under Profile
- Cursor: dashboard → Integrations, rotate API key + revoke CLI session
- GitHub: `gh auth refresh` or revoke the token at github.com/settings/tokens

For high-trust enterprise environments where host and container should NOT share credentials, swap the three CLI bind mounts (`~/.claude`, `~/.codex`, `~/.cursor`) in `.devcontainer/devcontainer.json` for `type=volume` named volumes (Anthropic's reference pattern). You give up host plugin/skill/memory sync in exchange for credential isolation per devcontainer.

## First-time CLI authentication

If you already use these CLIs on the host, **skip this section** — your existing logins are already in scope inside the container.

If a CLI is brand-new on this host, log in from inside _or_ outside the container; either populates the shared `~/.<cli>` directory.

### Claude Code

```bash
claude login
```

Opens a browser auth flow. VS Code's port forwarding handles the OAuth callback automatically. After auth, `~/.claude/` is populated and visible from both host and container. The `DISABLE_AUTOUPDATER=1` env var prevents the in-container CLI from auto-updating — rebuild the container to pick up a newer Claude Code.

### OpenAI Codex CLI

```bash
codex login --device-auth
```

The device-code flow prints a URL and a one-time code. Visit the URL on your host browser, paste the code, and the CLI authenticates without needing a callback listener — this is the most reliable path inside containers. Credentials land in `~/.codex/auth.json` (shared with host).

`codex login` (browser-callback variant) also works but can be flaky in some headless contexts; prefer `--device-auth`.

### Cursor CLI

```bash
cursor-agent login
```

Opens a browser auth flow; VS Code's port forwarding handles the callback. Credentials persist in `~/.cursor/cli-config.json` (shared with host).

Verify any time with `cursor-agent status`.

## Alternative: API key authentication (CI / headless)

For non-interactive use (CI runners, automated scripts), all three CLIs accept API keys via env vars:

| CLI | Env var | Where to get the key |
|---|---|---|
| Claude Code | `ANTHROPIC_API_KEY` | <https://console.anthropic.com/settings/keys> |
| Codex | `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> |
| Cursor | `CURSOR_API_KEY` | Cursor dashboard → Integrations |

These env vars are intentionally **not** injected into the container from the host. `${localEnv:VAR}` resolves an unset host variable to an empty string, and some CLIs (Cursor in particular) treat a set-but-empty key as "use this key" rather than "fall back to stored login" — which would silently break the login flow for everyone who hasn't pre-set the host var.

To use an API key inside the container, export it in your terminal session:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or OPENAI_API_KEY, or CURSOR_API_KEY
```

For persistence across container shells, carry the export via your VS Code [dotfiles repository](https://code.visualstudio.com/docs/devcontainers/containers#_personalizing-with-dotfile-repositories). VS Code clones the dotfiles repo into the container on attach and runs your install command, so the export lands in `~/.bashrc` / `~/.zshrc` per your own setup — and your API keys stay out of this repo's committed `devcontainer.json`.

A non-empty API key env var takes precedence over stored login credentials for each CLI.

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

Bump `CLAUDE_CODE_VERSION` and `CODEX_VERSION` in `.devcontainer/devcontainer.json` `build.args` and rebuild — both are real pins (Claude Code via `npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`, Codex via `npm install -g @openai/codex@${CODEX_VERSION}`). `CURSOR_VERSION` is informational only because Cursor's official installer (`cursor.com/install`) doesn't expose version pinning; rebuild to pick up whatever the installer serves. To stop Cursor from auto-updating in the running container, don't call `cursor-agent update`.

## What's not included (yet)

- **Egress firewall.** The original plan included an opt-in iptables/ipset firewall adapted from Anthropic's reference devcontainer. It was deferred to a follow-up PR — `runArgs` is static in `devcontainer.json`, so toggling NET_ADMIN/NET_RAW capabilities cleanly requires either a separate `devcontainer-firewall.json` profile or an `initializeCommand`-generated overlay. Track at the project's issue tracker if you need this.
- **Hard-pinned Cursor CLI.** Today the Dockerfile downloads `cursor.com/install` to a temp file, logs the sha256 to the build output (so drift across rebuilds is visible in CI logs), then executes — trust assumption: cursor.com's TLS chain is reliable. The full pin (download a specific `downloads.cursor.com/lab/<version>/<arch>/agent-cli-package.tar.gz` with a verified sha256, skip the install script entirely) is tracked as a follow-up because it requires per-arch handling and a SHA bump per Cursor release.
- **Codespaces tuning.** The current config works in Codespaces incidentally (no privileged capabilities, no host-mount assumptions), but isn't actively tested there.
- **Playwright e2e support.** `gitnexus-web`'s `npm run test:e2e` needs Chromium libs that the base image doesn't ship. Use the host for e2e until a Playwright layer is added.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `EACCES` / `EPERM` writing into `~/.claude`, `~/.codex`, or `~/.cursor` inside the container | Windows-side bind-mount permission translation got out of sync after a UID change between rebuilds | Move to WSL2 — Windows-native isn't supported. See [Windows 11 — WSL2 is required](#windows-11--wsl2-is-required) |
| `EPERM: operation not permitted, copyfile ... '.husky/_/h'` in `postCreateCommand` | Leftover `.husky/_/` from a previous container run on a Windows-side bind mount | `post-create.sh` already runs `rm -rf .husky/_` defensively. If you hit this on an older config, delete `.husky/_/` on the host and rebuild. Long-term: clone in WSL2 |
| Vite never hot-reloads | Repo cloned on Windows side, not WSL2 | Re-clone inside WSL2 |
| `gitnexus-web` can't reach the backend | `4747` was remapped or backend isn't running | Verify the Ports panel shows `4747` forwarded with no remap; start the backend with `cd gitnexus && npx gitnexus serve` |
| `npm install` fails on tree-sitter-swift / proto / dart | Native build toolchain missing | This shouldn't happen in the devcontainer — verify the apt layer installed `python3 make g++`. If iterating, set `GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1` to skip the vendored grammars |
| Integration tests fail with `database busy` | LadybugDB single-writer constraint | Don't run host-side `gitnexus analyze` while the container is also analyzing the same repo; choose one writer |
| API key env vars not visible inside the container | They are intentionally not auto-propagated from the host (so an empty/stale host var can't silently break `*-login` for everyone else) | `export ANTHROPIC_API_KEY=...` / `OPENAI_API_KEY=...` / `CURSOR_API_KEY=...` inside the container shell, or carry it via your VS Code [dotfiles repo](https://code.visualstudio.com/docs/devcontainers/containers#_personalizing-with-dotfile-repositories) for persistence |
| `git commit` produces commits with empty author | `~/.gitconfig` source path missing on the host | Set `git config --global user.name` / `user.email` from the host shell, then rebuild. The bind mount is read-only so the values come from the host |
| `gh: not logged in` inside the container | `~/.config/gh/` source path missing on the host | Run `gh auth login` from the host shell (or inside the container once); the auth file lands in the shared mount |
