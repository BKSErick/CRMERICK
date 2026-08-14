/**
 * transcribeAudio.ts
 * Serviço de transcrição de áudio usando Groq Whisper (whisper-large-v3-turbo).
 * Aceita Buffer, Blob, File, Uint8Array ou URL remota (ex: mídia do WhatsApp/Uazapi).
 */

const GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export type TranscribeOptions = {
  filename?: string;
  language?: string;
  model?: string;
  timeoutMs?: number;
};

export type TranscribeResult = {
  text: string;
  provider: string;
  model: string;
};

export async function transcribeAudio(
  input: Buffer | Blob | Uint8Array | string,
  options?: TranscribeOptions,
): Promise<TranscribeResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("transcribeAudio: GROQ_API_KEY não encontrada no ambiente.");
    return null;
  }

  let rawBuffer: Buffer;
  let filename = options?.filename || "audio.ogg";

  try {
    if (typeof input === "string") {
      const audioRes = await fetch(input, {
        signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      });
      if (!audioRes.ok) {
        console.warn(`transcribeAudio: Falha ao baixar áudio da URL (${audioRes.status})`);
        return null;
      }
      const arrayBuf = await audioRes.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuf);

      const urlExtMatch = input.match(/\.(ogg|opus|mp3|wav|m4a|aac|webm)(\?.*)?$/i);
      if (urlExtMatch && filename === "audio.ogg") {
        filename = `audio.${urlExtMatch[1].toLowerCase()}`;
      }
    } else if (input instanceof Blob) {
      const arrayBuf = await input.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuf);
    } else {
      rawBuffer = Buffer.from(input);
    }

    if (!rawBuffer || rawBuffer.length === 0) {
      console.warn("transcribeAudio: Buffer de áudio vazio.");
      return null;
    }

    const model = options?.model || "whisper-large-v3-turbo";
    const language = options?.language || "pt";

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(rawBuffer)], { type: mimeTypeFromFilename(filename) });
    formData.append("file", blob, filename);
    formData.append("model", model);
    formData.append("language", language);
    formData.append("response_format", "json");

    const response = await fetch(GROQ_AUDIO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`transcribeAudio: Erro da API do Groq (${response.status}): ${errText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as { text?: string };
    const text = String(data?.text || "").trim();

    if (!text) return null;

    return {
      text,
      provider: "Groq",
      model,
    };
  } catch (error) {
    console.error("transcribeAudio: Exceção durante transcrição:", error);
    return null;
  }
}

function mimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "opus":
    case "ogg":
      return "audio/ogg";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    default:
      return "audio/ogg";
  }
}
