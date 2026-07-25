import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Klassen zusammenführen – spätere Utilities gewinnen bei Konflikten. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
