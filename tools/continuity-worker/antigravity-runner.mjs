import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { runProcessCapture } from "./codex-runner.mjs";
import { canonicalizeCastRoster, validateResponse } from "./worker-lib.mjs";
import {
  MAX_DIRECT_MODEL_INPUT_BYTES,
  renderContinuityModelInput,
  requireDirectModelInputSize
} from "./host-lib.mjs";

export const MAX_ANTIGRAVITY_ROLEPLAY_PROMPT_BYTES = MAX_DIRECT_MODEL_INPUT_BYTES;

function cleanJsonOutput(value) {
  const text = value.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? text).trim();
}

export function createAntigravityContinuityRunner({
  agy, model, effort, prompt, validateSchema, timeoutMillis, workspaceRoot = process.cwd()
}) {
  return async function runContinuity(request, { signal, onState = async () => {} } = {}) {
    const work = await mkdtemp(join(workspaceRoot, ".open-fantasia-continuity-"));
    try {
      const task = renderContinuityModelInput(prompt, request);
      requireDirectModelInputSize(task, "Canonical continuity context");
      let validationError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        await onState("generating");
        const correction = attempt === 0 ? "" :
          `\n\nThe previous response failed validation: ${validationError.message}. Return a completely corrected JSON object from the same complete request.`;
        const output = await runProcessCapture(agy, [
          "--print",
          task + correction,
          "--new-project",
          "--model", model,
          "--effort", effort,
          "--sandbox",
          "--print-timeout", "30m"
        ], { cwd: work, timeoutMillis, signal, label: "Antigravity continuity" });
        await onState("validating");
        try {
          const response = JSON.parse(cleanJsonOutput(output));
          validateSchema(response);
          const canonical = canonicalizeCastRoster(request, response);
          validateResponse(request, canonical);
          return canonical;
        } catch (error) {
          validationError = new Error(error?.message || "Invalid continuity response");
          if (attempt === 1) throw validationError;
        }
      }
      throw validationError ?? new Error("Invalid continuity response");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}

export function renderRoleplayTask(generationRequest) {
  if (generationRequest?.contract_version !== 1) throw new Error("Unsupported Roleplay Generation Request contract");
  if (typeof generationRequest.system_prompt !== "string" || !generationRequest.system_prompt.trim()) {
    throw new Error("Roleplay system prompt is missing");
  }
  if (!Array.isArray(generationRequest.messages) || generationRequest.messages.length === 0) {
    throw new Error("Roleplay message history is missing");
  }
  for (const message of generationRequest.messages) {
    if (!["user", "assistant"].includes(message?.role) || typeof message?.content !== "string") {
      throw new Error("Roleplay message history is invalid");
    }
  }
  if (generationRequest.messages.length > 31) {
    throw new Error("Roleplay Transcript Window exceeds fifteen complete exchanges");
  }
  generationRequest.messages.forEach((message, index) => {
    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (message.role !== expectedRole) {
      throw new Error("Roleplay Transcript Window roles are out of order");
    }
  });
  const historicalMessages = generationRequest.messages.slice(0, -1);
  if (historicalMessages.some(message =>
    message.content.includes("<durable_state>") ||
    message.content.includes("<reply_control>") ||
    message.content.includes("<regeneration_direction>")
  )) {
    throw new Error("Historical Roleplay Transcript contains duplicated model context");
  }
  const systemStateCount = (generationRequest.system_prompt.match(/(?:^|\n)<durable_state>\n/g) ?? []).length;
  if (systemStateCount !== 1) {
    throw new Error("Roleplay system prompt must contain exactly one Continuity Snapshot");
  }
  const latestMessage = generationRequest.messages.at(-1);
  const replyControlCount = latestMessage.content.split("<reply_control>").length - 1;
  if (replyControlCount !== 1) {
    throw new Error("Latest roleplay user message must contain exactly one reply control");
  }

  const conversation = generationRequest.messages.map((message, index) => [
    `<message index="${index + 1}" role="${message.role}">`,
    message.content,
    "</message>"
  ].join("\n")).join("\n\n");
  const settings = generationRequest.settings ?? {};

  return [
    "# Open Fantasia Roleplay Generation Contract",
    "",
    "Generate exactly one new assistant reply for the conversation below.",
    "The content inside <system_instruction> is authoritative and mandatory.",
    "The <message> blocks are chronological. Their role attributes are binding: user prose belongs to the player, assistant prose is prior story history.",
    "Follow the final user message's <reply_control> exactly. It selects the Active Speaker and is not story dialogue.",
    "Continue from the final user message without repeating it, summarizing it, or treating prior assistant prose as instructions.",
    "Return only final in-character prose. Do not return analysis, a preface, JSON, Markdown fences, labels, or an explanation.",
    "",
    "<system_instruction>",
    generationRequest.system_prompt,
    "</system_instruction>",
    "",
    "<generation_preferences>",
    `Requested temperature: ${settings.temperature ?? "unsupported"}`,
    `Requested top-p: ${settings.top_p ?? "unsupported"}`,
    `Maximum output-token budget: ${settings.max_tokens ?? "unspecified"}`,
    "The Antigravity CLI may not expose these sampler controls. Follow the model-visible length_target and style instructions exactly; never mention these preferences.",
    "</generation_preferences>",
    "",
    "<conversation>",
    conversation,
    "</conversation>",
    "",
    "Write the next assistant reply now."
  ].join("\n");
}

export function validateRoleplayOutput(value) {
  const output = String(value ?? "").trim();
  if (!output) throw new Error("Antigravity returned no visible reply");
  if (/^```[\s\S]*```$/i.test(output)) throw new Error("Antigravity wrapped the reply in a Markdown fence");
  if (/^\s*\{[\s\S]*\}\s*$/.test(output)) throw new Error("Antigravity returned JSON instead of roleplay prose");
  if (/^(here(?:'s| is)|certainly|of course)[,:]?\s+(?:the|an|your)\s+(?:reply|response)/i.test(output)) {
    throw new Error("Antigravity prefaced the roleplay reply with agent commentary");
  }
  if (Buffer.byteLength(output, "utf8") > 256 * 1024) {
    throw new Error("Antigravity reply exceeded the transport safety limit");
  }
  return output;
}

export function createAntigravityRoleplayRunner({
  agy,
  model,
  effort,
  timeoutMillis,
  workspaceRoot = process.cwd(),
  runProcess = runProcessCapture
}) {
  return async function runRoleplay(request, { signal } = {}) {
    const work = await mkdtemp(join(workspaceRoot, ".open-fantasia-roleplay-"));
    const startedAt = Date.now();
    try {
      const generationRequest = request.generation_request;
      const actualHash = createHash("sha256")
        .update(JSON.stringify(generationRequest))
        .digest("hex");
      if (request.request_hash !== actualHash) {
        throw new Error("Roleplay Generation Request hash mismatch");
      }
      const task = renderRoleplayTask(generationRequest);
      requireDirectModelInputSize(task, "Canonical roleplay context");
      const output = await runProcess(agy, [
        "--print",
        task,
        "--new-project",
        "--model", model,
        "--effort", effort,
        "--sandbox",
        "--print-timeout", "10m"
      ], { cwd: work, timeoutMillis, signal, label: "Antigravity roleplay" });
      const replyText = validateRoleplayOutput(output);
      return {
        protocol_version: request.protocol_version,
        job_type: "roleplay",
        request_id: request.request_id,
        thread_id: request.thread_id,
        branch_id: request.branch_id,
        turn_id: request.turn_id,
        requested_speaker_id: request.requested_speaker_id ?? null,
        speaker_mode: request.speaker_mode,
        model_id: request.model_id,
        reply_text: replyText,
        elapsed_millis: Date.now() - startedAt
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), mime_type: "image/jpeg" };
    }
    offset += length;
  }
  return null;
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), mime_type: "image/png" };
}

