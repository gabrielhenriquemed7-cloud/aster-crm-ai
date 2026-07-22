"use client";

import {
  AlertTriangle,
  AudioLines,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { recordTranscriptionEvent } from "@/app/(dashboard)/consultas/transcription-actions";
import { Button } from "@/components/ui/button";
import {
  type AudioSegment,
  isTransientTranscriptionError,
  joinSegmentTranscriptions,
  MAX_AUDIO_SIZE_BYTES,
  nowMs,
  retryDelayMs,
  ROTATE_AUDIO_SIZE_BYTES,
  SAFE_AUDIO_SIZE_BYTES,
  SEGMENT_DURATION_SECONDS,
} from "@/lib/audio/transcription-segments";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RecorderState =
  "idle" | "testing" | "recording" | "paused" | "finalizing" | "transcribing";
type InsertMode = "append" | "replace";
type CaptureSummary = {
  blob: Blob;
  segments: AudioSegment[];
  duration: number;
  chunks: number;
  size: number;
  mimeType: string;
  incomplete: boolean;
};

const MAX_DURATION_SECONDS = 30 * 60;
const TIMESLICE_MS = 1000;
const HEARTBEAT_MS = 5000;
const STALLED_AFTER_MS = 8000;
const LOW_LEVEL_THRESHOLD = 0.012;
const SIGNAL_THRESHOLD = 0.004;
const LOW_LEVEL_AFTER_MS = 10_000;
const SILENCE_AFTER_MS = 30_000;

const errorMessages: Record<string, string> = {
  MICROPHONE_PERMISSION_DENIED:
    "Permissão para usar o microfone não concedida.",
  MICROPHONE_NOT_FOUND: "Nenhum microfone foi encontrado.",
  RECORDING_NOT_STARTED: "A gravação não foi iniciada corretamente.",
  AUDIO_STREAM_ENDED:
    "O microfone foi desconectado ou a captura foi interrompida.",
  NO_AUDIO_DATA: "Nenhum dado de áudio foi recebido.",
  AUDIO_LEVEL_TOO_LOW: "O volume captado está muito baixo.",
  RECORDING_STALLED: "A gravação parou de receber áudio.",
  AUDIO_CONTEXT_SUSPENDED:
    "O monitoramento de áudio foi suspenso pelo navegador.",
  INCOMPLETE_RECORDING: "A gravação pode estar incompleta.",
  AUDIO_TOO_LARGE:
    "Este segmento excede o limite seguro de 20 MB. O áudio foi preservado.",
  TRANSCRIPTION_AUTH_ERROR:
    "Não foi possível autenticar o serviço de transcrição.",
  TRANSCRIPTION_QUOTA_ERROR: "O limite do serviço de transcrição foi atingido.",
  TRANSCRIPTION_INVALID_AUDIO: "O formato do áudio não pôde ser processado.",
  TRANSCRIPTION_TIMEOUT:
    "A transcrição demorou mais que o esperado. Tente novamente.",
  TRANSCRIPTION_FAILED:
    "O áudio foi captado, mas não foi possível transcrevê-lo.",
  TRANSCRIPTION_ERROR: "Não foi possível transcrever a gravação.",
};

function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? ""
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ClinicalAudioRecorder({
  appointmentId,
  currentText,
  disabled,
  onApply,
  onTranscriptionComplete,
}: {
  appointmentId: string;
  currentText: string;
  disabled: boolean;
  onApply: (text: string, mode: InsertMode) => void;
  onTranscriptionComplete?: (text: string) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [confirmingConsent, setConfirmingConsent] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [insertMode, setInsertMode] = useState<InsertMode>("append");
  const [summary, setSummary] = useState<CaptureSummary | null>(null);
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [microphoneName, setMicrophoneName] = useState("");
  const [level, setLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [capturedBytes, setCapturedBytes] = useState(0);
  const [trackStatus, setTrackStatus] = useState("inactive");
  const [stalled, setStalled] = useState(false);
  const levelRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const totalChunkCountRef = useRef(0);
  const segmentBytesRef = useRef(0);
  const completedSegmentsRef = useRef<AudioSegment[]>([]);
  const segmentStartedAtRef = useRef(0);
  const rotateTimerRef = useRef<number | null>(null);
  const rotatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadInProgressRef = useRef(false);
  const stopActionRef = useRef<"finish" | "cancel" | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastChunkAtRef = useRef(0);
  const lastLevelAtRef = useRef(0);
  const lowSinceRef = useRef<number | null>(null);
  const silentSinceRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const hadLiveTrackRef = useRef(false);

  const stopMonitor = useCallback(() => {
    if (animationRef.current !== null)
      cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const cleanup = useCallback(() => {
    stopMonitor();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    if (rotateTimerRef.current !== null) window.clearTimeout(rotateTimerRef.current);
    rotateTimerRef.current = null;
    setTrackStatus("inactive");
    setLevel(0);
  }, [stopMonitor]);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(
      () => setSeconds((value) => Math.min(value + 1, MAX_DURATION_SECONDS)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "recording" && state !== "paused" && state !== "transcribing") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const validate = () => {
      if (document.visibilityState !== "visible") return;
      const recorder = recorderRef.current;
      const track = trackRef.current;
      const context = audioContextRef.current;
      if (
        !recorder ||
        recorder.state === "inactive" ||
        track?.readyState !== "live"
      ) {
        setStalled(true);
        setWarning("ATENÇÃO: a gravação pode ter sido interrompida.");
      } else if (context?.state === "suspended" && state === "recording") {
        setWarning(
          `AUDIO_CONTEXT_SUSPENDED: ${errorMessages.AUDIO_CONTEXT_SUSPENDED}`,
        );
        void context.resume();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", validate);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", validate);
    };
  }, [state]);

  useEffect(() => {
    if (state !== "recording") return;
    const heartbeat = window.setInterval(() => {
      const recorder = recorderRef.current;
      const track = trackRef.current;
      const chunkLate = Date.now() - lastChunkAtRef.current > STALLED_AFTER_MS;
      const levelLate = Date.now() - lastLevelAtRef.current > HEARTBEAT_MS * 2;
      const invalid =
        recorder?.state !== "recording" ||
        track?.readyState !== "live" ||
        !track.enabled ||
        chunkLate ||
        levelLate;
      if (invalid) {
        setStalled(true);
        setWarning("ATENÇÃO: a gravação pode ter sido interrompida.");
      }
    }, HEARTBEAT_MS);
    return () => window.clearInterval(heartbeat);
  }, [state]);

  function drawMonitor(analyser: AnalyserNode) {
    const samples = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        energy += normalized * normalized;
      }
      const rms = Math.sqrt(energy / samples.length);
      levelRef.current = rms;
      setLevel(rms);
      lastLevelAtRef.current = Date.now();
      if (rms < LOW_LEVEL_THRESHOLD) lowSinceRef.current ??= Date.now();
      else lowSinceRef.current = null;
      if (rms < SIGNAL_THRESHOLD) silentSinceRef.current ??= Date.now();
      else silentSinceRef.current = null;
      if (
        silentSinceRef.current &&
        Date.now() - silentSinceRef.current >= SILENCE_AFTER_MS
      )
        setWarning(
          "Nenhum áudio foi detectado nos últimos 30 segundos. Verifique o microfone.",
        );
      else if (
        lowSinceRef.current &&
        Date.now() - lowSinceRef.current >= LOW_LEVEL_AFTER_MS
      )
        setWarning("O volume do microfone está muito baixo.");
      else if (!stalled) setWarning("");

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const width = canvas.clientWidth * window.devicePixelRatio;
        const height = canvas.clientHeight * window.devicePixelRatio;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.clearRect(0, 0, width, height);
        context.fillStyle = "rgba(59, 130, 246, 0.15)";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "rgb(37, 99, 235)";
        context.lineWidth = 2 * window.devicePixelRatio;
        context.beginPath();
        samples.forEach((value, index) => {
          const x = (index / (samples.length - 1)) * width;
          const y = (value / 255) * height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  async function startMonitor(stream: MediaStream) {
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    if (context.state === "suspended") await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    analyserRef.current = analyser;
    drawMonitor(analyser);
  }

  function microphoneError(cause: unknown) {
    const name = cause instanceof DOMException ? cause.name : "";
    const code =
      name === "NotAllowedError" || name === "SecurityError"
        ? "MICROPHONE_PERMISSION_DENIED"
        : name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "MICROPHONE_NOT_FOUND"
          : "RECORDING_NOT_STARTED";
    setError(`${code}: ${errorMessages[code]}`);
    setState("idle");
    cleanup();
  }

  async function requestMicrophone() {
    setError("");
    setSuccess("");
    setWarning("");
    setRequestingMicrophone(true);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(`RECORDING_NOT_STARTED: ${errorMessages.RECORDING_NOT_STARTED}`);
      setRequestingMicrophone(false);
      return null;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      microphoneError(cause);
      return null;
    } finally {
      setRequestingMicrophone(false);
    }
  }

  async function startRecorder(stream: MediaStream) {
    try {
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("missing audio track");
      const mimeType = supportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      trackRef.current = track;
      recorderRef.current = recorder;
      chunksRef.current = [];
      completedSegmentsRef.current = [];
      totalChunkCountRef.current = 0;
      segmentBytesRef.current = 0;
      setSegments([]);
      stopActionRef.current = null;
      hadLiveTrackRef.current = track.readyState === "live";
      setMicrophoneName(track.label || "Microfone ativo");
      setTrackStatus(track.readyState);
      setChunkCount(0);
      setCapturedBytes(0);
      setSeconds(0);
      setStalled(false);

      track.addEventListener("ended", () => {
        setTrackStatus("ended");
        setStalled(true);
        setWarning(`AUDIO_STREAM_ENDED: ${errorMessages.AUDIO_STREAM_ENDED}`);
      });
      track.addEventListener("mute", () => {
        setTrackStatus("muted");
        setWarning("O microfone foi silenciado pelo navegador ou sistema.");
      });
      track.addEventListener("unmute", () => {
        setTrackStatus(track.readyState);
        setWarning("");
      });
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunksRef.current.push(event.data);
        totalChunkCountRef.current += 1;
        segmentBytesRef.current += event.data.size;
        lastChunkAtRef.current = Date.now();
        setChunkCount(chunksRef.current.length);
        setCapturedBytes((value) => value + event.data.size);
        setStalled(false);
        if (segmentBytesRef.current >= ROTATE_AUDIO_SIZE_BYTES && recorder.state === "recording") {
          rotatingRef.current = true;
          recorder.stop();
        }
      };
      recorder.onstart = () => {
        const startedAt = Date.now();
        startedAtRef.current = startedAt;
        lastChunkAtRef.current = startedAt;
        lastLevelAtRef.current = startedAt;
        setState("recording");
        setSuccess("Gravação iniciada");
      };
      recorder.onpause = () => setState("paused");
      recorder.onresume = () => setState("recording");
      recorder.onerror = () => {
        setError(`RECORDING_STALLED: ${errorMessages.RECORDING_STALLED}`);
        setStalled(true);
      };
      recorder.onstop = () => void handleStopped();
      await startMonitor(stream);
      recorder.start(TIMESLICE_MS);
      segmentStartedAtRef.current = nowMs();
      rotateTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") {
          rotatingRef.current = true;
          recorder.requestData();
          recorder.stop();
        }
      }, SEGMENT_DURATION_SECONDS * 1000);
      window.setTimeout(() => {
        if (recorder.state !== "recording") {
          setError(
            `RECORDING_NOT_STARTED: ${errorMessages.RECORDING_NOT_STARTED}`,
          );
          cleanup();
        }
      }, 1500);
    } catch (cause) {
      stream.getTracks().forEach((track) => track.stop());
      microphoneError(cause);
    }
  }

  async function beginRecording() {
    const stream = await requestMicrophone();
    if (stream) await startRecorder(stream);
  }

  async function confirmConsent() {
    if (!consentChecked || confirmingConsent) return;
    setConfirmingConsent(true);
    const streamPromise = requestMicrophone();
    try {
      const result = await recordTranscriptionEvent({
        appointmentId,
        status: "consent_confirmed",
      });
      const stream = await streamPromise;
      if (!stream) return;
      if (result.error) {
        stream.getTracks().forEach((track) => track.stop());
        setError(`TRANSCRIPTION_ERROR: ${result.error}`);
        return;
      }
      setConsentConfirmed(true);
      setConsentOpen(false);
      await startRecorder(stream);
    } catch {
      const stream = await streamPromise;
      stream?.getTracks().forEach((track) => track.stop());
      setError(
        "TRANSCRIPTION_ERROR: Não foi possível registrar o consentimento.",
      );
    } finally {
      setConfirmingConsent(false);
    }
  }

  async function testMicrophone() {
    const stream = await requestMicrophone();
    if (!stream) return;
    setState("testing");
    setMicrophoneName(stream.getAudioTracks()[0]?.label || "Microfone ativo");
    let peak = 0;
    try {
      await startMonitor(stream);
      const sampler = window.setInterval(() => {
        peak = Math.max(peak, levelRef.current);
      }, 100);
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      window.clearInterval(sampler);
      setSuccess(
        peak >= SIGNAL_THRESHOLD
          ? `Microfone funcionando corretamente. Formato: ${supportedMimeType() || "padrão do navegador"}.`
          : "Microfone conectado, mas nenhum áudio foi detectado.",
      );
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      stopMonitor();
      setState("idle");
      setLevel(0);
    }
  }

  function start() {
    if (consentConfirmed) void beginRecording();
    else setConsentOpen(true);
  }

  function pause() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      stopMonitor();
    }
  }

  async function resume() {
    if (streamRef.current) await startMonitor(streamRef.current);
    if (recorderRef.current?.state === "paused") recorderRef.current.resume();
  }

  function finish() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setState("finalizing");
    stopActionRef.current = "finish";
    recorder.requestData();
    recorder.stop();
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stopActionRef.current = "cancel";
    recorder.stop();
  }

  async function handleStopped() {
    const action = stopActionRef.current;
    const mimeType = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const endedAt = nowMs();
    if (blob.size) {
      completedSegmentsRef.current.push({
        id: crypto.randomUUID(),
        index: completedSegmentsRef.current.length,
        startedAt: segmentStartedAtRef.current,
        endedAt,
        durationSeconds: Math.max(1, Math.round((endedAt - segmentStartedAtRef.current) / 1000)),
        sizeBytes: blob.size,
        mimeType,
        blob,
        status: "pending",
        retryCount: 0,
        transcription: "",
        error: "",
      });
      setSegments([...completedSegmentsRef.current]);
    }
    if (rotatingRef.current && !action && streamRef.current) {
      rotatingRef.current = false;
      const stream = streamRef.current;
      const nextMime = supportedMimeType();
      const next = nextMime ? new MediaRecorder(stream, { mimeType: nextMime }) : new MediaRecorder(stream);
      recorderRef.current = next;
      chunksRef.current = [];
      segmentBytesRef.current = 0;
      next.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunksRef.current.push(event.data);
        totalChunkCountRef.current += 1;
        segmentBytesRef.current += event.data.size;
        lastChunkAtRef.current = Date.now();
        setChunkCount((value) => value + 1);
        setCapturedBytes((value) => value + event.data.size);
        if (segmentBytesRef.current >= ROTATE_AUDIO_SIZE_BYTES && next.state === "recording") {
          rotatingRef.current = true;
          next.stop();
        }
      };
      next.onstop = () => void handleStopped();
      segmentStartedAtRef.current = nowMs();
      next.start(TIMESLICE_MS);
      rotateTimerRef.current = window.setTimeout(() => {
        if (next.state === "recording") {
          rotatingRef.current = true;
          next.requestData();
          next.stop();
        }
      }, SEGMENT_DURATION_SECONDS * 1000);
      return;
    }
    stopMonitor();
    stopActionRef.current = null;
    const duration = Math.max(
      seconds,
      Math.round((nowMs() - startedAtRef.current) / 1000),
    );
    const totalSize = completedSegmentsRef.current.reduce((total, segment) => total + segment.sizeBytes, 0);
    const capture: CaptureSummary = {
      blob,
      segments: [...completedSegmentsRef.current],
      duration,
      chunks: totalChunkCountRef.current,
      size: totalSize,
      mimeType,
      incomplete:
        duration <= 1 ||
        chunksRef.current.length < 2 ||
        !completedSegmentsRef.current.length ||
        !hadLiveTrackRef.current ||
        stalled,
    };
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setTrackStatus("ended");
    if (action === "cancel") {
      await recordTranscriptionEvent({
        appointmentId,
        status: "transcription_cancelled",
        durationSeconds: duration,
      });
      setState("idle");
      setSeconds(0);
      cleanup();
      return;
    }
    setSummary(capture);
    setState("idle");
  }

  async function uploadAudio(capture: CaptureSummary) {
    if (uploadInProgressRef.current || !capture.size || !capture.chunks) {
      setError(`NO_AUDIO_DATA: ${errorMessages.NO_AUDIO_DATA}`);
      return;
    }
    if (capture.segments.some((segment) => segment.sizeBytes > SAFE_AUDIO_SIZE_BYTES)) {
      setError(errorMessages.AUDIO_TOO_LARGE);
      return;
    }
    uploadInProgressRef.current = true;
    setTranscriptionProgress(0);
    setSummary(null);
    setState("transcribing");
    abortControllerRef.current = new AbortController();
    try {
      const working = [...capture.segments];
      for (let index = 0; index < working.length; index += 1) {
        const segment = working[index];
        if (segment.status === "completed" && segment.transcription) {
          setTranscriptionProgress((value) => value + 1);
          continue;
        }
        let attempt = 0;
        while (true) {
          segment.status = "uploading";
          setSegments([...working]);
          const mimeType = segment.mimeType.split(";")[0] || "audio/webm";
          const formData = new FormData();
          formData.append("appointmentId", appointmentId);
          formData.append("durationSeconds", String(segment.durationSeconds));
          formData.append("audio", new File([segment.blob], `consulta-${index + 1}.${mimeType === "audio/mp4" ? "mp4" : "webm"}`, { type: mimeType }));
          const response = await fetch("/api/clinical-ai/transcribe", { method: "POST", body: formData, signal: abortControllerRef.current.signal });
          const payload = (await response.json()) as { text?: string; error?: { code?: string; message?: string } };
          if (response.ok && payload.text) {
            segment.status = "completed";
            segment.transcription = payload.text;
            setTranscriptionProgress(index + 1);
            setSegments([...working]);
            break;
          }
          const code = payload.error?.code || "TRANSCRIPTION_FAILED";
          if (attempt < 2 && isTransientTranscriptionError(response.status, code)) {
            segment.retryCount = ++attempt;
            await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs(attempt - 1)));
            continue;
          }
          segment.status = "failed";
          segment.error = errorMessages[code] || errorMessages.TRANSCRIPTION_FAILED;
          setSegments([...working]);
          throw Object.assign(new Error(segment.error), { code });
        }
      }
      const text = joinSegmentTranscriptions(working);
      onTranscriptionComplete?.(text);
      if (currentText.trim()) {
        setPendingText(text);
        setInsertMode("append");
      } else {
        onApply(text, "replace");
      }
      setSuccess("Transcrição concluída");
    } catch (cause) {
      const code =
        cause instanceof DOMException && cause.name === "AbortError"
          ? "AbortError"
          : cause && typeof cause === "object" && "code" in cause
          ? String(cause.code)
          : "TRANSCRIPTION_FAILED";
      setSummary(capture);
      if (code !== "AbortError") setError(errorMessages[code] || errorMessages.TRANSCRIPTION_FAILED);
    } finally {
      setState("idle");
      uploadInProgressRef.current = false;
      abortControllerRef.current = null;
    }
  }

  function cancelTranscription() {
    abortControllerRef.current?.abort();
    setSegments((current) => current.map((segment) => segment.status === "completed" ? segment : { ...segment, status: "cancelled" }));
    setState("idle");
    setWarning("Envio cancelado. A gravação continua preservada nesta página.");
  }

  function recover() {
    setStalled(false);
    setWarning("");
    if (audioContextRef.current?.state === "suspended")
      void audioContextRef.current.resume();
    if (recorderRef.current?.state === "paused") recorderRef.current.resume();
    else if (recorderRef.current?.state === "recording")
      recorderRef.current.requestData();
  }

  function applyPending() {
    onApply(pendingText, insertMode);
    setPendingText("");
    setSuccess(
      "Transcrição concluída. Revise o texto antes de gerar conteúdo clínico.",
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" && (
          <>
            <Button type="button" disabled={disabled} onClick={start}>
              <Mic /> Iniciar gravação
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => void testMicrophone()}
            >
              <AudioLines /> Testar microfone
            </Button>
          </>
        )}
        {state === "recording" && (
          <Button type="button" variant="outline" onClick={pause}>
            <Pause /> Pausar
          </Button>
        )}
        {state === "paused" && (
          <Button type="button" variant="outline" onClick={() => void resume()}>
            <Play /> Continuar
          </Button>
        )}
        {(state === "recording" || state === "paused") && (
          <>
            <Button type="button" onClick={finish}>
              <Square /> Finalizar
            </Button>
            <Button type="button" variant="outline" onClick={cancel}>
              <X /> Cancelar gravação
            </Button>
          </>
        )}
        {(state === "testing" ||
          state === "finalizing" ||
          state === "transcribing") && (
          <Button type="button" disabled>
            <Loader2 className="animate-spin" />
            {state === "testing"
              ? "Testando microfone..."
              : state === "finalizing"
                ? "Finalizando gravação..."
                : "Transcrevendo..."}
          </Button>
        )}
        {state === "transcribing" && (
          <Button type="button" variant="outline" onClick={cancelTranscription}>
            <X /> Cancelar envio
          </Button>
        )}
        {(state === "recording" || state === "paused") && (
          <span className="ml-auto font-mono text-base font-semibold tabular-nums">
            {formatDuration(seconds)}
          </span>
        )}
      </div>

      {(state === "recording" || state === "paused" || state === "testing") && (
        <div className={state === "paused" ? "opacity-40" : ""}>
          <canvas
            ref={canvasRef}
            className="h-20 w-full rounded-lg"
            aria-label="Nível real do áudio captado"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{microphoneName || "Microfone conectado"}</span>
            <span>Nível: {Math.min(100, Math.round(level * 500))}%</span>
            <span>Track: {trackStatus}</span>
            {state !== "testing" && (
              <>
                <span>{chunkCount} chunks</span>
                <span>{formatSize(capturedBytes)}</span>
              </>
            )}
          </div>
        </div>
      )}
      {state === "recording" && (
        <p role="status" className="text-sm font-medium text-red-600">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-red-600" />{" "}
          Gravando · Áudio sendo captado
        </p>
      )}
      {state === "paused" && (
        <p role="status" className="text-sm font-medium text-amber-700">
          Gravação pausada
        </p>
      )}
      {state === "transcribing" && (
        <div className="space-y-2" role="status">
          <div className="flex justify-between text-sm">
            <span>Transcrevendo {Math.min(transcriptionProgress + 1, segments.length)} de {segments.length} segmentos</span>
            <span>{transcriptionProgress} concluído(s)</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${segments.length ? (transcriptionProgress / segments.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {warning && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200"
        >
          <p>
            <AlertTriangle className="mr-2 inline size-4" />
            {warning}
          </p>
          {stalled && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={recover}
              >
                <RotateCcw /> Tentar recuperar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={finish}
              >
                Finalizar com o áudio capturado
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancel}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-emerald-700">
          {success}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        O áudio é analisado localmente pelo equalizador e enviado somente para
        transcrição. Não é armazenado permanentemente.
      </p>

      <Dialog
        open={consentOpen}
        onOpenChange={(open) => !confirmingConsent && setConsentOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consentimento para gravação</DialogTitle>
            <DialogDescription>
              Confirme que o paciente foi informado e concordou com a gravação e
              transcrição desta consulta.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            Confirmo que obtive o consentimento do paciente.
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {requestingMicrophone && (
            <p role="status" className="text-sm text-muted-foreground">
              Solicitando acesso ao microfone...
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={confirmingConsent}
              >
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!consentChecked || confirmingConsent}
              onClick={() => void confirmConsent()}
            >
              {requestingMicrophone ? (
                <>
                  <Loader2 className="animate-spin" /> Solicitando acesso ao
                  microfone...
                </>
              ) : (
                "Confirmar e iniciar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(summary)}
        onOpenChange={(open) => !open && setSummary(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resumo da captura</DialogTitle>
            <DialogDescription>
              Confirme a integridade da gravação antes de enviar para
              transcrição.
            </DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="space-y-2 text-sm">
              <dl className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                <dt>Duração</dt>
                <dd>{formatDuration(summary.duration)}</dd>
                <dt>Tamanho</dt>
                <dd>{formatSize(summary.size)}</dd>
                <dt>Formato</dt>
                <dd>{summary.mimeType}</dd>
                <dt>Chunks</dt>
                <dd>{summary.chunks}</dd>
                <dt>Segmentos</dt>
                <dd>{summary.segments.length}</dd>
                <dt>Concluídos</dt>
                <dd>{summary.segments.filter((segment) => segment.status === "completed").length}</dd>
                <dt>Erros</dt>
                <dd>{summary.segments.filter((segment) => segment.status === "failed").length}</dd>
                <dt>Limite por envio</dt>
                <dd>{formatSize(MAX_AUDIO_SIZE_BYTES)} (margem segura: {formatSize(SAFE_AUDIO_SIZE_BYTES)})</dd>
                <dt>Status</dt>
                <dd>
                  {summary.incomplete
                    ? "Possivelmente incompleta"
                    : "Captura íntegra"}
                </dd>
              </dl>
              {summary.incomplete && (
                <p role="alert" className="text-amber-700">
                  INCOMPLETE_RECORDING: A gravação pode estar incompleta. Deseja
                  transcrever o conteúdo disponível?
                </p>
              )}
              {summary.size > MAX_AUDIO_SIZE_BYTES && summary.segments.every((segment) => segment.sizeBytes <= SAFE_AUDIO_SIZE_BYTES) && (
                <p className="text-blue-700">
                  A gravação é maior que o limite de envio único e será processada em partes automaticamente.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Voltar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSummary(null);
                cleanup();
              }}
            >
              Descartar
            </Button>
            <Button
              type="button"
              disabled={!summary?.size}
              onClick={() => summary && void uploadAudio(summary)}
            >
              {summary?.incomplete
                ? "Transcrever mesmo assim"
                : summary?.segments.some((segment) => segment.status === "failed" || segment.status === "cancelled")
                  ? "Tentar novamente"
                : "Enviar para transcrição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingText)}
        onOpenChange={(open) => !open && setPendingText("")}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>O relato já possui conteúdo</DialogTitle>
            <DialogDescription>
              Escolha como inserir a transcrição. A opção padrão acrescenta o
              novo texto ao final.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="transcription-insert-mode"
                checked={insertMode === "append"}
                onChange={() => setInsertMode("append")}
              />
              Acrescentar ao final
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="transcription-insert-mode"
                checked={insertMode === "replace"}
                onChange={() => setInsertMode("replace")}
              />
              Substituir texto atual
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Apenas revisar transcrição
              </Button>
            </DialogClose>
            <Button type="button" onClick={applyPending}>
              Inserir transcrição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
