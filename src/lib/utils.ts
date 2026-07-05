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
