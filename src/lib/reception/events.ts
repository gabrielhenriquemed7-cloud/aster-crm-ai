export interface ReceptionEvent {
  appointmentId: string;
  patientId: string;
  occurredAt: string;
  actorId: string;
}

export type ReceptionEventHandler = (event: ReceptionEvent) => void | Promise<void>;

// Pontos públicos de integração para Agenda, Fila, Prontuário e Dashboard.
export let onPatientCheckedIn: ReceptionEventHandler = async () => undefined;
export let onWaitingRoomEntered: ReceptionEventHandler = async () => undefined;
export let onAppointmentCalled: ReceptionEventHandler = async () => undefined;

export function configureReceptionEvents(handlers: Partial<{
  onPatientCheckedIn: ReceptionEventHandler;
  onWaitingRoomEntered: ReceptionEventHandler;
  onAppointmentCalled: ReceptionEventHandler;
}>) {
  if (handlers.onPatientCheckedIn) onPatientCheckedIn = handlers.onPatientCheckedIn;
  if (handlers.onWaitingRoomEntered) onWaitingRoomEntered = handlers.onWaitingRoomEntered;
  if (handlers.onAppointmentCalled) onAppointmentCalled = handlers.onAppointmentCalled;
}
