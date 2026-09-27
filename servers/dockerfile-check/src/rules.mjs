// src/rules.mjs
//
// What is wrong in a Dockerfile, beyond syntax (dockerfile-utils validates that). Three kinds:
// - errors: the build fails or does something else than written (apt-get install waiting for a
//   yes, a copy from outside the context, exec form in single quotes, a stage that does not exist);
// - warnings: it builds, but runs as root, keeps a secret in the image, or depends on a moving tag;
// - notes: it builds and runs, but slower or larger than it needs to (cache order, package caches).
// Each finding is {line, severity, rule, message, fix}.
import { DockerfileParser } from "dockerfile-ast";

const SECRETISH = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?)$/i;
const INSTALL_WITHOUT_YES = [
  { re: /\bapt(?:-get)?\s+(?:[^;&|]*\s)?install\b/, yes: /(^|\s)(-y|--yes|--assume-yes|-qq|-q=2|-[a-z]*y[a-z]*)(\s|$)/, tool: "apt-get install", fix: "add -y (and --no-install-recommends)" },
  { re: /\b(?:yum|dnf|microdnf)\s+(?:[^;&|]*\s)?install\b/, yes: /(^|\s)(-y|--assumeyes|-[a-z]*y[a-z]*)(\s|$)/, tool: "yum/dnf install", fix: "add -y" },
  { re: /\bzypper\s+(?:[^;&|]*\s)?(?:install|in)\b/, yes: /(^|\s)(-n|--non-interactive|-y|--no-confirm)(\s|$)/, tool: "zypper install", fix: "add -n (zypper -n install ...)" },
];

const lineOf = (instr) => instr.getRange().start.line + 1;
const text = (instr) => instr.getArgumentsContent() ?? "";

// The shell commands of a RUN, split at && ; || so each is judged on its own.
const commands = (s) => s.split(/&&|\|\||;/).map((c) => c.trim()).filter(Boolean);

/** The stages of a Dockerfile: {from, name, line, instructions}. */
export function stagesOf(df) {
  const stages = [];
  let current;
  for (const instr of df.getInstructions()) {
    if (instr.getKeyword() === "FROM") {
      current = { from: instr, name: instr.getBuildStage()?.toLowerCase(), line: lineOf(instr), instructions: [] };
      stages.push(current);
    } else if (current) current.instructions.push(instr);
  }
  return stages;
}

/** ARG defaults declared before the first FROM, which FROM lines may use. */
export function initialArgs(df) {
  const out = {};
  for (const a of df.getInitialARGs()) {
    const prop = a.getProperty();
    if (prop?.getName()) out[prop.getName()] = prop.getValue() ?? undefined;
  }
  return out;
}

/** "${NODE_VERSION}-alpine" with its ARG default filled in; undefined when a variable has no default. */
export function substitute(s, args) {
  let unresolved = false;
  const out = String(s).replace(/\$\{?(\w+)(?::?-([^}]*))?\}?/g, (all, name, dflt) => {
    if (args[name] !== undefined) return args[name];
    if (dflt !== undefined) return dflt;
    unresolved = true;
    return all;
  });
  return unresolved ? undefined : out;
}

export function parseDockerfile(content) {
  return DockerfileParser.parse(content);
}

