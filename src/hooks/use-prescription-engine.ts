"use client";

import { useMemo, useState } from "react";

import { PrescriptionFactory } from "@/lib/prescription-engine/prescription-factory";
import { PrescriptionGenerator } from "@/lib/prescription-engine/prescription-generator";
import { emptyPrescriptionTemplate } from "@/lib/prescription-engine/templates";
import type {
  PrescriptionDocument,
  PrescriptionMedication,
  PrescriptionTemplate,
} from "@/lib/prescription-engine/types";

type PrescriptionIdentity = Omit<
  PrescriptionDocument,
  "id" | "status" | "type" | "medications" | "orientations" | "observations"
>;

export function usePrescriptionEngine(identity: PrescriptionIdentity) {
  const [document, setDocument] = useState(() =>
    PrescriptionFactory.fromTemplate(emptyPrescriptionTemplate, identity),
  );

  const preview = useMemo(
    () => PrescriptionGenerator.generate(document),
    [document],
  );

  function applyTemplate(template: PrescriptionTemplate) {
    setDocument(PrescriptionFactory.fromTemplate(template, identity));
  }

  function appendTemplate(template: PrescriptionTemplate) {
    setDocument((current) => ({
      ...current,
      medications: [
        ...current.medications,
        ...template.medications.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      ],
      orientations: [current.orientations, template.orientations]
        .filter(Boolean)
        .join("\n"),
      observations: [current.observations, template.observations]
        .filter(Boolean)
        .join("\n"),
    }));
  }

  function addMedication(medication: PrescriptionMedication) {
    setDocument((current) => ({
      ...current,
      medications: [...current.medications, medication],
    }));
  }

  function updateMedication(medication: PrescriptionMedication) {
    setDocument((current) => ({
      ...current,
      medications: current.medications.map((item) =>
        item.id === medication.id ? medication : item,
      ),
    }));
  }

  function removeMedication(id: string) {
    setDocument((current) => ({
      ...current,
      medications: current.medications.filter((item) => item.id !== id),
    }));
  }

  function duplicateMedication(id: string) {
    setDocument((current) => {
      const source = current.medications.find((item) => item.id === id);
      if (!source) return current;
      const index = current.medications.findIndex((item) => item.id === id);
      const copy = { ...source, id: crypto.randomUUID() };
      return {
        ...current,
        medications: [
          ...current.medications.slice(0, index + 1),
          copy,
          ...current.medications.slice(index + 1),
        ],
      };
    });
  }

  function moveMedication(id: string, direction: -1 | 1) {
    setDocument((current) => {
      const index = current.medications.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.medications.length)
        return current;
      const medications = [...current.medications];
      [medications[index], medications[target]] = [
        medications[target],
        medications[index],
      ];
      return { ...current, medications };
    });
  }

  return {
    document,
    preview,
    applyTemplate,
    appendTemplate,
    addMedication,
    updateMedication,
    removeMedication,
    duplicateMedication,
    moveMedication,
    setOrientations: (orientations: string) =>
      setDocument((current) => ({ ...current, orientations })),
    setObservations: (observations: string) =>
      setDocument((current) => ({ ...current, observations })),
  };
}
