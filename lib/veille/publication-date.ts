import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { ageInDays, publishedCalendarDate } from "./verify";
import type { VeilleArticle, VeillePeriod } from "./types";

export const PUBLICATION_HTML_LIMIT = 262_144;
const MAX_BYTES = PUBLICATION_HTML_LIMIT;
const TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 3;
const MAX_LOOKUPS = 8;
const CONCURRENCY = 3;

const PUBLISHED_KEYS = new Set([
  "article:published_time",
  "article:published",
  "parsely-pub-date",
  "sailthru.date",
  "dc.date",
  "dcterms.issued",
  "citation_publication_date",
  "datepublished",
]);

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.0.0", 24, "ipv4");
blocked.addSubnet("192.0.2.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("198.51.100.0", 24, "ipv4");
blocked.addSubnet("203.0.113.0", 24, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addSubnet("240.0.0.0", 4, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith("::ffff:")
    ? address.slice(7)
    : address;
  const version = isIP(mapped);
  if (version !== 4 && version !== 6) {
    return true;
  }
  return blocked.check(mapped, version === 4 ? "ipv4" : "ipv6");
}

function isUnsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localdomain") ||
    host === "metadata.google.internal" ||
    host === "metadata.google.com"
  ) {
    return true;
  }
  if (!host.includes(".") || /^\d+$/.test(host)) {
    return true;
  }
  return false;
}

export type DateProbeResult =
  | { kind: "timeout" }
  | {
      kind: "response";
      status: number;
      headers: Record<string, string>;
      body: string;
      truncated?: boolean;
    };

export type DateProbe = {
  resolveHost: (hostname: string) => Promise<string[]>;
  request: (target: { url: string; addresses: string[] }) => Promise<DateProbeResult>;
};

function header(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return null;
}

async function vettedTarget(
  rawUrl: string,
  resolveHost: DateProbe["resolveHost"]
): Promise<{ url: string; addresses: string[] } | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return null;
  }
  if (isUnsafeHostname(url.hostname)) {
    return null;
  }
  const literal = isIP(url.hostname);
  const addresses =
    literal === 4 || literal === 6 ? [url.hostname] : await resolveHost(url.hostname);
  if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
    return null;
  }
  return { url: url.href, addresses };
}

export function extractPublishedDate(html: string, now: Date): string | null {
  const headEnd = html.search(/<\/head>/i);
  const scope = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const found = new Set<string>();

  for (const tag of scope.match(/<meta\b[^>]*>/gi) ?? []) {
    const read = (name: string) => {
      const match = tag.match(
        new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
      );
      return match?.[1] ?? match?.[2] ?? null;
    };
    const key = (read("property") ?? read("name") ?? read("itemprop") ?? "").toLowerCase();
    if (!key || key.includes("modified") || key.includes("updated") || !PUBLISHED_KEYS.has(key)) {
      continue;
    }
    const date = publishedCalendarDate(read("content"), now);
    if (date) {
      found.add(date);
    }
  }

  const scripts =
    scope.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ??
    [];
  for (const script of scripts.slice(0, 5)) {
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      collectDatePublished(JSON.parse(body), 0, found, now);
    } catch {
      // fragment JSON-LD illisible
    }
  }

  if (found.size !== 1) {
    return null;
  }
  return [...found][0] ?? null;
}

function collectDatePublished(
  value: unknown,
  depth: number,
  found: Set<string>,
  now: Date
) {
  if (depth > 6 || !value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDatePublished(item, depth + 1, found, now);
    }
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "dateModified" || key === "dateUpdated" || key === "uploadDate") {
      continue;
    }
    if (key === "datePublished") {
      const date = publishedCalendarDate(item, now);
      if (date) {
        found.add(date);
      }
      continue;
    }
    collectDatePublished(item, depth + 1, found, now);
  }
}

