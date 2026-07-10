"use client";

import { useState, type ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Sidebar
        collapsed={isSidebarCollapsed}
        desktopOnly
        onCollapsedChange={setIsSidebarCollapsed}
      />
      <div
        className={cn(
          "min-h-dvh transition-[padding] duration-200 lg:pl-64",
          isSidebarCollapsed && "lg:pl-20",
        )}
      >
        <Header />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
