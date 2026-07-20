"use client";

import { useCallback, useState } from "react";

export function useMedicalRecordCenter(appointmentId: string) {
  const [downloading, setDownloading] = useState(false);

  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/medical-records/${appointmentId}/pdf`);
      if (!response.ok) throw new Error("Não foi possível gerar o PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `prontuario-${appointmentId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [appointmentId]);

  return { downloadPdf, downloading };
}
