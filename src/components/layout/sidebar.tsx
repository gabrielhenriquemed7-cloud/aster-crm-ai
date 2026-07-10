"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  Settings,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { SidebarItem } from "@/components/layout/sidebar-item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

interface SidebarProps {
  collapsed?: boolean;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navigationItems: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pacientes", label: "Pacientes", icon: UsersRound },
  { href: "/consultas", label: "Consultas", icon: ClipboardList },
  { href: "/ia-clinica", label: "IA Clínica", icon: Bot },
  { href: "/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart2 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5", collapsed && "justify-center")}
      aria-label="ASTER CRM AI"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white text-[#0b1f3a] shadow-sm">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "text-sm font-semibold tracking-[-0.02em] text-white",
          collapsed && "sr-only",
        )}
      >
        ASTER
      </span>
    </Link>
  );
}

interface SidebarContentProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
}

function SidebarContent({
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col bg-[#0b1f3a] p-3 text-white">
      <div
        className={cn(
          "flex h-11 items-center px-2",
          collapsed && "justify-center px-0",
        )}
      >
        <Brand collapsed={collapsed} />
      </div>
      <div className={cn("mt-5 px-1", collapsed && "hidden")}>
        <Button
          variant="outline"
          className="w-full justify-between border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
          aria-label="Selecionar clínica"
        >
          <span className="truncate text-sm">Clínica Aster</span>
          <ChevronDown className="size-4 text-blue-100/70" aria-hidden="true" />
        </Button>
      </div>
      <nav
        className="mt-6 flex-1 space-y-1 overflow-y-auto px-1"
        aria-label="Navegação principal"
      >
        {navigationItems.map((item) => (
          <SidebarItem
            key={item.href}
            collapsed={collapsed}
            onNavigate={onNavigate}
            {...item}
          />
        ))}
      </nav>
      <div
        className={cn(
          "mt-4",
          collapsed
            ? "flex justify-center"
            : "rounded-lg border border-white/10 bg-white/5 p-3",
        )}
      >
        {collapsed ? (
          <Link
            href="mailto:suporte@astercrm.ai"
            className="grid size-8 place-items-center rounded-lg text-xs font-semibold text-blue-100 hover:bg-white/10 hover:text-white"
            aria-label="Entrar em contato com o suporte"
          >
            ?
          </Link>
        ) : (
          <>
            <p className="text-xs font-medium">Precisa de ajuda?</p>
            <p className="mt-1 text-xs leading-5 text-blue-100/70">
              Fale com nosso time de suporte.
            </p>
            <Link
              href="mailto:suporte@astercrm.ai"
              className="mt-3 inline-flex text-xs font-medium text-white hover:underline"
            >
              Abrir central de ajuda
            </Link>
          </>
        )}
      </div>
      {onCollapsedChange && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCollapsedChange(!collapsed)}
          className={cn(
            "mt-3 text-blue-100 hover:bg-white/10 hover:text-white",
            collapsed ? "mx-auto size-8 p-0" : "w-full justify-start",
          )}
          aria-label={
            collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
          }
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Recolher menu
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed = false,
  desktopOnly = false,
  mobileOnly = false,
  onCollapsedChange,
}: SidebarProps) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  return (
    <>
      {!mobileOnly && (
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 transition-[width] duration-200 lg:block",
            collapsed ? "w-20" : "w-64",
          )}
        >
          <SidebarContent
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
          />
        </aside>
      )}
      {!desktopOnly && (
        <Dialog
          open={isMobileNavigationOpen}
          onOpenChange={setIsMobileNavigationOpen}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir navegação"
            >
              <span className="relative block size-4 before:absolute before:inset-x-0 before:top-1 before:h-px before:bg-current after:absolute after:inset-x-0 after:bottom-1 after:h-px after:bg-current" />
            </Button>
          </DialogTrigger>
          <DialogContent
            className="left-0 h-dvh max-w-[18rem] translate-x-0 translate-y-[-50%] rounded-none border-y-0 border-l-0 p-0 sm:max-w-[18rem]"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Navegação</DialogTitle>
            <SidebarContent
              onNavigate={() => setIsMobileNavigationOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
