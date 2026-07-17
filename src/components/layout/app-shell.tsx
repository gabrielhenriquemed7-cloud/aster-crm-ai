"use client";

import { useState, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { AppFooter } from "@/components/layout/app-footer";
import { PageViewport } from "@/components/layout/page-viewport";
import { TopNavbar } from "@/components/layout/top-navbar";
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
          "flex min-h-dvh flex-col transition-[padding] duration-200 ease-out lg:pl-64",
          isSidebarCollapsed && "lg:pl-20",
        )}
      >
        <TopNavbar />
        <PageViewport>{children}</PageViewport>
        <AppFooter />
      </div>
    </div>
  );
}
