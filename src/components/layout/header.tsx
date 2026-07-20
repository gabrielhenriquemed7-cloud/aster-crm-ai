"use client";

import { Moon, Plus, Search, Settings, Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Notifications } from "@/components/layout/notifications";
import { ClinicSwitcher } from "@/components/clinics/clinic-switcher";
import { SearchBar } from "@/components/layout/search-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export function Header() {
  const pathname = usePathname();
  const isClinicalWorkspace =
    /^\/consultas\/[^/]+\/prontuario(?:\/|$)/.test(pathname);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    // The browser theme is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1920px] items-center gap-3 px-3 sm:px-4 lg:px-5">
        <Sidebar mobileOnly />
        {isClinicalWorkspace ? (
          <Link
            href="/dashboard"
            className="hidden shrink-0 items-center gap-2 text-sm font-semibold tracking-tight sm:flex lg:hidden"
            aria-label="ASTER"
          >
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            ASTER
          </Link>
        ) : (
          <div className="hidden sm:block">
            <ClinicSwitcher />
          </div>
        )}
        <SearchBar />
        <div className="ml-auto flex items-center gap-2">
          {!isClinicalWorkspace && (
            <Button
              render={<Link href="/patients/new" />}
              nativeButton={false}
              className="hidden cursor-pointer md:inline-flex"
              size="sm"
              variant="secondary"
              aria-label="Novo paciente"
            >
              <Plus className="size-4" aria-hidden="true" />
              Novo paciente
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Buscar"
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
          {isClinicalWorkspace ? (
            <Button
              render={<Link href="/configuracoes/clinica" />}
              nativeButton={false}
              variant="ghost"
              size="icon"
              aria-label="Configurações"
            >
              <Settings className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {isDark ? (
                <Sun className="size-4" aria-hidden="true" />
              ) : (
                <Moon className="size-4" aria-hidden="true" />
              )}
            </Button>
          )}
          <Notifications />
          <UserMenu />
        </div>
      </div>
      {!isClinicalWorkspace && <Breadcrumbs />}
    </header>
  );
}