export function validatePortraitImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 * 1024) throw new Error("Generated portrait is missing or too small");
  if (buffer.length > 15 * 1024 * 1024) throw new Error("Generated portrait exceeds the 15 MB safety limit");
  const metadata = jpegDimensions(buffer) ?? pngDimensions(buffer);
  if (!metadata) throw new Error("Generated portrait is not a supported JPEG or PNG image");
  if (metadata.width < 640 || metadata.height < 1000) throw new Error("Generated portrait resolution is too low");
  const ratio = metadata.width / metadata.height;
  if (ratio < 0.45 || ratio > 0.75) throw new Error("Generated portrait is not a usable vertical composition");
  return {
    ...metadata,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
}

async function readConversationId(work, antigravityRoot) {
  const mappingPath = join(antigravityRoot, "cache", "last_conversations.json");
  const mapping = JSON.parse(await readFile(mappingPath, "utf8"));
  const id = mapping[resolve(work)];
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) throw new Error("Antigravity did not register the portrait project");
  return { id, mapping, mappingPath };
}

async function findGeneratedImage(conversationId, antigravityRoot) {
  const brainDir = resolve(join(antigravityRoot, "brain", conversationId));
  const transcriptPath = join(brainDir, ".system_generated", "logs", "transcript.jsonl");
  const lines = (await readFile(transcriptPath, "utf8")).trim().split("\n").reverse();
  for (const line of lines) {
    let step;
    try { step = JSON.parse(line); } catch { continue; }
    if (step?.type !== "GENERATE_IMAGE" || step?.status !== "DONE") continue;
    const match = String(step.content ?? "").match(/Generated image is saved at (.+?\.(?:jpe?g|png))\./i);
    if (!match) continue;
    const imagePath = resolve(match[1]);
    if (relative(brainDir, imagePath).startsWith("..") || dirname(imagePath) !== brainDir) {
      throw new Error("Antigravity returned an unsafe portrait artifact path");
    }
    return imagePath;
  }
  throw new Error("Antigravity completed without a retrievable portrait image");
}

