"use client";

import { useMemo, useState } from "react";

import type {
  ClinicalDiagnosis,
  DiagnosisStatus,
  DiagnosticSearchResult,
} from "@/lib/diagnosis-engine/types";

function ordered(items: ClinicalDiagnosis[]) {
  return [...items].sort((a, b) =>
    a.priority === b.priority ? 0 : a.priority === "primary" ? -1 : 1,
  );
}

export function useClinicalDiagnoses(initial: ClinicalDiagnosis[]) {
  const [diagnoses, setDiagnoses] = useState(() => ordered(initial));

  function add(result: DiagnosticSearchResult) {
    const duplicate = diagnoses.some(
      (item) =>
        item.classificationSystem === result.classificationSystem &&
        item.code.toLocaleLowerCase() === result.code.toLocaleLowerCase(),
    );
    if (duplicate) return false;
    const now = new Date().toISOString();
    setDiagnoses((current) =>
      ordered([
        ...current,
        {
          ...result,
          id: crypto.randomUUID(),
          priority: current.length ? "secondary" : "primary",
          status: "hypothesis",
          observation: null,
          origin: "professional",
          createdAt: now,
          updatedAt: now,
          createdBy: null,
        },
      ]),
    );
    return true;
  }

  function patch(id: string, change: Partial<ClinicalDiagnosis>) {
    setDiagnoses((current) =>
      ordered(
        current.map((item) =>
          item.id === id
            ? { ...item, ...change, updatedAt: new Date().toISOString() }
            : item,
        ),
      ),
    );
  }

  function makePrimary(id: string) {
    setDiagnoses((current) =>
      ordered(
        current.map((item) => ({
          ...item,
          priority: item.id === id ? "primary" : "secondary",
          updatedAt:
            item.id === id || item.priority === "primary"
              ? new Date().toISOString()
              : item.updatedAt,
        })),
      ),
    );
  }

  function setStatus(id: string, status: DiagnosisStatus) {
    patch(id, { status });
  }

  function setObservation(id: string, text: string) {
    patch(id, {
      observation: text.trim()
        ? { text, updatedAt: new Date().toISOString() }
        : null,
    });
  }

  function move(id: string, direction: -1 | 1) {
    setDiagnoses((current) => {
      const primary = current.find((item) => item.priority === "primary");
      const secondary = current.filter((item) => item.priority === "secondary");
      const index = secondary.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= secondary.length) return current;
      [secondary[index], secondary[target]] = [
        secondary[target],
        secondary[index],
      ];
      return primary ? [primary, ...secondary] : secondary;
    });
  }

  const preview = useMemo(
    () => ({
      primary: diagnoses.find((item) => item.priority === "primary") ?? null,
      secondary: diagnoses.filter((item) => item.priority === "secondary"),
    }),
    [diagnoses],
  );

  return {
    diagnoses,
    preview,
    add,
    makePrimary,
    setStatus,
    setObservation,
    remove: (id: string) =>
      setDiagnoses((current) => {
        const removed = current.find((item) => item.id === id);
        const remaining = current.filter((item) => item.id !== id);
        if (removed?.priority !== "primary" || !remaining.length)
          return remaining;
        return remaining.map((item, index) => ({
          ...item,
          priority: index === 0 ? "primary" : "secondary",
        }));
      }),
    move,
  };
}
