// Runs on the HOST (not inside the container) before the dev container is
// created, as the devcontainer.json `initializeCommand`. Ensures the host
// has empty config directories for Claude Code, Codex CLI, and Cursor CLI
// at the user's home directory so the bind mounts in devcontainer.json
// always have a real source path (Docker fails the bind mount if the
// source doesn't exist).
//
// Cross-platform via Node's `os.homedir()` and `fs.mkdirSync({recursive:
// true})`. Node is already required on the host because the project's
// Claude Code, the @devcontainers/cli reentry, and most repo scripts
// depend on it.
//
// Safe to re-run: `recursive: true` is a no-op when the directory exists.
//
// No third-party dependencies; CommonJS so it runs on any Node ≥ 12
// without ESM gymnastics.

const fs = require("fs");
const os = require("os");
const path = require("path");

for (const dir of [".claude", ".codex", ".cursor"]) {
  const target = path.join(os.homedir(), dir);
  fs.mkdirSync(target, { recursive: true });
}
