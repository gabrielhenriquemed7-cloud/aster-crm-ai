"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export const MEDICAL_RECORD_COPILOT_OUTLET_ID =
  "medical-record-copilot-outlet";

type MedicalRecordLayoutContextValue = {
  copilotOutlet: HTMLDivElement | null;
  copilotCollapsed: boolean;
  toggleCopilot: () => void;
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

export function MedicalRecordLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [copilotOutlet, setCopilotOutlet] = useState<HTMLDivElement | null>(null);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const registerCopilotOutlet = useCallback(
    (node: HTMLDivElement | null) => setCopilotOutlet(node),
    [],
  );
  const toggleCopilot = useCallback(
    () => setCopilotCollapsed((current) => !current),
    [],
  );

  return (
    <MedicalRecordLayoutContext.Provider
      value={{ copilotOutlet, copilotCollapsed, toggleCopilot }}
    >
      <section className="min-h-full min-w-0 overflow-x-hidden pb-12">
        <div
          className={`grid min-w-0 items-stretch gap-3 lg:gap-4 ${
            copilotCollapsed
              ? "lg:grid-cols-[minmax(0,1fr)_60px]"
              : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"
          }`}
        >
          <div className="min-w-0 overflow-x-hidden">
            {children}
          </div>
          <div
            ref={registerCopilotOutlet}
            id={MEDICAL_RECORD_COPILOT_OUTLET_ID}
            className="min-h-0 min-w-0 max-w-full self-stretch overflow-x-hidden lg:h-full lg:min-h-[calc(100dvh-8rem)]"
            aria-label="ASTER Copilot"
          />
        </div>
      </section>
    </MedicalRecordLayoutContext.Provider>
  );
}
