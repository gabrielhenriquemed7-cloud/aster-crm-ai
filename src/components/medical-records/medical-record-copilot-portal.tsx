"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useMedicalRecordCopilotOutlet } from "@/components/medical-records/medical-record-layout";

export function MedicalRecordCopilotPortal({
  children,
}: {
  children: ReactNode;
}) {
  const outlet = useMedicalRecordCopilotOutlet();

  return outlet ? createPortal(children, outlet) : null;
}
