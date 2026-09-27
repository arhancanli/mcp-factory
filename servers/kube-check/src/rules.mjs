// src/rules.mjs
//
// Checks beyond the schema. Three kinds:
// - What the API server refuses although the schema allows it: names and labels in the wrong
//   form, a Deployment whose selector does not match its pods, a request above its limit, a probe
//   with two handlers, ports out of range, a volume mount naming no volume.
// - The Pod Security Standards (kubernetes.io/docs/concepts/security/pod-security-standards/),
//   baseline and restricted, check by check as Pod Security admission applies them.
// - Risks that are allowed but usually unintended: unpinned images, no resource requests, secrets
//   written into env, a Service that selects no pods in the same files.
// Each finding is {severity, rule, segs, message, fix}; segs is the path inside the object.

const DNS1123_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const DNS1123_SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const DNS1035_LABEL = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;
const LABEL_PART = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;
const DATA_KEY = /^[-._a-zA-Z0-9]+$/;

export const WORKLOAD_POD = {
  Pod: ["spec"],
  Deployment: ["spec", "template", "spec"],
  ReplicaSet: ["spec", "template", "spec"],
  StatefulSet: ["spec", "template", "spec"],
  DaemonSet: ["spec", "template", "spec"],
  ReplicationController: ["spec", "template", "spec"],
  Job: ["spec", "template", "spec"],
  CronJob: ["spec", "jobTemplate", "spec", "template", "spec"],
  PodTemplate: ["template", "spec"],
};
const podMetaPath = (kind) => (kind === "Pod" ? ["metadata"] : [...WORKLOAD_POD[kind].slice(0, -1), "metadata"]);

const get = (obj, segs) => segs.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
const isIANASvcName = (s) => s.length <= 15 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s) && /[a-z]/.test(s) && !s.includes("--");

function dnsProblem(value, form) {
  const s = String(value);
  if (form === "dns1035") return s.length > 63 ? "at most 63 characters" : DNS1035_LABEL.test(s) ? undefined : "lowercase letters, digits and '-', starting with a letter and ending with a letter or digit";
  if (form === "label") return s.length > 63 ? "at most 63 characters" : DNS1123_LABEL.test(s) ? undefined : "lowercase letters, digits and '-', starting and ending with a letter or digit";
  return s.length > 253 ? "at most 253 characters" : DNS1123_SUBDOMAIN.test(s) ? undefined : "lowercase letters, digits, '-' and '.', starting and ending with a letter or digit";
}

/** Why a label (or annotation) key is invalid, or undefined. */
export function labelKeyProblem(key) {
  const k = String(key);
  const slash = k.lastIndexOf("/");
  const prefix = slash >= 0 ? k.slice(0, slash) : undefined;
  const name = slash >= 0 ? k.slice(slash + 1) : k;
  if (prefix !== undefined && (!prefix || prefix.length > 253 || !DNS1123_SUBDOMAIN.test(prefix))) return "its prefix (before '/') must be a DNS subdomain such as example.com";
  if (!name || name.length > 63) return "the name part must be 1 to 63 characters";
  if (!LABEL_PART.test(name)) return "the name part must be letters, digits, '-', '_' and '.', starting and ending with a letter or digit";
  return undefined;
}

/** Why a label value is invalid, or undefined. */
export function labelValueProblem(value) {
  if (typeof value !== "string") return undefined; // the schema reports non-strings
  if (value.length > 63) return "at most 63 characters";
  if (value && !LABEL_PART.test(value)) return "letters, digits, '-', '_' and '.', starting and ending with a letter or digit (or empty)";
  return undefined;
}

