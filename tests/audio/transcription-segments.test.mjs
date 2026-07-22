import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperPath = "src/lib/audio/transcription-segments.ts";
const recorderPath = "src/components/medical-records/clinical-audio-recorder.tsx";
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

test("capture rotates MediaRecorder into independently finalized containers", async () => {
  const source = await readFile(recorderPath, "utf8");
  assert.match(source, /rotatingRef\.current = true/);
  assert.match(source, /new MediaRecorder\(stream/);
  assert.doesNotMatch(source, /blob\.slice\(/);
});

test("queue is sequential, cancellable, and retries only transient failures", async () => {
  const source = await readFile(recorderPath, "utf8");
  assert.match(source, /for \(let index = 0; index < working\.length; index \+= 1\)/);
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
