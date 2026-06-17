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
