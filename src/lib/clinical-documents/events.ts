export interface ClinicalDocumentEvent { documentId: string; appointmentId: string; patientId: string; actorId: string; occurredAt: string; version?: number; }
export type ClinicalDocumentEventHandler = (event: ClinicalDocumentEvent) => void | Promise<void>;
export let onDocumentCreated: ClinicalDocumentEventHandler = async () => undefined;
export let onDocumentEdited: ClinicalDocumentEventHandler = async () => undefined;
export let onDocumentPrinted: ClinicalDocumentEventHandler = async () => undefined;
export let onDocumentSigned: ClinicalDocumentEventHandler = async () => undefined;
export function configureClinicalDocumentEvents(handlers: Partial<{ onDocumentCreated: ClinicalDocumentEventHandler; onDocumentEdited: ClinicalDocumentEventHandler; onDocumentPrinted: ClinicalDocumentEventHandler; onDocumentSigned: ClinicalDocumentEventHandler }>) {
  if (handlers.onDocumentCreated) onDocumentCreated = handlers.onDocumentCreated;
  if (handlers.onDocumentEdited) onDocumentEdited = handlers.onDocumentEdited;
  if (handlers.onDocumentPrinted) onDocumentPrinted = handlers.onDocumentPrinted;
  if (handlers.onDocumentSigned) onDocumentSigned = handlers.onDocumentSigned;
}
