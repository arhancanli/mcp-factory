// src/ip.mjs
//
// IPv4 and IPv6 addresses: version, CIDR membership, and the dotted-nibble form SPF macros use.
import { isIPv4, isIPv6 } from "node:net";

export const ipVersion = (s) => (isIPv4(String(s ?? "")) ? 4 : isIPv6(String(s ?? "")) ? 6 : 0);

function v4ToInt(ip) {
  return ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
}

/** An IPv6 address as a 128-bit BigInt (embedded IPv4 tails included). */
function v6ToBig(ip) {
  let s = ip.toLowerCase();
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    s = s.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [];
  const r = rest !== undefined ? (rest ? rest.split(":") : []) : [];
  const groups = rest !== undefined ? [...h, ...Array(8 - h.length - r.length).fill("0"), ...r] : h;
  return groups.reduce((n, g) => (n << 16n) + BigInt(parseInt(g || "0", 16)), 0n);
}

/** Whether ip lies in network/bits (both the same version). */
export function inCidr(ip, network, bits) {
  const v = ipVersion(ip);
  if (!v || v !== ipVersion(network)) return false;
  if (v === 4) {
    if (bits === 0) return true;
    const mask = bits >= 32 ? 0xffffffff : ~((1 << (32 - bits)) - 1) >>> 0;
    return (v4ToInt(ip) & mask) >>> 0 === (v4ToInt(network) & mask) >>> 0;
  }
  const shift = BigInt(128 - bits);
  return v6ToBig(ip) >> shift === v6ToBig(network) >> shift;
}

/** 192.0.2.1 -> 1.2.0.192; 2001:db8::1 -> its 32 nibbles, reversed and dotted. */
export function reverseIp(ip) {
  if (ipVersion(ip) === 4) return ip.split(".").reverse().join(".");
  return v6ToBig(ip).toString(16).padStart(32, "0").split("").reverse().join(".");
}
