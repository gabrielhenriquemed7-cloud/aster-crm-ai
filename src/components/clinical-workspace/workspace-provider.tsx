"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  WorkspaceClinicalState,
  WorkspaceContextValue,
  WorkspaceIdentity,
  WorkspaceMode,
} from "@/lib/clinical-workspace/types";
import type { ConsultationStep } from "@/components/medical-records/consultation-stepper";

const emptyClinicalState: WorkspaceClinicalState = {
  anamnesis: "",
  scores: "",
  physicalExam: "",
  diagnoses: "",
  conduct: "",
  prescription: "",
  documents: 0,
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  identity,
  children,
}: {
  identity: WorkspaceIdentity;
  children: React.ReactNode;
}) {
  const [activeSection, setActiveSection] =
    useState<ConsultationStep>("anamnesis");
  const [scrollPosition, setScrollPosition] = useState(0);
  const [clinicalState, setClinicalState] =
    useState<WorkspaceClinicalState>(emptyClinicalState);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("standard");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setScrollPosition(window.scrollY),
      );
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const updateClinicalState = useCallback(
    (state: Partial<WorkspaceClinicalState>) =>
      setClinicalState((current) => ({ ...current, ...state })),
    [],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      identity,
      activeSection,
      scrollPosition,
      consultationState: identity.appointmentStatus,
      clinicalState,
      timelineOpen,
      mode,
      setActiveSection,
      setTimelineOpen,
      updateClinicalState,
      setMode,
    }),
    [
      activeSection,
      clinicalState,
      identity,
      mode,
      scrollPosition,
      timelineOpen,
      updateClinicalState,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context)
    throw new Error("WorkspaceContext is unavailable outside its provider.");
  return context;
}
