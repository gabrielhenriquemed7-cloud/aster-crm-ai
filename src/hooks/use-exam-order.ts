"use client";

import { useMemo, useState } from "react";

import {
  ExamOrderGenerator,
  type ExamOrderDocumentIdentity,
} from "@/lib/clinical-plan/exam-order-generator";
import type { ExamOrder } from "@/lib/clinical-plan/types";

export function useExamOrder({
  items,
  onItemsChange,
  identity,
}: {
  items: ExamOrder[];
  onItemsChange: (items: ExamOrder[]) => void;
  identity: ExamOrderDocumentIdentity;
}) {
  const [generalClinicalIndication, setGeneralClinicalIndication] =
    useState("");
  const [generalDiagnosisRef, setGeneralDiagnosisRef] = useState("");
  const [generalGuidance, setGeneralGuidance] = useState("");

  const preview = useMemo(
    () =>
      ExamOrderGenerator.generate({
        items,
        generalClinicalIndication,
        generalDiagnosisRef,
        generalGuidance,
        identity,
      }),
    [
      generalClinicalIndication,
      generalDiagnosisRef,
      generalGuidance,
      identity,
      items,
    ],
  );

  function add(item: ExamOrder) {
    if (
      items.some(
        (entry) =>
          entry.name.trim().toLocaleLowerCase("pt-BR") ===
          item.name.trim().toLocaleLowerCase("pt-BR"),
      )
    )
      return false;
    onItemsChange([...items, item]);
    return true;
  }

  function update(item: ExamOrder) {
    onItemsChange(items.map((entry) => (entry.id === item.id ? item : entry)));
  }

  function move(id: string, direction: -1 | 1) {
    const next = [...items];
    const index = next.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onItemsChange(next);
  }

  return {
    items,
    preview,
    generalClinicalIndication,
    generalDiagnosisRef,
    generalGuidance,
    setGeneralClinicalIndication,
    setGeneralDiagnosisRef,
    setGeneralGuidance,
    add,
    update,
    remove: (id: string) =>
      onItemsChange(items.filter((item) => item.id !== id)),
    duplicate: (id: string) => {
      const source = items.find((item) => item.id === id);
      if (!source) return;
      onItemsChange([
        ...items,
        {
          ...source,
          id: crypto.randomUUID(),
          name: `${source.name} (cópia)`,
          expectedDate: "",
          status: "draft",
        },
      ]);
    },
    move,
  };
}