export async function readPublicationDate(
  rawUrl: string,
  now: Date,
  probe: DateProbe
): Promise<string | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = await vettedTarget(current, probe.resolveHost).catch(() => null);
    if (!target) {
      return null;
    }
    let response: DateProbeResult;
    try {
      response = await probe.request(target);
    } catch {
      return null;
    }
    if (response.kind === "timeout") {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = header(response.headers, "location");
      if (!location) {
        return null;
      }
      try {
        current = new URL(location, target.url).href;
      } catch {
        return null;
      }
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      return null;
    }
    const length = Number(header(response.headers, "content-length"));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return null;
    }
    const type = header(response.headers, "content-type") ?? "";
    if (type && !/text\/html|application\/xhtml\+xml|application\/ld\+json/i.test(type)) {
      return null;
    }
    const capped = response.truncated === true || response.body.length > MAX_BYTES;
    const body = response.body.length > MAX_BYTES ? response.body.slice(0, MAX_BYTES) : response.body;
    if (capped && !/<\/head>/i.test(body)) {
      return null;
    }
    return extractPublishedDate(body, now);
  }
  return null;
}

export async function confirmArticleDates(
  articles: VeilleArticle[],
  periodDays: VeillePeriod,
  now: Date,
  lookup: (url: string) => Promise<string | null>
): Promise<{ articles: VeilleArticle[]; discarded: number }> {
  const limit = Math.min(articles.length, MAX_LOOKUPS);
  const dates: Array<string | null> = articles.map(() => null);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, limit) }, async () => {
    while (cursor < limit) {
      const index = cursor;
      cursor += 1;
      try {
        dates[index] = await lookup(articles[index].url);
      } catch {
        dates[index] = null;
      }
    }
  });
  await Promise.all(workers);

  const kept: VeilleArticle[] = [];
  let discarded = 0;
  articles.forEach((article, index) => {
    const found = dates[index];
    if (!found) {
      kept.push(article);
      return;
    }
    if (ageInDays(found, now) > periodDays) {
      discarded += 1;
      return;
    }
    kept.push({ ...article, publishedOn: found, dateVerified: true });
  });
  return { articles: kept, discarded };
}

function assertExternalFetchAllowed(): void {
  const automated =
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event === "test" ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test") ||
    process.argv.some((arg) => {
      const path = arg.replace(/\\/g, "/");
      return path.endsWith(".test.ts") && (path.includes("/tests/") || path.startsWith("tests/"));
    });
  if (automated) {
    throw new Error("Les tests automatisés ne contactent pas les sites externes.");
  }
}

function liveRequest(target: { url: string; addresses: string[] }): Promise<DateProbeResult> {
  assertExternalFetchAllowed();
  const url = new URL(target.url);
  const transport = url.protocol === "https:" ? https : http;
  const addresses = [...target.addresses];
  return new Promise((resolve) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: TIMEOUT_MS,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "NaxialisEditorialWatch/1.1",
        },
        lookup: (_hostname, _options, callback) => {
          const address = addresses[0];
          if (!address || isBlockedAddress(address)) {
            callback(new Error("blocked"), "", 4);
            return;
          }
          callback(null, address, address.includes(":") ? 6 : 4);
        },
      },
      (response) => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === "string") {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(", ");
          }
        }
        const length = Number(headers["content-length"]);
        if (Number.isFinite(length) && length > MAX_BYTES) {
          response.resume();
          resolve({ kind: "response", status: response.statusCode ?? 0, headers, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let settled = false;
        const finish = (body: string, truncated: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          response.destroy();
          resolve({
            kind: "response",
            status: response.statusCode ?? 0,
            headers,
            body,
            truncated,
          });
        };
        response.on("data", (chunk: Buffer) => {
          const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const room = MAX_BYTES - received;
          if (room <= 0) {
            finish(Buffer.concat(chunks).toString("utf8"), true);
            return;
          }
          const slice = data.subarray(0, room);
          chunks.push(slice);
          received += slice.length;
          const text = Buffer.concat(chunks).toString("utf8");
          const closed = /<\/head>/i.test(text);
          if (closed || received >= MAX_BYTES) {
            finish(text, !closed && received >= MAX_BYTES);
          }
        });
        response.on("end", () => {
          finish(Buffer.concat(chunks).toString("utf8"), false);
        });
        response.on("error", () => {
          if (!settled) {
            settled = true;
            resolve({ kind: "timeout" });
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ kind: "timeout" });
    });
    req.on("error", () => {
      resolve({ kind: "timeout" });
    });
    req.end();
  });
}

const liveProbe: DateProbe = {
  async resolveHost(hostname) {
    assertExternalFetchAllowed();
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  },
  request: liveRequest,
};

export function lookupPublishedDate(url: string, now: Date): Promise<string | null> {
  assertExternalFetchAllowed();
  return readPublicationDate(url, now, liveProbe);
}
