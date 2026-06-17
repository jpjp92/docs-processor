import { DEFAULT_MODELS, DISABLED_PROVIDERS, type Provider } from "@/lib/providers";

const ENV_KEYS: Partial<Record<Provider, string | undefined>> = {
  claude: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
};

export async function GET() {
  return Response.json({
    providersWithServerKey: Object.entries(ENV_KEYS)
      .filter(([provider, value]) => !DISABLED_PROVIDERS.includes(provider as Provider) && Boolean(value?.trim()))
      .map(([provider]) => provider),
    disabledProviders: DISABLED_PROVIDERS,
    defaultModels: DEFAULT_MODELS
  });
}