const BIN = { Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60 };
const DEC = { n: 1e-9, u: 1e-6, m: 1e-3, "": 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
/** A quantity ("500m", "1Gi", 2) as a number of base units; undefined when it is not a quantity. */
export function quantity(v) {
  if (typeof v === "number") return v;
  const m = String(v).match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([KMGTPE]i|[numkMGTPE]|[eE][+-]?\d+)?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const s = m[2] ?? "";
  if (BIN[s]) return n * BIN[s];
  if (s in DEC) return n * DEC[s];
  return n * 10 ** Number(s.slice(1));
}

/** For a string that is not a quantity: the message, and the value probably meant. */
export function quantityHint(value) {
  const s = String(value).trim();
  const m = s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([kmgtpe])(i)?(b|bytes?)?$/i);
  if (m && (m[3] || m[4] || m[2] !== m[2].toLowerCase() || m[2] === "K")) {
    const u = m[2].toUpperCase();
    const binary = `${m[1]}${u}i`;
    const decimal = `${m[1]}${u === "K" ? "k" : u}`;
    return { message: `"${s}" is not a quantity: write ${binary} (powers of 1024) or ${decimal} (powers of 1000); units are Ki Mi Gi Ti Pi Ei or k M G T P E, and m means thousandths`, did_you_mean: binary };
  }
  return { message: `"${s}" is not a quantity: a number with an optional unit, such as 500m (CPU), 256Mi or 1Gi (memory)` };
}

function* containersOf(spec) {
  for (const list of ["initContainers", "containers", "ephemeralContainers"]) {
    const arr = spec?.[list];
    if (Array.isArray(arr)) for (let i = 0; i < arr.length; i++) if (arr[i] && typeof arr[i] === "object") yield { c: arr[i], segs: [list, String(i)], list };
  }
}

// ---- Pod Security Standards --------------------------------------------------------------------

