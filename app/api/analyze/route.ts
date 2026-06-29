import { callProvider, DISABLED_PROVIDERS, isProvider, type StandardMessage } from "@/lib/providers";

const ENV_KEYS = {
  claude: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      provider?: unknown;
      model?: unknown;
      messages?: unknown;
      maxTokens?: unknown;
    } | null;

    if (!body || !isProvider(body.provider) || !Array.isArray(body.messages)) {
      return Response.json(
        { error: "provider와 messages가 필요합니다." },
        { status: 400 }
      );
    }

    if (DISABLED_PROVIDERS.includes(body.provider)) {
      return Response.json(
        { error: "Claude는 현재 비활성화되어 있습니다. OpenAI 또는 Gemini를 선택하세요." },
        { status: 403 }
      );
    }

    const apiKey =
      ENV_KEYS[body.provider]?.trim() || request.headers.get("x-provider-key")?.trim();

    if (!apiKey) {
      return Response.json(
        {
          error: `${body.provider} API 키가 없습니다. 서버 .env에 설정하거나 설정창에서 키를 입력하세요.`
        },
        { status: 401 }
      );
    }

    const requestedMaxTokens =
      typeof body.maxTokens === "number" && Number.isFinite(body.maxTokens)
        ? Math.round(body.maxTokens)
        : 4096;
    const maxTokens = Math.min(Math.max(requestedMaxTokens, 1024), 32000);

    const result = await callProvider(body.provider, {
      apiKey,
      maxTokens,
      messages: body.messages as StandardMessage[],
      model: typeof body.model === "string" ? body.model : undefined
    });

    if (!result.text) {
      return Response.json(
        {
          error: `모델이 빈 응답을 반환했습니다.${result.finishReason ? ` (${result.finishReason})` : ""}`,
          finishReason: result.finishReason,
          truncated: result.truncated
        },
        { status: 502 }
      );
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 요청에 실패했습니다.";
    console.error("[analyze]", message);
    return Response.json(
      { error: message },
      { status: 502 }
    );
  }
}
