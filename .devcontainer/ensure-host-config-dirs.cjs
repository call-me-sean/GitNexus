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

// Fail-fast on Windows-native (no $HOME set). VS Code resolves the bind
// mount sources via `${localEnv:HOME}` reading the host shell env, and
// cmd.exe on Windows has no HOME variable — so bind sources collapse to
// `/.claude`, `/.codex`, etc., and Docker rejects them with
// `bind source path does not exist`. Surface the actual root cause here
// instead of letting Docker error opaquely later.
if (process.platform === "win32" && !process.env.HOME) {
  console.error("ERROR: GitNexus devcontainer requires WSL2 on Windows 11.");
  console.error("");
  console.error(
    "You opened this from a Windows-native path. The host bind mounts use",
  );
  console.error(
    "`${localEnv:HOME}/.claude` etc., which VS Code resolves from the host shell",
  );
  console.error(
    "env. cmd.exe on Windows has no HOME variable, so the bind sources resolve",
  );
  console.error(
    "to filesystem-root paths (/.claude, /.codex, ...) and Docker rejects them.",
  );
  console.error("");
  console.error("Clone the repo inside WSL2 and re-open from there:");
  console.error("  wsl");
  console.error(
    "  cd ~ && git clone https://github.com/abhigyanpatwari/GitNexus.git",
  );
  console.error("  cd GitNexus && code .");
  console.error("");
  console.error(
    "See .devcontainer/README.md - Windows 11 - WSL2 is required.",
  );
  process.exit(1);
}

const home = os.homedir();

for (const dir of [
  ".claude",
  ".codex",
  ".cursor",
  ".ssh",
  path.join(".config", "gh"),
  path.join(".config", "git"),
]) {
  if (fs.existsSync(path.join(home, dir))) {
    continue;
  }
  fs.mkdirSync(path.join(home, dir), { recursive: true });
}

const gitconfig = path.join(home, ".gitconfig");
if (!fs.existsSync(gitconfig)) {
  fs.closeSync(fs.openSync(gitconfig, "a"));
}