const BASELINE_CAPS = new Set(["AUDIT_WRITE", "CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "MKNOD", "NET_BIND_SERVICE", "SETFCAP", "SETGID", "SETPCAP", "SETUID", "SYS_CHROOT"]);
const SAFE_SYSCTLS = new Set(["kernel.shm_rmid_forced", "net.ipv4.ip_local_port_range", "net.ipv4.ip_unprivileged_port_start", "net.ipv4.tcp_syncookies", "net.ipv4.ping_group_range", "net.ipv4.ip_local_reserved_ports", "net.ipv4.tcp_keepalive_time", "net.ipv4.tcp_fin_timeout", "net.ipv4.tcp_keepalive_intvl", "net.ipv4.tcp_keepalive_probes"]);
const SELINUX_TYPES = new Set(["", "container_t", "container_init_t", "container_kvm_t", "container_engine_t"]);
const RESTRICTED_VOLUMES = new Set(["configMap", "csi", "downwardAPI", "emptyDir", "ephemeral", "persistentVolumeClaim", "projected", "secret"]);

/**
 * Pod Security violations of a pod spec at `base` (segs of the spec in the object). `level` is the
 * highest level checked; findings carry the level they belong to.
 */
export function podSecurity(obj, kind, level) {
  const base = WORKLOAD_POD[kind];
  const spec = get(obj, base);
  if (!spec || typeof spec !== "object") return [];
  const out = [];
  const add = (lvl, check, segs, message, fix) => out.push({ level: lvl, rule: `pod-security-${lvl}/${check}`, segs: [...base, ...segs], message, fix });
  const psc = spec.securityContext ?? {};
  const windows = spec.os?.name === "windows";

  // Baseline
  if (psc.windowsOptions?.hostProcess === true) add("baseline", "host-process", ["securityContext", "windowsOptions", "hostProcess"], "Windows HostProcess pods have full host access.", "remove hostProcess");
  for (const ns of ["hostNetwork", "hostPID", "hostIPC"]) if (spec[ns] === true) add("baseline", "host-namespaces", [ns], `${ns}: true shares the node's ${ns.slice(4).toLowerCase()} namespace with the pod.`, `remove ${ns}`);
  (spec.volumes ?? []).forEach((v, i) => {
    if (v?.hostPath) add("baseline", "host-path-volumes", ["volumes", String(i), "hostPath"], `Volume "${v.name}" mounts a path from the node (hostPath).`, "use a persistentVolumeClaim, configMap, secret or emptyDir volume");
  });
  if (psc.seccompProfile?.type === "Unconfined") add("baseline", "seccomp", ["securityContext", "seccompProfile", "type"], "The pod runs without a seccomp profile (Unconfined).", "use RuntimeDefault");
  if (psc.appArmorProfile?.type === "Unconfined") add("baseline", "apparmor", ["securityContext", "appArmorProfile", "type"], "The pod runs without an AppArmor profile (Unconfined).", "use RuntimeDefault or remove it");
  const sel = psc.seLinuxOptions;
  if (sel && ((sel.type !== undefined && !SELINUX_TYPES.has(sel.type)) || sel.user || sel.role)) add("baseline", "selinux", ["securityContext", "seLinuxOptions"], "Only the SELinux types container_t, container_init_t, container_kvm_t and container_engine_t are allowed, and user and role must not be set.", "remove the custom SELinux user, role or type");
  (psc.sysctls ?? []).forEach((s, i) => {
    if (s?.name && !SAFE_SYSCTLS.has(s.name)) add("baseline", "sysctls", ["securityContext", "sysctls", String(i), "name"], `The sysctl ${s.name} is not in the safe set.`, "remove it, or run the pod in a namespace with a less strict policy");
  });
  const meta = get(obj, podMetaPath(kind))?.annotations ?? {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith("container.apparmor.security.beta.kubernetes.io/") && v !== "runtime/default" && !String(v).startsWith("localhost/")) out.push({ level: "baseline", rule: "pod-security-baseline/apparmor", segs: [...podMetaPath(kind), "annotations", k], message: `The AppArmor annotation ${k} is "${v}".`, fix: "use runtime/default" });
  }
  for (const { c, segs } of containersOf(spec)) {
    const sc = c.securityContext ?? {};
    const name = `Container "${c.name ?? segs.join(".")}"`;
    if (sc.privileged === true) add("baseline", "privileged", [...segs, "securityContext", "privileged"], `${name} is privileged: it has every capability of the node.`, "remove privileged: true");
    if (sc.windowsOptions?.hostProcess === true) add("baseline", "host-process", [...segs, "securityContext", "windowsOptions", "hostProcess"], `${name} is a Windows HostProcess container.`, "remove hostProcess");
    const added = sc.capabilities?.add ?? [];
    const extra = added.filter((x) => !BASELINE_CAPS.has(String(x).replace(/^CAP_/, "")));
    if (extra.length) add("baseline", "capabilities", [...segs, "securityContext", "capabilities", "add"], `${name} adds ${extra.join(", ")}, beyond the baseline set.`, "remove them; baseline allows only the default capabilities");
    (c.ports ?? []).forEach((p, i) => {
      if (p?.hostPort) add("baseline", "host-ports", [...segs, "ports", String(i), "hostPort"], `${name} binds host port ${p.hostPort}.`, "remove hostPort and expose the port with a Service");
    });
    if (sc.procMount !== undefined && sc.procMount !== "Default") add("baseline", "proc-mount", [...segs, "securityContext", "procMount"], `${name} asks for an unmasked /proc.`, "remove procMount");
    if (sc.seccompProfile?.type === "Unconfined") add("baseline", "seccomp", [...segs, "securityContext", "seccompProfile", "type"], `${name} runs without a seccomp profile (Unconfined).`, "use RuntimeDefault");
    if (sc.appArmorProfile?.type === "Unconfined") add("baseline", "apparmor", [...segs, "securityContext", "appArmorProfile", "type"], `${name} runs without an AppArmor profile (Unconfined).`, "use RuntimeDefault or remove it");
    const csel = sc.seLinuxOptions;
    if (csel && ((csel.type !== undefined && !SELINUX_TYPES.has(csel.type)) || csel.user || csel.role)) add("baseline", "selinux", [...segs, "securityContext", "seLinuxOptions"], `${name} sets a custom SELinux user, role or type.`, "remove it");
  }
  if (level !== "restricted") return out;

  // Restricted
  (spec.volumes ?? []).forEach((v, i) => {
    const type = Object.keys(v ?? {}).find((k) => k !== "name");
    if (type && type !== "hostPath" && !RESTRICTED_VOLUMES.has(type)) add("restricted", "volume-types", ["volumes", String(i)], `Volume "${v.name}" is a ${type} volume.`, "use configMap, csi, downwardAPI, emptyDir, ephemeral, persistentVolumeClaim, projected or secret");
  });
  if (psc.runAsUser === 0) add("restricted", "run-as-non-root-user", ["securityContext", "runAsUser"], "The pod runs as user 0 (root).", "use a non-zero runAsUser");
  const containers = [...containersOf(spec)];
  const podNonRoot = psc.runAsNonRoot === true;
  const podSeccomp = ["RuntimeDefault", "Localhost"].includes(psc.seccompProfile?.type);
  for (const { c, segs } of containers) {
    const sc = c.securityContext ?? {};
    const name = `Container "${c.name ?? segs.join(".")}"`;
    if (!windows && sc.allowPrivilegeEscalation !== false) add("restricted", "privilege-escalation", [...segs, ...(c.securityContext ? ["securityContext"] : [])], `${name} does not set allowPrivilegeEscalation: false.`, "set securityContext.allowPrivilegeEscalation: false");
    if (sc.runAsNonRoot === false || (!podNonRoot && sc.runAsNonRoot !== true)) add("restricted", "run-as-non-root", [...segs, ...(c.securityContext ? ["securityContext"] : [])], `${name} may run as root: runAsNonRoot is not true for it or the pod.`, "set securityContext.runAsNonRoot: true on the pod");
    if (sc.runAsUser === 0) add("restricted", "run-as-non-root-user", [...segs, "securityContext", "runAsUser"], `${name} runs as user 0 (root).`, "use a non-zero runAsUser");
    if (!podSeccomp && !["RuntimeDefault", "Localhost"].includes(sc.seccompProfile?.type)) add("restricted", "seccomp", [...segs, ...(c.securityContext ? ["securityContext"] : [])], `${name} has no seccomp profile (neither it nor the pod sets RuntimeDefault or Localhost).`, "set securityContext.seccompProfile.type: RuntimeDefault on the pod");
    if (!windows) {
      const drop = (sc.capabilities?.drop ?? []).map(String);
      if (!drop.includes("ALL")) add("restricted", "capabilities", [...segs, ...(c.securityContext ? ["securityContext"] : [])], `${name} does not drop ALL capabilities.`, "set securityContext.capabilities.drop: [ALL]");
      const add2 = (sc.capabilities?.add ?? []).map(String).filter((x) => x !== "NET_BIND_SERVICE");
      if (add2.length) add("restricted", "capabilities", [...segs, "securityContext", "capabilities", "add"], `${name} adds ${add2.join(", ")}; restricted allows only NET_BIND_SERVICE.`, "remove them");
    }
  }
  return out;
}

// ---- Per-object checks --------------------------------------------------------------------------

const NAME_FORM = { Service: "dns1035", Namespace: "label" };
const FREE_NAMES = new Set(["Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"]);
const SECRETISH = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL)/i;

