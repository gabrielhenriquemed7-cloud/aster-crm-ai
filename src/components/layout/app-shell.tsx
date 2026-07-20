"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { AppFooter } from "@/components/layout/app-footer";
import { PageViewport } from "@/components/layout/page-viewport";
import { TopNavbar } from "@/components/layout/top-navbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarMode, setSidebarMode] = useState<
    "expanded" | "compact" | "icons"
  >("compact");
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("aster:sidebar-mode");
    if (stored === "expanded" || stored === "compact" || stored === "icons") {
      // Restore the user's shell preference after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarMode(stored);
    }
    const handleFocusMode = (event: Event) =>
      setFocusMode((event as CustomEvent<boolean>).detail);
    window.addEventListener("aster:focus-mode", handleFocusMode);
    return () =>
      window.removeEventListener("aster:focus-mode", handleFocusMode);
  }, []);

  function changeSidebarMode(mode: "expanded" | "compact" | "icons") {
    setSidebarMode(mode);
    window.localStorage.setItem("aster:sidebar-mode", mode);
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      {!focusMode && (
        <Sidebar
          mode={sidebarMode}
          desktopOnly
          onModeChange={changeSidebarMode}
        />
      )}
      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-200 ease-out",
          !focusMode && sidebarMode === "expanded" && "lg:pl-64",
          !focusMode && sidebarMode === "compact" && "lg:pl-56",
          !focusMode && sidebarMode === "icons" && "lg:pl-16",
        )}
      >
        {!focusMode && <TopNavbar />}
        <PageViewport>{children}</PageViewport>
        {!focusMode && <AppFooter />}
      </div>
    </div>
  );
}
