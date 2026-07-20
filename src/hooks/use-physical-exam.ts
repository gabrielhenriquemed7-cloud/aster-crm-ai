"use client";

import { useMemo, useState } from "react";

import { ExamGenerator } from "@/lib/physical-exam/exam-generator";
import {
  emptyPhysicalExamSystems,
  parseVitalSigns,
  serializeVitalSigns,
} from "@/lib/physical-exam/service";
import type {
  ExamTemplate,
  PhysicalExamStatus,
  PhysicalExamSystemId,
  VitalSignKey,
} from "@/lib/physical-exam/types";

export function usePhysicalExam(
  template: ExamTemplate,
  initialVitalSigns: string,
) {
  const [vitals, setVitals] = useState(() =>
    parseVitalSigns(template, initialVitalSigns),
  );
  const [systems, setSystems] = useState(() =>
    emptyPhysicalExamSystems(template),
  );
  const [observations, setObservations] = useState("");
  const generator = useMemo(() => new ExamGenerator(template), [template]);

  const preview = useMemo(
    () => generator.generate(systems, observations),
    [generator, observations, systems],
  );

  function updateVital(key: VitalSignKey, value: string) {
    const next = { ...vitals, [key]: value };
    setVitals(next);
    return serializeVitalSigns(template, next);
  }

  function updateSystem(id: PhysicalExamSystemId, status: PhysicalExamStatus) {
    setSystems((current) => ({
      ...current,
      [id]: {
        status,
        description: status === "altered" ? current[id].description : "",
      },
    }));
  }

  function updateDescription(id: PhysicalExamSystemId, description: string) {
    setSystems((current) => ({
      ...current,
      [id]: { status: "altered", description },
    }));
  }

  return {
    observations,
    preview,
    systems,
    vitals,
    setObservations,
    updateDescription,
    updateSystem,
    updateVital,
  };
}