function labelFindings(map, segs, what) {
  const out = [];
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map)) {
    const kp = labelKeyProblem(k);
    if (kp) out.push({ severity: "error", rule: "invalid-label", segs: [...segs, k], message: `${what} key "${k}" is invalid: ${kp}.` });
    const vp = labelValueProblem(v);
    if (vp) out.push({ severity: "error", rule: "invalid-label", segs: [...segs, k], message: `${what} value "${v}" is invalid: ${vp}.` });
  }
  return out;
}

function selectorMatches(selector, labels) {
  if (!selector || typeof selector !== "object") return undefined;
  const l = labels ?? {};
  for (const [k, v] of Object.entries(selector.matchLabels ?? {})) if (l[k] !== v) return false;
  for (const e of selector.matchExpressions ?? []) {
    const has = Object.hasOwn(l, e.key);
    if (e.operator === "In" && !(has && (e.values ?? []).includes(l[e.key]))) return false;
    if (e.operator === "NotIn" && has && (e.values ?? []).includes(l[e.key])) return false;
    if (e.operator === "Exists" && !has) return false;
    if (e.operator === "DoesNotExist" && has) return false;
  }
  return true;
}

function containerChecks(c, segs, spec) {
  const out = [];
  const name = `Container "${c.name ?? segs.join(".")}"`;
  if (typeof c.name === "string" && dnsProblem(c.name, "label")) out.push({ severity: "error", rule: "invalid-name", segs: [...segs, "name"], message: `${name}: container names must be ${dnsProblem(c.name, "label")}.` });
  (c.ports ?? []).forEach((p, i) => {
    if (typeof p?.containerPort === "number" && (p.containerPort < 1 || p.containerPort > 65535)) out.push({ severity: "error", rule: "invalid-port", segs: [...segs, "ports", String(i), "containerPort"], message: `${name}: containerPort ${p.containerPort} is outside 1-65535.` });
    if (typeof p?.name === "string" && !isIANASvcName(p.name)) out.push({ severity: "error", rule: "invalid-port-name", segs: [...segs, "ports", String(i), "name"], message: `${name}: port name "${p.name}" must be at most 15 lowercase letters, digits and '-', with at least one letter.` });
  });
  for (const probe of ["livenessProbe", "readinessProbe", "startupProbe"]) {
    const p = c[probe];
    if (!p || typeof p !== "object") continue;
    const handlers = ["exec", "httpGet", "tcpSocket", "grpc"].filter((h) => p[h]);
    if (handlers.length !== 1) out.push({ severity: "error", rule: "invalid-probe", segs: [...segs, probe], message: `${name}: ${probe} must have exactly one of exec, httpGet, tcpSocket or grpc (it has ${handlers.length ? handlers.join(" and ") : "none"}).` });
  }
  const req = c.resources?.requests ?? {};
  const lim = c.resources?.limits ?? {};
  for (const [r, v] of Object.entries(req)) {
    const a = quantity(v);
    const b = lim[r] !== undefined ? quantity(lim[r]) : undefined;
    if (a !== undefined && b !== undefined && a > b) out.push({ severity: "error", rule: "request-above-limit", segs: [...segs, "resources", "requests", r], message: `${name}: the ${r} request (${v}) is above its limit (${lim[r]}).`, fix: `raise the ${r} limit or lower the request` });
  }
  (c.env ?? []).forEach((e, i) => {
    if (!e || typeof e !== "object") return;
    if (e.value !== undefined && e.value !== "" && e.valueFrom) out.push({ severity: "error", rule: "invalid-env", segs: [...segs, "env", String(i)], message: `${name}: env ${e.name} has both value and valueFrom.` });
    if (typeof e.value === "string" && e.value && SECRETISH.test(String(e.name)) && !/^\$\(/.test(e.value)) out.push({ severity: "warning", rule: "secret-in-env", segs: [...segs, "env", String(i), "value"], message: `${name}: ${e.name} is written into the manifest in plain text.`, fix: "move it to a Secret and use valueFrom.secretKeyRef" });
  });
  const volumes = new Set((spec.volumes ?? []).map((v) => v?.name));
  (c.volumeMounts ?? []).forEach((m, i) => {
    if (m?.name && !volumes.has(m.name)) out.push({ severity: "error", rule: "unknown-volume", segs: [...segs, "volumeMounts", String(i), "name"], message: `${name}: volumeMount "${m.name}" names no volume in the pod.`, fix: volumes.size ? `the pod's volumes are ${[...volumes].join(", ")}` : "add the volume under the pod's volumes" });
  });
  if (segs[0] === "containers") {
    const image = typeof c.image === "string" ? c.image : "";
    const last = image.split("/").pop() ?? "";
    if (image && !image.includes("@") && (!last.includes(":") || last.endsWith(":latest"))) out.push({ severity: "warning", rule: "unpinned-image", segs: [...segs, "image"], message: `${name}: image ${image} is ${last.includes(":") ? "the moving latest tag" : "untagged (latest)"}; each restart may run a different build.`, fix: "pin a version tag, or a digest (@sha256:...)" });
    if (!c.resources?.requests && !c.resources?.limits) out.push({ severity: "warning", rule: "no-resources", segs: [...segs], message: `${name} has no resource requests or limits: the scheduler places it blind and it can starve its neighbours.`, fix: "set resources.requests for cpu and memory, and a memory limit" });
  }
  return out;
}

/** The API server's own checks, and the risk checks, for one built-in object. */
export function objectChecks(obj) {
  const out = [];
  const kind = obj.kind;
  const meta = obj.metadata ?? {};
  if (!meta.name && !meta.generateName) out.push({ severity: "error", rule: "missing-name", segs: ["metadata"], message: "metadata.name is required (or generateName, with kubectl create)." });
  else if (typeof meta.name === "string" && !FREE_NAMES.has(kind)) {
    const p = dnsProblem(meta.name, NAME_FORM[kind] ?? "subdomain");
    if (p) out.push({ severity: "error", rule: "invalid-name", segs: ["metadata", "name"], message: `The ${kind} name "${meta.name}" is invalid: ${p}.` });
  }
  if (typeof meta.namespace === "string" && dnsProblem(meta.namespace, "label")) out.push({ severity: "error", rule: "invalid-name", segs: ["metadata", "namespace"], message: `Namespace "${meta.namespace}" is invalid: ${dnsProblem(meta.namespace, "label")}.` });
  out.push(...labelFindings(meta.labels, ["metadata", "labels"], "Label"));
  for (const k of Object.keys(meta.annotations ?? {})) {
    const kp = labelKeyProblem(k);
    if (kp) out.push({ severity: "error", rule: "invalid-annotation", segs: ["metadata", "annotations", k], message: `Annotation key "${k}" is invalid: ${kp}.` });
  }

  const podPath = WORKLOAD_POD[kind];
  if (podPath) {
    const spec = get(obj, podPath) ?? {};
    const templateLabels = get(obj, [...podMetaPath(kind), "labels"]);
    if (kind !== "Pod") out.push(...labelFindings(templateLabels, [...podMetaPath(kind), "labels"], "Pod template label"));
    const selector = obj.spec?.selector;
    if (["Deployment", "ReplicaSet", "StatefulSet", "DaemonSet"].includes(kind) && selector && typeof selector === "object") {
      out.push(...labelFindings(selector.matchLabels, ["spec", "selector", "matchLabels"], "Selector label"));
      if (selectorMatches(selector, templateLabels) === false) out.push({ severity: "error", rule: "selector-mismatch", segs: ["spec", "selector"], message: `The selector does not match the pod template's labels${templateLabels ? ` (${Object.entries(templateLabels).map(([k, v]) => `${k}=${v}`).join(", ")})` : " (it has none)"}: the API server refuses it.`, fix: "make spec.template.metadata.labels contain every selector label" });
    }
    if (["Deployment", "ReplicaSet", "StatefulSet", "DaemonSet", "ReplicationController"].includes(kind) && spec.restartPolicy && spec.restartPolicy !== "Always") out.push({ severity: "error", rule: "invalid-restart-policy", segs: [...podPath, "restartPolicy"], message: `A ${kind}'s pods must use restartPolicy: Always (not ${spec.restartPolicy}).` });
    if (["Job", "CronJob"].includes(kind) && spec.restartPolicy === "Always") out.push({ severity: "error", rule: "invalid-restart-policy", segs: [...podPath, "restartPolicy"], message: `A ${kind}'s pods must use restartPolicy OnFailure or Never.` });
    if (["Job", "CronJob"].includes(kind) && !spec.restartPolicy) out.push({ severity: "error", rule: "invalid-restart-policy", segs: podPath, message: `A ${kind}'s pod template needs restartPolicy: OnFailure or Never (the default, Always, is refused).` });
    const seen = new Set();
    for (const { c, segs } of containersOf(spec)) {
      if (c.name && seen.has(c.name)) out.push({ severity: "error", rule: "duplicate-container", segs: [...podPath, ...segs, "name"], message: `Two containers are named "${c.name}".` });
      seen.add(c.name);
      out.push(...containerChecks(c, segs, spec).map((f) => ({ ...f, segs: [...podPath, ...f.segs] })));
    }
  }
  if (kind === "Service" && obj.spec) {
    const ports = obj.spec.ports ?? [];
    if (ports.length > 1)
      ports.forEach((p, i) => {
        if (!p?.name) out.push({ severity: "error", rule: "unnamed-port", segs: ["spec", "ports", String(i)], message: "A Service with more than one port must name every port." });
      });
    ports.forEach((p, i) => {
      if (typeof p?.port === "number" && (p.port < 1 || p.port > 65535)) out.push({ severity: "error", rule: "invalid-port", segs: ["spec", "ports", String(i), "port"], message: `Port ${p.port} is outside 1-65535.` });
      if (typeof p?.targetPort === "number" && (p.targetPort < 1 || p.targetPort > 65535)) out.push({ severity: "error", rule: "invalid-port", segs: ["spec", "ports", String(i), "targetPort"], message: `targetPort ${p.targetPort} is outside 1-65535.` });
      if (typeof p?.targetPort === "string" && !/^\d+$/.test(p.targetPort) && !isIANASvcName(p.targetPort)) out.push({ severity: "error", rule: "invalid-port-name", segs: ["spec", "ports", String(i), "targetPort"], message: `targetPort "${p.targetPort}" is neither a number nor a valid port name.` });
      if (typeof p?.nodePort === "number" && (p.nodePort < 30000 || p.nodePort > 32767)) out.push({ severity: "warning", rule: "node-port-range", segs: ["spec", "ports", String(i), "nodePort"], message: `nodePort ${p.nodePort} is outside the default NodePort range 30000-32767; it is refused unless the cluster's range was changed.` });
      if (typeof p?.name === "string" && !isIANASvcName(p.name) && dnsProblem(p.name, "label")) out.push({ severity: "error", rule: "invalid-port-name", segs: ["spec", "ports", String(i), "name"], message: `Port name "${p.name}" is invalid: ${dnsProblem(p.name, "label")}.` });
    });
    if (obj.spec.type === "ExternalName" && !obj.spec.externalName) out.push({ severity: "error", rule: "missing-external-name", segs: ["spec"], message: "A Service of type ExternalName needs spec.externalName." });
    out.push(...labelFindings(obj.spec.selector, ["spec", "selector"], "Selector label"));
  }
  if ((kind === "ConfigMap" || kind === "Secret") && obj.data && typeof obj.data === "object") {
    for (const k of Object.keys(obj.data)) if (!DATA_KEY.test(k) || k.length > 253) out.push({ severity: "error", rule: "invalid-key", segs: ["data", k], message: `Key "${k}" is invalid: letters, digits, '-', '_' and '.' only.` });
  }
  if (kind === "CronJob" && typeof obj.spec?.schedule === "string") {
    const sch = obj.spec.schedule.trim();
    if (/^(CRON_TZ|TZ)=/.test(sch)) out.push({ severity: "error", rule: "invalid-schedule", segs: ["spec", "schedule"], message: "A time zone inside the schedule (CRON_TZ= or TZ=) is refused.", fix: "put the zone in spec.timeZone" });
    else if (!/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/.test(sch) && sch.split(/\s+/).length !== 5) out.push({ severity: "error", rule: "invalid-schedule", segs: ["spec", "schedule"], message: `The schedule "${sch}" must have 5 fields (minute hour day-of-month month day-of-week) or be a macro such as @daily.` });
    if (typeof obj.spec.timeZone === "string") {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: obj.spec.timeZone });
      } catch {
        out.push({ severity: "error", rule: "invalid-time-zone", segs: ["spec", "timeZone"], message: `"${obj.spec.timeZone}" is not an IANA time zone name.`, fix: "use a name such as Europe/Berlin or Etc/UTC" });
      }
    }
  }
  if (kind === "HorizontalPodAutoscaler" && typeof obj.spec?.minReplicas === "number" && typeof obj.spec?.maxReplicas === "number" && obj.spec.minReplicas > obj.spec.maxReplicas) out.push({ severity: "error", rule: "invalid-replicas", segs: ["spec", "minReplicas"], message: `minReplicas (${obj.spec.minReplicas}) is above maxReplicas (${obj.spec.maxReplicas}).` });
  if (kind === "Ingress")
    (obj.spec?.rules ?? []).forEach((r, i) => {
      if (typeof r?.host === "string" && !/^(\*\.)?[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/.test(r.host)) out.push({ severity: "error", rule: "invalid-host", segs: ["spec", "rules", String(i), "host"], message: `Host "${r.host}" must be a lowercase DNS name (a leading "*." is allowed), not an IP address or URL.` });
    });
  return out;
}

