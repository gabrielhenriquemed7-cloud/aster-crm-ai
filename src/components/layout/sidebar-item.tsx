"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SidebarItemProps {
  collapsed?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
  onNavigate?: () => void;
}

export function SidebarItem({
  collapsed = false,
  href,
  icon: Icon,
  label,
  onNavigate,
}: SidebarItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white",
        collapsed && "justify-center px-0",
        isActive && "bg-white/15 text-white shadow-sm",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
    </Link>
  );
}
