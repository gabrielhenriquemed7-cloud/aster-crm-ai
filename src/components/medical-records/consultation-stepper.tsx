"use client";

import { useEffect } from "react";

import { useWorkspaceContext } from "@/components/clinical-workspace/workspace-provider";
import { workspaceSections } from "@/lib/clinical-workspace/section-registry";

export type ConsultationStep =
  | "anamnesis"
  | "scores"
  | "physical_exam"
  | "assessment"
  | "plan"
  | "prescription"
  | "record";

export function ConsultationStepper({
  completed,
  focusMode = false,
}: {
  completed: Partial<Record<ConsultationStep, boolean>>;
  focusMode?: boolean;
}) {
  const { activeSection, setActiveSection } = useWorkspaceContext();
  useEffect(() => {
    const elements = workspaceSections
      .map((step) => ({
        step: step.id,
        element: document.querySelector(step.selector),
      }))
      .filter((item): item is { step: ConsultationStep; element: Element } =>
        Boolean(item.element),
      );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const step = elements.find(
          (item) => item.element === visible[0]?.target,
        )?.step;
        if (step) setActiveSection(step);
      },
      { rootMargin: "-18% 0px -65% 0px", threshold: 0 },
    );
    elements.forEach((item) => observer.observe(item.element));
    return () => observer.disconnect();
  }, [setActiveSection]);

  function navigate(step: (typeof workspaceSections)[number]) {
    const target = document.querySelector<HTMLDetailsElement>(step.selector);
    if (!target) return;
    if (target.tagName === "DETAILS") target.open = true;
    setActiveSection(step.id);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      aria-label="Etapas da consulta"
      className={`sticky z-30 overflow-x-auto border-b bg-background/95 backdrop-blur ${
        focusMode ? "top-11" : "top-[100px]"
      }`}
    >
      <ol className="flex min-w-max items-center gap-4 px-1">
        {workspaceSections.map((step) => {
          const current = activeSection === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                aria-label={`${step.label}${completed[step.id] ? ", preenchida" : ""}`}
                onClick={() => navigate(step)}
                className={`relative flex h-9 items-center px-0.5 text-[11px] font-semibold tracking-wide uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  current
                    ? "text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {step.shortLabel}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const WorkspaceStepper = ConsultationStepper;
