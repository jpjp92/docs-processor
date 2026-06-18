export type Provider = "claude" | "openai" | "gemini";

export type StandardContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string };

export type StandardMessage = {
  role: "user" | "assistant";
  content: StandardContentPart[];
};

type ProviderOptions = {
  messages: StandardMessage[];
  model?: string;
  apiKey: string;
  maxTokens?: number;
};

export type ProviderResult = {
  text: string;
  finishReason?: string;
  truncated?: boolean;
};

export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-5-mini",
  gemini: "gemini-2.5-flash"
};

export const DISABLED_PROVIDERS: Provider[] = ["claude"];

export function isProvider(value: unknown): value is Provider {
  return value === "claude" || value === "openai" || value === "gemini";
}

async function callClaude({ messages, model, apiKey, maxTokens }: ProviderOptions) {
  const body = {
    model: model || DEFAULT_MODELS.claude,
    max_tokens: maxTokens || 4096,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content.map((part) =>
        part.type === "image"
          ? {
              type: "image",
              source: {
                type: "base64",
                media_type: part.mediaType,
                data: part.data
              }
            }
          : { type: "text", text: part.text }
      )
    }))
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text || "")
    .join("\n")
    .trim();

  return {
    text,
    finishReason: data.stop_reason,
    truncated: data.stop_reason === "max_tokens"
  };
}

async function callOpenAI({ messages, model, apiKey, maxTokens }: ProviderOptions) {
  const selectedModel = model || DEFAULT_MODELS.openai;
  const tokenLimit = maxTokens || 4096;
  const body = {
    model: selectedModel,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content.map((part) =>
        part.type === "image"
          ? {
              type: "image_url",
              image_url: {
                url: `data:${part.mediaType};base64,${part.data}`
              }
            }
          : { type: "text", text: part.text }
      )
    }))
  };

  const requestBody =
    selectedModel.startsWith("gpt-5")
      ? { ...body, max_completion_tokens: tokenLimit }
      : { ...body, max_tokens: tokenLimit };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  return {
    text: (data.choices?.[0]?.message?.content || "").trim(),
    finishReason,
    truncated: finishReason === "length"
  };
}

async function callGemini({ messages, model, apiKey, maxTokens }: ProviderOptions) {
  const selectedModel = model || DEFAULT_MODELS.gemini;
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: message.content.map((part) =>
      part.type === "image"
        ? { inlineData: { mimeType: part.mediaType, data: part.data } }
        : { text: part.text }
    )
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens || 4096 }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();

  return {
    text,
    finishReason: candidate?.finishReason,
    truncated: candidate?.finishReason === "MAX_TOKENS"
  };
}

const ADAPTERS = {
  claude: callClaude,
  openai: callOpenAI,
  gemini: callGemini
};

export function callProvider(provider: Provider, options: ProviderOptions): Promise<ProviderResult> {
  return ADAPTERS[provider](options);
}

/** SSE 응답 본문을 `data:` JSON 페이로드 단위로 순회한다. */
async function* iterateSse(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload && payload !== "[DONE]") yield payload;
    }
  }
}

async function* streamOpenAI({ messages, model, apiKey, maxTokens }: ProviderOptions): AsyncGenerator<string> {
  const selectedModel = model || DEFAULT_MODELS.openai;
  const tokenLimit = maxTokens || 4096;
  const base = {
    model: selectedModel,
    stream: true,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content.map((part) =>
        part.type === "image"
          ? { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
          : { type: "text", text: part.text }
      )
    }))
  };
  const requestBody = selectedModel.startsWith("gpt-5")
    ? { ...base, max_completion_tokens: tokenLimit }
    : { ...base, max_tokens: tokenLimit };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

  for await (const payload of iterateSse(response)) {
    try {
      const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
      if (delta) yield delta as string;
    } catch {
      // 부분 페이로드는 건너뛴다.
    }
  }
}

async function* streamGemini({ messages, model, apiKey, maxTokens }: ProviderOptions): AsyncGenerator<string> {
  const selectedModel = model || DEFAULT_MODELS.gemini;
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: message.content.map((part) =>
      part.type === "image" ? { inlineData: { mimeType: part.mediaType, data: part.data } } : { text: part.text }
    )
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens || 4096 } })
    }
  );
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);

  for await (const payload of iterateSse(response)) {
    try {
      const parts = JSON.parse(payload)?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part?.text) yield part.text as string;
      }
    } catch {
      // 부분 페이로드는 건너뛴다.
    }
  }
}

const STREAM_ADAPTERS: Partial<Record<Provider, (options: ProviderOptions) => AsyncGenerator<string>>> = {
  openai: streamOpenAI,
  gemini: streamGemini
};

export function streamProvider(provider: Provider, options: ProviderOptions): AsyncGenerator<string> {
  const adapter = STREAM_ADAPTERS[provider];
  if (!adapter) throw new Error(`${provider}는 스트리밍을 지원하지 않습니다.`);
  return adapter(options);
}
