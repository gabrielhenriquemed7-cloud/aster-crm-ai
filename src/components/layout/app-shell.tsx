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
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
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
        <main className="box-border w-full max-w-none overflow-x-hidden px-4 py-6 sm:px-5 lg:px-4 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
