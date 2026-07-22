import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperPath = "src/lib/audio/transcription-segments.ts";
const recorderPath =
  "src/components/medical-records/clinical-audio-recorder.tsx";
const routePath = "src/app/api/clinical-ai/transcribe/route.ts";

test("single-upload and safe segment limits are explicit", async () => {
  const source = await readFile(helperPath, "utf8");
  assert.match(source, /MAX_AUDIO_SIZE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(source, /SAFE_AUDIO_SIZE_BYTES = 20 \* 1024 \* 1024/);
  assert.match(source, /ROTATE_AUDIO_SIZE_BYTES = 18 \* 1024 \* 1024/);
  assert.match(source, /SEGMENT_DURATION_SECONDS = 4 \* 60/);
});

test("transcriptions are joined by capture index, not completion order", async () => {
  const source = await readFile(helperPath, "utf8");
  assert.match(source, /sort\(\(a, b\) => a\.index - b\.index\)/);
  assert.match(source, /segment\.transcription\.trim\(\)/);
});

test("Safari MP4/AAC and Chrome WebM are selected from actual browser support", async () => {
  const source = await readFile(helperPath, "utf8");
  assert.match(source, /audio\/mp4;codecs=mp4a\.40\.2/);
  assert.match(source, /audio\/webm;codecs=opus/);
  assert.match(source, /RECORDER_MIME_TYPES\.find\(isTypeSupported\)/);
});

test("filename extension follows the normalized MIME type", async () => {
  const source = await readFile(helperPath, "utf8");
  assert.match(source, /"audio\/mp4": "mp4"/);
  assert.match(source, /"audio\/m4a": "m4a"/);
  assert.match(source, /"audio\/webm": "webm"/);
  assert.match(source, /"audio\/mpeg": "mp3"/);
  const recorder = await readFile(recorderPath, "utf8");
  assert.match(recorder, /audioExtensionForMimeType\(mimeType\)/);
  assert.match(recorder, /consulta-\$\{index \+ 1\}\.\$\{extension\}/);
});

test("empty, invalid, unsupported, and oversized segments are rejected before upload", async () => {
  const source = await readFile(helperPath, "utf8");
  for (const code of [
    "EMPTY_SEGMENT",
    "INVALID_AUDIO_SEGMENT",
    "UNSUPPORTED_AUDIO_FORMAT",
    "SEGMENT_TOO_LARGE",
  ])
    assert.match(source, new RegExp(code));
  const recorder = await readFile(recorderPath, "utf8");
  assert.match(recorder, /validateAudioSegment/);
});

test("capture rotates MediaRecorder into independently finalized containers", async () => {
  const source = await readFile(recorderPath, "utf8");
  assert.match(source, /rotatingRef\.current = true/);
  assert.match(source, /new MediaRecorder\(stream/);
  assert.doesNotMatch(source, /blob\.slice\(/);
});

test("queue is sequential, cancellable, and retries only transient failures", async () => {
  const source = await readFile(recorderPath, "utf8");
  assert.match(
    source,
    /for \(let index = 0; index < working\.length; index \+= 1\)/,
  );
  assert.match(source, /isTransientTranscriptionError/);
  assert.match(source, /AbortController/);
  assert.match(source, /segment\.status = "failed"/);
  assert.match(source, /segment\.retryCount = \+\+attempt/);
});

test("backend enforces authentication, MIME, 25 MiB, and duration", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /supabase\.auth\.getUser/);
  assert.match(source, /ALLOWED_MIME_TYPES/);
  assert.match(source, /audio\.size > MAX_AUDIO_SIZE_BYTES/);
  assert.match(source, /durationSeconds > MAX_SEGMENT_DURATION_SECONDS/);
  assert.match(source, /413/);
});

test("frontend and endpoint agree on the multipart audio field and structured response", async () => {
  const recorder = await readFile(recorderPath, "utf8");
  const route = await readFile(routePath, "utf8");
  assert.match(recorder, /formData\.append\(\s*"audio"/);
  assert.match(route, /formData\.get\("audio"\)/);
  assert.match(route, /success: true/);
  assert.match(route, /transcription: payload\.text\.trim\(\)/);
  assert.match(route, /success: false/);
});

test("retry preserves completed segments and creates a fresh abort controller", async () => {
  const source = await readFile(recorderPath, "utf8");
  assert.match(
    source,
    /segment\.status === "completed" && segment\.transcription/,
  );
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /setState\("cancelled"\)/);
  assert.match(source, /Tentar novamente o segmento/);
});
