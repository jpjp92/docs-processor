import {
  DEFAULT_MODELS,
  DISABLED_PROVIDERS,
  isProvider,
  streamProvider,
  type Provider
} from "@/lib/providers";
import { buildSummaryMessages, MAX_INPUT_CHARS } from "@/lib/summarize";

export const runtime = "nodejs";

const ENV_KEYS: Record<Provider, string | undefined> = {
  claude: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    model?: unknown;
    text?: unknown;
  } | null;

  // 요약은 Gemini Flash를 기본으로 한다(롱컨텍스트 + 저비용).
  const provider: Provider = isProvider(body?.provider) ? body!.provider : "gemini";

  if (DISABLED_PROVIDERS.includes(provider)) {
    return Response.json({ error: `${provider}는 현재 비활성화되어 있습니다.` }, { status: 403 });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ error: "요약할 본문(text)이 필요합니다." }, { status: 400 });
  }

  if (text.length > MAX_INPUT_CHARS) {
    return Response.json(
      {
        error: "문서가 너무 깁니다. 병렬 Map-Reduce 요약(Phase 2)이 필요합니다.",
        reason: "INPUT_TOO_LONG",
        length: text.length,
        limit: MAX_INPUT_CHARS
      },
      { status: 413 }
    );
  }

  const apiKey = ENV_KEYS[provider]?.trim();
  if (!apiKey) {
    return Response.json({ error: `${provider} API 키가 없습니다.` }, { status: 401 });
  }

  const model = typeof body?.model === "string" ? body.model : DEFAULT_MODELS[provider];
  const messages = buildSummaryMessages(text);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamProvider(provider, { apiKey, maxTokens: 2048, messages, model })) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        console.error("[summarize]", error instanceof Error ? error.name : "UnknownError");
        controller.enqueue(encoder.encode("\nOVERVIEW: 요약 생성에 실패했습니다. 모델/키 설정을 확인하세요."));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
