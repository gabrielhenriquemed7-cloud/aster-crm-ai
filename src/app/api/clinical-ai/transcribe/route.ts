import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const MAX_DURATION_SECONDS = 30 * 60;
const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
]);

type AuditStatus =
  | "transcription_requested"
  | "transcription_completed"
  | "transcription_failed";

function responseError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let hasAuthenticatedUser = false;
  let hasActiveClinic = false;
  let hasAppointment = false;
  let mimeType: string | undefined;
  let fileSize: number | undefined;
  let audit:
    ((status: AuditStatus, model?: string) => Promise<void>) | undefined;
  try {
    const supabase = await createClient();
    if (!supabase)
      return responseError("TRANSCRIPTION_ERROR", "Serviço indisponível.", 503);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user)
      return responseError(
        "TRANSCRIPTION_ERROR",
        "Sua sessão expirou. Entre novamente.",
        401,
      );
    hasAuthenticatedUser = true;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_clinic_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!profile?.active_clinic_id)
      return responseError(
        "TRANSCRIPTION_ERROR",
        "Selecione uma clínica ativa.",
        403,
      );
    hasActiveClinic = true;

    const formData = await request.formData();
    const appointmentId = String(formData.get("appointmentId") ?? "");
    const durationSeconds = Number(formData.get("durationSeconds") ?? 0);
    const audio = formData.get("audio");
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, professional_id, status")
      .eq("id", appointmentId)
      .eq("clinic_id", profile.active_clinic_id)
      .maybeSingle();
    hasAppointment = Boolean(appointment);
    if (
      !appointment ||
      appointment.professional_id !== auth.user.id ||
      appointment.status !== "in_progress"
    )
      return responseError(
        "TRANSCRIPTION_ERROR",
        "Você não possui permissão para transcrever esta consulta.",
        403,
      );
    const { data: consent } = await supabase
      .from("clinical_transcription_events")
      .select("id")
      .eq("clinic_id", profile.active_clinic_id)
      .eq("appointment_id", appointment.id)
      .eq("requested_by", auth.user.id)
      .eq("status", "consent_confirmed")
      .eq("consent_confirmed", true)
      .limit(1)
      .maybeSingle();
    if (!consent)
      return responseError(
        "TRANSCRIPTION_ERROR",
        "Confirme o consentimento do paciente antes de transcrever.",
        403,
      );
    if (!(audio instanceof File) || audio.size === 0)
      return responseError(
        "AUDIO_EMPTY",
        "Nenhum áudio válido foi capturado.",
        400,
      );
    mimeType = audio.type.split(";")[0].toLowerCase();
    fileSize = audio.size;
    if (!ALLOWED_MIME_TYPES.has(mimeType))
      return responseError(
        "TRANSCRIPTION_INVALID_AUDIO",
        "O formato do áudio não pôde ser processado.",
        415,
      );
    if (audio.size > MAX_AUDIO_SIZE || durationSeconds > MAX_DURATION_SECONDS)
      return responseError(
        "AUDIO_TOO_LARGE",
        "A gravação excedeu o tamanho permitido.",
        413,
      );

    audit = async (status, model) => {
      await supabase.from("clinical_transcription_events").insert({
        clinic_id: profile.active_clinic_id,
        appointment_id: appointment.id,
        requested_by: auth.user.id,
        status,
        consent_confirmed: true,
        duration_seconds: Math.max(0, Math.round(durationSeconds)),
        file_size_bytes: audio.size,
        model: model ?? null,
      });
    };
    await audit("transcription_requested");

    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw Object.assign(new Error("Chave de transcrição não configurada."), {
        code: "TRANSCRIPTION_AUTH_ERROR",
      });
    const model =
      process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
    const openAiForm = new FormData();
    openAiForm.append(
      "file",
      audio,
      audio.name || `consulta.${mimeType === "audio/mp4" ? "mp4" : "webm"}`,
    );
    openAiForm.append("model", model);
    openAiForm.append("language", "pt");
    openAiForm.append("response_format", "json");
    openAiForm.append(
      "prompt",
      "Consulta médica em português do Brasil. Preserve termos clínicos, nomes de medicamentos, doses, unidades e siglas médicas.",
    );
    let openAiResponse: Response;
    try {
      openAiResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: openAiForm,
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch (error) {
      const code =
        error instanceof Error && error.name === "TimeoutError"
          ? "TRANSCRIPTION_TIMEOUT"
          : "TRANSCRIPTION_ERROR";
      throw Object.assign(
        new Error(
          code === "TRANSCRIPTION_TIMEOUT"
            ? "A transcrição demorou mais que o esperado. Tente novamente."
            : "Não foi possível transcrever a gravação.",
        ),
        { code },
      );
    }
    if (!openAiResponse.ok) {
      const errorPayload = (await openAiResponse.json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      const code =
        openAiResponse.status === 401 || openAiResponse.status === 403
          ? "TRANSCRIPTION_AUTH_ERROR"
          : openAiResponse.status === 429
            ? "TRANSCRIPTION_QUOTA_ERROR"
            : openAiResponse.status === 400
              ? "TRANSCRIPTION_INVALID_AUDIO"
              : "TRANSCRIPTION_ERROR";
      throw Object.assign(
        new Error(
          errorPayload?.error?.message ||
            "Não foi possível transcrever a gravação.",
        ),
        { code },
      );
    }
    const payload = (await openAiResponse.json()) as { text?: string };
    if (!payload.text?.trim())
      throw Object.assign(new Error("Nenhuma transcrição foi retornada."), {
        code: "TRANSCRIPTION_INVALID_AUDIO",
      });
    await audit("transcription_completed", model);
    return NextResponse.json({ text: payload.text.trim(), model });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "TRANSCRIPTION_ERROR";
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível transcrever a gravação.";
    if (audit) await audit("transcription_failed").catch(() => undefined);
    console.error("ASTER_TRANSCRIPTION_ERROR", {
      code,
      message,
      hasAuthenticatedUser,
      hasActiveClinic,
      hasAppointment,
      mimeType,
      fileSize,
    });
    return responseError(code, message, 500);
  }
}
