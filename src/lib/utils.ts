import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Combine conditional class names and resolve Tailwind conflicts.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a price + currency for display, or return an em dash. */
export function formatPrice(
  price: number | string | null | undefined,
  currency = "EUR",
): string {
  if (price == null || price === "") return "—";
  const n = typeof price === "string" ? Number(price) : price;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Relative-ish date for logs / lists. */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
