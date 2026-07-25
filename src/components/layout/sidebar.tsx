"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, History, LayoutDashboard, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Nur bei exakter Pfadgleichheit aktiv – sonst wäre "/" immer aktiv. */
  exact?: boolean;
}

const NAVIGATION: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/discovery", label: "Discovery", icon: Compass },
  { href: "/research", label: "Recherche", icon: Search },
  { href: "/history", label: "Historie", icon: History },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Hauptnavigation">
      {NAVIGATION.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-muted hover:bg-bg-subtle hover:text-text",
            )}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3 py-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-text">
        <Sparkles size={15} strokeWidth={2.4} />
      </span>
      <span className="text-sm font-semibold tracking-tight text-text">BrandOS</span>
    </Link>
  );
}
