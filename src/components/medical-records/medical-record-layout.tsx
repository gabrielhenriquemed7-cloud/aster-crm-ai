"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const MEDICAL_RECORD_COPILOT_OUTLET_ID = "medical-record-copilot-outlet";

type MedicalRecordLayoutContextValue = {
  copilotOutlet: HTMLDivElement | null;
  copilotCollapsed: boolean;
  copilotWidth: number;
  focusMode: boolean;
  toggleCopilot: () => void;
  toggleFocusMode: () => void;
};

const MedicalRecordLayoutContext =
  createContext<MedicalRecordLayoutContextValue | null>(null);

export function useMedicalRecordCopilotOutlet() {
  return useContext(MedicalRecordLayoutContext)?.copilotOutlet ?? null;
}

export function useMedicalRecordLayout() {
  const context = useContext(MedicalRecordLayoutContext);
  if (!context) throw new Error("MedicalRecordLayout context is unavailable.");
  return context;
}

export function MedicalRecordLayout({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [copilotOutlet, setCopilotOutlet] = useState<HTMLDivElement | null>(
    null,
  );
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const [copilotWidth, setCopilotWidth] = useState(30);
  const [focusMode, setFocusMode] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("aster:copilot-width"));
    if (stored >= 20 && stored <= 40) {
      // Restore the clinician's workspace preference after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCopilotWidth(stored);
    }
  }, []);

  const registerCopilotOutlet = useCallback(
    (node: HTMLDivElement | null) => setCopilotOutlet(node),
    [],
  );
  const toggleCopilot = useCallback(
    () => setCopilotCollapsed((current) => !current),
    [],
  );
  const toggleFocusMode = useCallback(() => {
    setFocusMode((current) => {
      const next = !current;
      window.dispatchEvent(
        new CustomEvent("aster:focus-mode", { detail: next }),
      );
      return next;
    });
  }, []);

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    setIsResizing(true);
    const handleMove = (moveEvent: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const next = ((bounds.right - moveEvent.clientX) / bounds.width) * 100;
      setCopilotWidth(Math.min(40, Math.max(20, Math.round(next))));
    };
    const handleUp = () => {
      setIsResizing(false);
      setCopilotWidth((current) => {
        window.localStorage.setItem("aster:copilot-width", String(current));
        return current;
      });
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, []);

  return (
    <MedicalRecordLayoutContext.Provider
      value={{
        copilotOutlet,
        copilotCollapsed,
        copilotWidth,
        focusMode,
        toggleCopilot,
        toggleFocusMode,
      }}
    >
      <section className="min-h-full min-w-0 overflow-x-hidden">
        <div
          ref={containerRef}
          className={`clinical-resizable-grid relative grid min-w-0 items-stretch gap-2 lg:gap-2.5 ${
            isResizing ? "cursor-col-resize select-none" : "transition-[grid-template-columns] duration-200"
          } ${focusMode ? "clinical-resizable-grid--focus" : ""}`}
          style={{
            "--clinical-record-track": copilotCollapsed
              ? "minmax(0, 1fr)"
              : `minmax(0, ${100 - copilotWidth}fr)`,
            "--clinical-ai-track": copilotCollapsed
              ? "60px"
              : `minmax(300px, ${copilotWidth}fr)`,
          } as React.CSSProperties}
        >
          <div className="min-w-0 overflow-x-hidden">{children}</div>
          {!focusMode && !copilotCollapsed && (
            <button
              type="button"
              aria-label="Redimensionar painel ASTER AI"
              title="Arraste para redimensionar o ASTER AI"
              onPointerDown={startResize}
              className="absolute top-0 bottom-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none place-items-center lg:grid"
              style={{ left: `${100 - copilotWidth}%` }}
            >
              <span className="h-14 w-0.5 rounded-full bg-border transition-colors hover:bg-primary" />
            </button>
          )}
          <div
            ref={registerCopilotOutlet}
            id={MEDICAL_RECORD_COPILOT_OUTLET_ID}
            className={`min-h-0 min-w-0 max-w-full self-stretch overflow-x-hidden lg:h-full lg:min-h-[calc(100dvh-8rem)] ${
              focusMode ? "hidden" : ""
            }`}
            aria-label="ASTER AI"
          />
        </div>
      </section>
    </MedicalRecordLayoutContext.Provider>
  );
}