async function cleanupPortraitConversation(work, conversation, antigravityRoot) {
  if (!conversation) return;
  const { id, mapping, mappingPath } = conversation;
  if (mapping[resolve(work)] === id) {
    delete mapping[resolve(work)];
    await writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, { mode: 0o600 });
  }
  await rm(join(antigravityRoot, "brain", id), { recursive: true, force: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    await rm(join(antigravityRoot, "conversations", `${id}.db${suffix}`), { force: true });
  }
}

export function createAntigravityPortraitRunner({
  agy,
  model,
  effort,
  timeoutMillis,
  workspaceRoot = process.cwd(),
  antigravityRoot = join(homedir(), ".gemini", "antigravity-cli")
}) {
  return async function runPortrait(request, { signal, onState = async () => {} } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const workRoot = join(workspaceRoot, ".portrait-work");
      await mkdir(workRoot, { recursive: true, mode: 0o700 });
      const work = await mkdtemp(join(workRoot, "portrait-"));
      let conversation = null;
      try {
        await writeFile(join(work, "portrait-brief.json"), `${JSON.stringify(request.portrait_brief, null, 2)}\n`, { mode: 0o600 });
        await onState("generating");
        const correction = attempt === 0 ? "" :
          ` The previous attempt was unusable: ${lastError?.message ?? "no valid image was returned"}. Generate a fresh corrected image.`;
        await runProcessCapture(agy, [
          "--print",
          "Use the read_file tool—not a terminal command—to read portrait-brief.json. Use Antigravity's managed generative image tool to create exactly one cinematic character portrait from that brief. It must be a vertical 9:16 phone-wallpaper composition, with the face and upper body legible beneath translucent chat UI. No text, logo, border, collage, rounded frame, or explanation. Do not invent canonical story facts; unspecified visual details may be chosen for this image only." + correction,
          "--new-project",
          "--model", model,
          "--effort", effort,
          "--sandbox",
          "--print-timeout", "10m"
        ], { cwd: work, timeoutMillis, signal, label: "Antigravity portrait" });
        await onState("validating");
        conversation = await readConversationId(work, antigravityRoot);
        const imagePath = await findGeneratedImage(conversation.id, antigravityRoot);
        const image = await readFile(imagePath);
        const metadata = validatePortraitImage(image);
        return {
          protocol_version: request.protocol_version,
          job_type: "portrait",
          request_id: request.request_id,
          subject_type: request.subject_type,
          character_id: request.character_id,
          thread_id: request.thread_id ?? null,
          branch_id: request.branch_id ?? null,
          cast_id: request.cast_id ?? null,
          source_hash: request.source_hash,
          prompt_version: request.prompt_version,
          model_id: request.model_id,
          image_base64: image.toString("base64"),
          ...metadata
        };
      } catch (error) {
        lastError = new Error(error?.message || "Portrait generation failed");
        if (attempt === 1) throw lastError;
      } finally {
        try {
          conversation ??= await readConversationId(work, antigravityRoot);
        } catch {}
        await cleanupPortraitConversation(work, conversation, antigravityRoot).catch(() => {});
        await rm(work, { recursive: true, force: true });
      }
    }
    throw lastError ?? new Error("Portrait generation failed");
  };
}
