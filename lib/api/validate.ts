/**
 * Defensive readers for untrusted upstream JSON.
 * Each returns a well-typed value or undefined, never throws.
 */

export type Json = unknown;

export function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: Json, max = 4000): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t.slice(0, max) : undefined;
  }
  // Open Library sometimes wraps text: { type: "/type/text", value: "..." }
  if (isRecord(v) && typeof v.value === "string") return str(v.value, max);
  return undefined;
}

export function num(v: Json): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function strArray(v: Json, maxItems = 200): string[] {
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      const s = str(item, 300);
      if (s) out.push(s);
      if (out.length >= maxItems) break;
    }
    return out;
  }
  const single = str(v, 300);
  return single ? [single] : [];
}

export function numArray(v: Json): number[] {
  if (!Array.isArray(v)) return [];
  return v.map(num).filter((n): n is number => n !== undefined);
}

export function year(v: Json): number | undefined {
  const n = num(v);
  if (n !== undefined && n > 0 && n < 2100) return Math.round(n);
  const s = str(v);
  const m = s?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? Number(m[1]) : undefined;
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Title-case titles that arrive fully lowercased ("one hundred years of solitude"). */
export function tidyTitle(title: string): string {
  const t = title.split(" * ")[0].replace(/\s+/g, " ").trim().replace(/(?<![A-Z])\.$/, "");
  const hasUpperAfterFirst = /[A-Z]/.test(t.slice(1));
  if (hasUpperAfterFirst || !/[a-z]/.test(t)) return t;
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "with"]);
  return t
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}'’.\-]+$/u;
export function isLatin(s: string): boolean {
  return LATIN.test(s);
}

/** Pick the most specific ISBN-13, falling back to ISBN-10. */
export function pickIsbn(isbns: string[]): string | undefined {
  const clean = isbns.map((i) => i.replace(/[^0-9Xx]/g, ""));
  return clean.find((i) => i.length === 13 && i.startsWith("978")) ?? clean.find((i) => i.length === 13) ?? clean.find((i) => i.length === 10);
}

/** Strip markdown links, source footnotes and excessive whitespace from descriptions. */
export function cleanDescription(text: string | undefined): string | undefined {
  if (!text) return undefined;
  let t = text
    .replace(/\r/g, "")
    .split(/\n-{3,}\n|\n\*{3,}\n|\(\[source\]/i)[0]
    .replace(/^\s*\[[^\]]{0,240}\]\s*/, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\)?\s>\s/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\d+\]:\s*\S+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length < 40) return undefined;
  // The UI is English; skip descriptions written mostly in another script.
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  const latin = t.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (letters > 0 && latin / letters < 0.6) return undefined;
  if (t.length > 2400) t = t.slice(0, 2400).replace(/\s+\S*$/, "") + "…";
  return t;
}

/** First one or two sentences, for compact cards. */
export function shortDescription(text: string | undefined, maxChars = 210): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, " ").trim();
  const sentences = flat.match(/[^.!?]+[.!?]+["”’)]?/g) ?? [flat];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > maxChars && out) break;
    out += s;
  }
  out = out.trim() || flat;
  if (out.length > maxChars) out = out.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
  return out;
}
