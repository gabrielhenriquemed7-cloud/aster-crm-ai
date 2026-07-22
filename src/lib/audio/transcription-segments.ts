export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
export const SAFE_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;
export const ROTATE_AUDIO_SIZE_BYTES = 18 * 1024 * 1024;
export const SEGMENT_DURATION_SECONDS = 4 * 60;
export const MAX_SEGMENT_DURATION_SECONDS = 30 * 60;
export const nowMs = () => Date.now();
export const MIN_AUDIO_SEGMENT_BYTES = 256;

export const RECORDER_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/m4a",
] as const;

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
};

export function normalizeAudioMimeType(mimeType: string) {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function audioExtensionForMimeType(mimeType: string) {
  return AUDIO_EXTENSIONS[normalizeAudioMimeType(mimeType)] ?? null;
}

export function selectSupportedRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
) {
  return RECORDER_MIME_TYPES.find(isTypeSupported) ?? "";
}

export function validateAudioSegment(
  segment: Pick<AudioSegment, "sizeBytes" | "durationSeconds" | "mimeType">,
  isFinalSegment = false,
) {
  if (segment.sizeBytes === 0) return "EMPTY_SEGMENT";
  if (!Number.isFinite(segment.durationSeconds) || segment.durationSeconds <= 0)
    return "INVALID_AUDIO_SEGMENT";
  if (!audioExtensionForMimeType(segment.mimeType))
    return "UNSUPPORTED_AUDIO_FORMAT";
  if (!isFinalSegment && segment.sizeBytes < MIN_AUDIO_SEGMENT_BYTES)
    return "INVALID_AUDIO_SEGMENT";
  if (segment.sizeBytes > SAFE_AUDIO_SIZE_BYTES) return "SEGMENT_TOO_LARGE";
  return null;
}

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

export function joinSegmentTranscriptions(
  segments: Pick<AudioSegment, "index" | "transcription">[],
) {
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
    code === "TIMEOUT" ||
    code === "NETWORK_ERROR" ||
    code === "RATE_LIMITED" ||
    code === "PROVIDER_UNAVAILABLE"
  );
}

export function retryDelayMs(retryCount: number) {
  return retryCount <= 0 ? 1_000 : 3_000;
}