// ---- Across objects ------------------------------------------------------------------------------

const nsOf = (o) => o.metadata?.namespace ?? "";

/** Checks that need several objects: duplicates, Services that select nothing, Ingresses to missing Services. */
export function crossChecks(items) {
  const out = [];
  const seen = new Map();
  for (const it of items) {
    const { obj } = it;
    const id = `${String(obj.apiVersion).split("/").slice(0, -1).join("/")}|${obj.kind}|${nsOf(obj)}|${obj.metadata?.name}`;
    if (obj.metadata?.name && seen.has(id)) out.push({ item: it, severity: "error", rule: "duplicate-object", segs: ["metadata", "name"], message: `${obj.kind} "${obj.metadata.name}" is defined twice (also ${seen.get(id)}); the second overwrites the first.` });
    else seen.set(id, `${it.file}:${it.line ?? "?"}`);
  }
  const workloads = items.filter((it) => WORKLOAD_POD[it.obj.kind] && it.obj.kind !== "PodTemplate");
  const pods = workloads.map((it) => ({ it, ns: nsOf(it.obj), labels: get(it.obj, [...podMetaPath(it.obj.kind), "labels"]) ?? {}, spec: get(it.obj, WORKLOAD_POD[it.obj.kind]) ?? {} }));
  const services = items.filter((it) => it.obj.kind === "Service");
  for (const s of services) {
    const sel = s.obj.spec?.selector;
    if (!workloads.length || !sel || typeof sel !== "object" || !Object.keys(sel).length || s.obj.spec?.type === "ExternalName") continue;
    const matched = pods.filter((p) => p.ns === nsOf(s.obj) && Object.entries(sel).every(([k, v]) => p.labels[k] === v));
    if (!matched.length) {
      // Only a near miss is reported: a workload here whose pods carry every selector key, with a
      // different value. Pods made by operators (Prometheus, Alertmanager) are not in the files.
      const near = pods.find((p) => p.ns === nsOf(s.obj) && Object.keys(sel).every((k) => Object.hasOwn(p.labels, k)));
      if (near) {
        const diff = Object.entries(sel).filter(([k, v]) => near.labels[k] !== v).map(([k]) => `${k}=${near.labels[k]}`).join(", ");
        out.push({ item: s, severity: "warning", rule: "service-selects-nothing", segs: ["spec", "selector"], message: `Service "${s.obj.metadata?.name}" selects ${Object.entries(sel).map(([k, v]) => `${k}=${v}`).join(", ")}, but ${near.it.obj.kind} "${near.it.obj.metadata?.name}"'s pods have ${diff}: the Service reaches no pods.`, fix: "make the selector and the pod template labels agree" });
      }
      continue;
    }
    (s.obj.spec?.ports ?? []).forEach((p, i) => {
      if (typeof p?.targetPort !== "string" || /^\d+$/.test(p.targetPort)) return;
      const named = matched.some((m) => [...containersOf(m.spec)].some(({ c }) => (c.ports ?? []).some((cp) => cp?.name === p.targetPort)));
      if (!named) out.push({ item: s, severity: "error", rule: "unknown-target-port", segs: ["spec", "ports", String(i), "targetPort"], message: `targetPort "${p.targetPort}" names no container port of the pods this Service selects; traffic to it goes nowhere.` });
    });
  }
  const serviceNames = new Map(services.map((s) => [`${nsOf(s.obj)}|${s.obj.metadata?.name}`, s.obj]));
  if (services.length)
    for (const ing of items.filter((it) => it.obj.kind === "Ingress")) {
      const backends = [];
      if (ing.obj.spec?.defaultBackend?.service) backends.push({ b: ing.obj.spec.defaultBackend.service, segs: ["spec", "defaultBackend", "service"] });
      (ing.obj.spec?.rules ?? []).forEach((r, i) =>
        (r?.http?.paths ?? []).forEach((p, j) => {
          if (p?.backend?.service) backends.push({ b: p.backend.service, segs: ["spec", "rules", String(i), "http", "paths", String(j), "backend", "service"] });
        }),
      );
      for (const { b, segs } of backends) {
        const svc = serviceNames.get(`${nsOf(ing.obj)}|${b.name}`);
        if (!svc) out.push({ item: ing, severity: "warning", rule: "unknown-service", segs: [...segs, "name"], message: `The Ingress routes to Service "${b.name}", which is not among these files' Services in its namespace.` });
        else if (b.port && !(svc.spec?.ports ?? []).some((p) => (b.port.number !== undefined && p.port === b.port.number) || (b.port.name !== undefined && p.name === b.port.name))) out.push({ item: ing, severity: "error", rule: "unknown-service-port", segs: [...segs, "port"], message: `Service "${b.name}" has no port ${b.port.number ?? `named ${b.port.name}`}.`, fix: `its ports are ${(svc.spec?.ports ?? []).map((p) => p.name ?? p.port).join(", ")}` });
      }
    }
  return out;
}
