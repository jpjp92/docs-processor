import { DEFAULT_MODELS, type Provider } from "@/lib/providers";

const ENV_KEYS: Partial<Record<Provider, string | undefined>> = {
  claude: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
};

export async function GET() {
  return Response.json({
    providersWithServerKey: Object.entries(ENV_KEYS)
      .filter(([, value]) => Boolean(value?.trim()))
      .map(([provider]) => provider),
    defaultModels: DEFAULT_MODELS
  });
}
