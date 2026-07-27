import { CURRENCY_SYMBOL } from "./constants";

/** Format a number as GBP currency, e.g. 53 -> "£53.00". */
export function money(value: number | null | undefined): string {
  const n = typeof value === "number" ? value : 0;
  return `${CURRENCY_SYMBOL}${n.toFixed(2)}`;
}

/** Short "time ago" label, e.g. "3m ago". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Format a clock time, e.g. "14:05". */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format a date + time, e.g. "23 Jul, 14:05". Use for historical timestamps. */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Loose phone check: 7–15 digits, optional leading "+". Rejects letters/junk. */
export function isValidPhone(v: string | null | undefined): boolean {
  if (!v) return false;
  const trimmed = v.trim();
  if (/[a-z]/i.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Normalise a phone number to a bare international form for wa.me links
 * (digits only, no "+"). A leading national "0" is replaced with the country
 * code (default UK "44"); a "00" international prefix is stripped.
 */
export function normalizeWhatsapp(v: string | null | undefined, cc = "44"): string {
  let d = (v ?? "").trim();
  const hadPlus = d.startsWith("+");
  d = d.replace(/\D/g, "");
  if (!d) return "";
  if (hadPlus) return d;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return cc + d.slice(1);
  return d;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
