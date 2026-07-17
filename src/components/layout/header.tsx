"use client";

import { Moon, Plus, Search, Sun } from "lucide-react";
import Link from "next/link";
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
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Sidebar mobileOnly />
        <div className="hidden sm:block"><ClinicSwitcher /></div>
        <SearchBar />
        <div className="ml-auto flex items-center gap-2">
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
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Buscar"
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
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
          <Notifications />
          <UserMenu />
        </div>
      </div>
      <Breadcrumbs />
    </header>
  );
}
