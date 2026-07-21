export interface ConsultationEvent { appointmentId: string; patientId: string; actorId: string; occurredAt: string; autosaveVersion?: number; }
export type ConsultationEventHandler = (event: ConsultationEvent) => void | Promise<void>;
export let onConsultationStarted: ConsultationEventHandler = async () => undefined;
export let onConsultationAutosaved: ConsultationEventHandler = async () => undefined;
export let onConsultationRecovered: ConsultationEventHandler = async () => undefined;
export let onConsultationClosed: ConsultationEventHandler = async () => undefined;
export let onConsultationFinalizationRequested: ConsultationEventHandler = async () => undefined;
export let onConsultationFinalized: ConsultationEventHandler = async () => undefined;
export let onConsultationFinalizationFailed: ConsultationEventHandler = async () => undefined;
export let onConsultationReopened: ConsultationEventHandler = async () => undefined;
export let onConsultationAddendumCreated: ConsultationEventHandler = async () => undefined;
export let onReturnScheduled: ConsultationEventHandler = async () => undefined;
export function configureConsultationEvents(handlers: Partial<{ onConsultationStarted: ConsultationEventHandler; onConsultationAutosaved: ConsultationEventHandler; onConsultationRecovered: ConsultationEventHandler; onConsultationClosed: ConsultationEventHandler; onConsultationFinalizationRequested: ConsultationEventHandler; onConsultationFinalized: ConsultationEventHandler; onConsultationFinalizationFailed: ConsultationEventHandler; onConsultationReopened: ConsultationEventHandler; onConsultationAddendumCreated: ConsultationEventHandler; onReturnScheduled: ConsultationEventHandler }>) {
  if (handlers.onConsultationStarted) onConsultationStarted = handlers.onConsultationStarted;
  if (handlers.onConsultationAutosaved) onConsultationAutosaved = handlers.onConsultationAutosaved;
  if (handlers.onConsultationRecovered) onConsultationRecovered = handlers.onConsultationRecovered;
  if (handlers.onConsultationClosed) onConsultationClosed = handlers.onConsultationClosed;
  if (handlers.onConsultationFinalizationRequested) onConsultationFinalizationRequested = handlers.onConsultationFinalizationRequested;
  if (handlers.onConsultationFinalized) onConsultationFinalized = handlers.onConsultationFinalized;
  if (handlers.onConsultationFinalizationFailed) onConsultationFinalizationFailed = handlers.onConsultationFinalizationFailed;
  if (handlers.onConsultationReopened) onConsultationReopened = handlers.onConsultationReopened;
  if (handlers.onConsultationAddendumCreated) onConsultationAddendumCreated = handlers.onConsultationAddendumCreated;
  if (handlers.onReturnScheduled) onReturnScheduled = handlers.onReturnScheduled;
}
