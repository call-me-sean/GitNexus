// Runs on the HOST (not inside the container) before the dev container is
// created, via devcontainer.json `initializeCommand`. Guarantees the bind
// mount sources declared in devcontainer.json exist on the host so Docker
// doesn't reject the mount when a CLI has never been used.
//
// Cross-platform via Node's `os.homedir()` (which reads $HOME on POSIX and
// %USERPROFILE% on Windows) and `fs.mkdirSync({recursive: true})`. Idempotent
// — `recursive: true` is a no-op when a directory already exists, and the
// `.gitconfig` touch is gated on file existence.
//
// Host prerequisite: Node.js on PATH. This is the only documented host
// requirement beyond Docker Desktop and the VS Code Dev Containers
// extension — everything else runs inside the container.

const fs = require("fs");
const os = require("os");
const path = require("path");

const home = os.homedir();

for (const dir of [
  ".claude",
  ".codex",
  ".cursor",
  ".ssh",
  path.join(".config", "gh"),
  path.join(".config", "git"),
]) {
  fs.mkdirSync(path.join(home, dir), { recursive: true });
}

const gitconfig = path.join(home, ".gitconfig");
if (!fs.existsSync(gitconfig)) {
  fs.closeSync(fs.openSync(gitconfig, "a"));
}
