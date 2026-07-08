import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a decimal hour value as HH:MM.
 * Handles negatives: -78.75 → "-78:45", 86.7 → "86:42", 7.95 → "07:57".
 */
export function formatHHMM(hours: number): string {
  if (!isFinite(hours)) return "00:00";
  const negative = hours < 0;
  const totalMin = Math.round(Math.abs(hours) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${negative ? "-" : ""}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Parses an "HH:MM" (or bare "HH") string into a decimal hour value.
 * Reverse of formatHHMM. Accepts an optional leading "-", 1-2 digit minutes
 * (e.g. "8:5" == "8:05"), and a bare integer (e.g. "8" == "8:00").
 * Returns null for empty or invalid input.
 */
export function parseHHMM(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = trimmed.match(/^(-)?(\d+)(?::(\d{1,2}))?$/);
  if (!match) return null;
  const sign = match[1] ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] != null ? Number(match[3]) : 0;
  if (minutes >= 60) return null;
  const decimal = sign * (hours + minutes / 60);
  return Math.round(decimal * 10000) / 10000;
}