/** The findings for one Dockerfile. `images` are resolved later (src/check.mjs). */
export function lint(df) {
  const out = [];
  const add = (instr, severity, rule, message, fix) => out.push({ line: typeof instr === "number" ? instr : lineOf(instr), severity, rule, message, ...(fix ? { fix } : {}) });
  const stages = stagesOf(df);
  const names = new Map();
  let pipefail = false;

  stages.forEach((stage, index) => {
    if (stage.name) {
      if (names.has(stage.name)) add(stage.from, "error", "duplicate-stage", `Stage name "${stage.name}" is used twice (line ${names.get(stage.name)}).`, "give each stage its own name");
      else names.set(stage.name, stage.line);
    }
    const final = index === stages.length - 1;
    let cmds = 0;
    let entrypoints = 0;
    let lastUser;
    let copiedAll;
    let aptUpdateOnly;
    for (const instr of stage.instructions) {
      const kw = instr.getKeyword();
      const args = text(instr);
      if (kw === "SHELL" && /pipefail/.test(args)) pipefail = true;
      if (kw === "RUN") {
        const exec = /^\s*\[/.test(args);
        if (exec && /^\s*\[\s*'/.test(args)) add(instr, "error", "exec-form-quotes", "Exec form needs double quotes: with single quotes this is run as a shell command, brackets and all.", 'write ["cmd", "arg"]');
        for (const c of commands(args)) {
          for (const r of INSTALL_WITHOUT_YES) if (r.re.test(c) && !r.yes.test(c)) add(instr, "error", "install-without-yes", `${r.tool} without -y waits for a confirmation the build cannot give, and the build fails.`, r.fix);
          // sudo as the command, not a package called sudo in an install list.
          if (/^sudo\s/.test(c)) add(instr, "warning", "sudo", "sudo in a build step: build steps already run as the current USER, and sudo keeps a setuid binary in the image.", "run the step as root (USER root before it), then switch back");
          if (/^cd\s/.test(c) && commands(args).length === 1) add(instr, "info", "cd-in-run", "cd in its own RUN changes nothing for the next instruction.", "use WORKDIR");
          if (/\bpip3?\s+install\b/.test(c) && !/--no-cache-dir/.test(c) && !/PIP_NO_CACHE_DIR/.test(args)) add(instr, "info", "pip-cache", "pip keeps its download cache in the image.", "add --no-cache-dir");
          if (/\bapk\s+add\b/.test(c) && !/--no-cache/.test(c)) add(instr, "info", "apk-cache", "apk keeps its package index in the image.", "add --no-cache");
        }
        if (/\bapt(?:-get)?\s+(?:[^;&|]*\s)?install\b/.test(args)) {
          if (aptUpdateOnly && !/\bapt(?:-get)?\s+update\b/.test(args)) add(aptUpdateOnly, "warning", "apt-update-alone", "apt-get update in its own RUN is cached as a layer; a later install then uses stale package lists and can fail.", "run apt-get update && apt-get install in the same RUN");
          if (!/--no-install-recommends/.test(args)) add(instr, "info", "apt-recommends", "apt-get installs recommended packages too, which the image rarely needs.", "add --no-install-recommends");
          if (!/rm\s+-rf?\s+\/var\/lib\/apt\/lists/.test(args)) add(instr, "info", "apt-lists", "The apt package lists stay in the image.", "end the RUN with && rm -rf /var/lib/apt/lists/*");
          aptUpdateOnly = undefined;
        } else if (/\bapt(?:-get)?\s+update\b/.test(args)) aptUpdateOnly = instr;
        if (!exec && /[^|]\|[^|]/.test(args) && !pipefail && !/set\s+-[a-z]*o\s*pipefail|set\s+-o\s+pipefail/.test(args)) add(instr, "info", "pipefail", "A failing command before a pipe does not fail the build (sh has no pipefail).", 'set SHELL ["/bin/bash", "-o", "pipefail", "-c"] first, or add set -o pipefail;');
        if (copiedAll && /\b(npm\s+(ci|install)|yarn(\s+install)?\b|pnpm\s+install|pip3?\s+install\s+-r|poetry\s+install|bundle\s+install|go\s+mod\s+download|composer\s+install)/.test(args)) {
          add(instr, "info", "cache-order", `Dependencies are installed after COPY . (line ${copiedAll}), so any source change reinstalls them.`, "copy the dependency files first (package*.json, requirements.txt...), install, then copy the rest");
          copiedAll = undefined;
        }
      }
      if (kw === "COPY" || kw === "ADD") {
        const parts = instr.getArguments().map((a) => a.getValue());
        const sources = parts.slice(0, -1);
        const from = instr.getFlags?.().find((f) => f.getName() === "from")?.getValue();
        if (!from && sources.some((s) => s === ".." || s.startsWith("../"))) add(instr, "error", "outside-context", `${kw} cannot reach outside the build context (${sources.find((s) => s.startsWith(".."))}).`, "move the file into the context, or build from a parent directory");
        if (from && !/[:/.@]/.test(from) && !/^\d+$/.test(from) && !names.has(from.toLowerCase()) && !stages.slice(index).some((s) => s.name === from.toLowerCase())) add(instr, "error", "unknown-stage", `--from=${from} names no earlier stage${names.size ? ` (stages: ${[...names.keys()].join(", ")})` : ""}, so Docker pulls an image called ${from}.`, "use a stage name defined above, or a full image reference");
        if (from && stages.slice(index).some((s) => s.name === from.toLowerCase())) add(instr, "error", "unknown-stage", `--from=${from} refers to a stage defined later; a stage can copy only from stages above it.`);
        if (!from && sources.some((s) => s === "." || s === "./")) copiedAll = copiedAll ?? lineOf(instr);
        if (kw === "ADD") {
          const remote = sources.filter((s) => /^https?:\/\//.test(s));
          const archives = sources.filter((s) => /\.(tar|tar\.gz|tgz|tar\.bz2|tar\.xz|txz)$/.test(s));
          if (remote.length && !instr.getFlags?.().some((f) => f.getName() === "checksum")) add(instr, "warning", "add-url", "ADD downloads the URL at every build without verifying it.", "add --checksum=sha256:..., or download with curl and check the hash");
          else if (!remote.length && !archives.length && !sources.some((s) => /^git@|\.git$/.test(s))) add(instr, "info", "add-local", "ADD of a local file: COPY does the same without ADD's archive and URL behaviour.", "use COPY");
        }
      }
      if (kw === "ENV" || kw === "ARG") {
        if (kw === "ENV" && instr.getArguments().length >= 2 && !instr.getArguments()[0].getValue().includes("=")) add(instr, "warning", "env-legacy", "ENV KEY value (without =) is the legacy form; it sets one variable to the whole rest of the line.", "write ENV KEY=value");
        for (const prop of instr.getProperties?.() ?? []) {
          const name = prop.getName?.() ?? "";
          const value = prop.getValue?.();
          if (SECRETISH.test(name) && (kw === "ARG" || (value && !/^\$/.test(value)))) add(instr, "warning", "secret-in-image", `${kw} ${name}${kw === "ENV" ? " keeps the secret in the image" : ": build arguments are recorded in the image history"}; anyone who can pull the image can read it.`, "use a build secret: RUN --mount=type=secret,id=... (and a runtime secret for ENV)");
        }
      }
      if (kw === "CMD") cmds++;
      if (kw === "ENTRYPOINT") entrypoints++;
      if ((kw === "CMD" || kw === "ENTRYPOINT") && final) {
        if (/^\s*\[\s*'/.test(args)) add(instr, "error", "exec-form-quotes", "Exec form needs double quotes: with single quotes this is run as a shell command, brackets and all.", 'write ["cmd", "arg"]');
        else if (!/^\s*\[/.test(args)) add(instr, kw === "ENTRYPOINT" ? "warning" : "info", "shell-form", `${kw} in shell form runs under /bin/sh -c: the process does not get SIGTERM, so it is killed after the stop timeout${kw === "ENTRYPOINT" ? ", and CMD arguments are ignored" : ""}.`, `write ${kw} ["executable", "arg"]`);
      }
      if (kw === "EXPOSE")
        for (const a of instr.getArguments().map((x) => x.getValue())) {
          const m = a.match(/^(\d+)(?:-(\d+))?(?:\/(tcp|udp|sctp))?$/i);
          if (!/^\$/.test(a) && (!m || Number(m[1]) < 1 || Number(m[1]) > 65535 || (m[2] && Number(m[2]) > 65535))) add(instr, "error", "invalid-port", `EXPOSE ${a} is not a port (1-65535, optionally /tcp or /udp).`);
        }
      if (kw === "USER") lastUser = { instr, user: args.trim().split(":")[0] };
    }
    if (cmds > 1) add(stage.from, "warning", "multiple-cmd", `This stage has ${cmds} CMD instructions; only the last takes effect.`);
    if (entrypoints > 1) add(stage.from, "warning", "multiple-entrypoint", `This stage has ${entrypoints} ENTRYPOINT instructions; only the last takes effect.`);
    if (final) {
      if (lastUser && ["root", "0"].includes(lastUser.user)) add(lastUser.instr, "warning", "root-user", "The final USER is root: the container starts as root (unless its entrypoint drops privileges itself).", "switch to an unprivileged user (USER 10001, or a named user) after the steps that need root");
      else if (!lastUser && stage.instructions.length) add(stage.from, "info", "no-user", "No USER in the final stage: the container runs as the base image's user, usually root.", "add USER with an unprivileged user");
    }
  });
  return out;
}
