export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
export const SAFE_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;
export const ROTATE_AUDIO_SIZE_BYTES = 18 * 1024 * 1024;
export const SEGMENT_DURATION_SECONDS = 4 * 60;
export const MAX_SEGMENT_DURATION_SECONDS = 30 * 60;
export const nowMs = () => Date.now();

export type TranscriptionSegmentStatus =
  | "pending"
  | "uploading"
  | "transcribing"
  | "completed"
  | "failed"
  | "cancelled";

export type AudioSegment = {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  sizeBytes: number;
  mimeType: string;
  blob: Blob;
  status: TranscriptionSegmentStatus;
  retryCount: number;
  transcription: string;
  error: string;
};

export function joinSegmentTranscriptions(segments: Pick<AudioSegment, "index" | "transcription">[]) {
  return [...segments]
    .sort((a, b) => a.index - b.index)
    .map((segment) => segment.transcription.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function isTransientTranscriptionError(status: number, code?: string) {
  return (
    status === 408 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "TRANSCRIPTION_TIMEOUT" ||
    code === "TRANSCRIPTION_NETWORK_ERROR"
  );
}

export function retryDelayMs(retryCount: number) {
  return Math.min(8_000, 1_000 * 2 ** retryCount);
}
