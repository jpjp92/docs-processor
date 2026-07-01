import { useState } from "react";

import { FALLBACK_PROVIDER, LOCAL_DISABLED_PROVIDERS } from "@/lib/pdf-workspace/constants";
import type { AiSettings, Provider } from "@/lib/pdf-workspace/types";

const INITIAL_AI: AiSettings = { provider: FALLBACK_PROVIDER, model: "" };

/** AI 프로바이더 설정과 설정 모달의 열림/저장 흐름을 관리한다. */
export function useAiSettings() {
  const [ai, setAi] = useState<AiSettings>(INITIAL_AI);
  const [draftAi, setDraftAi] = useState<AiSettings>(INITIAL_AI);
  const [serverKeyProviders, setServerKeyProviders] = useState<Provider[]>([]);
  const [disabledProviders, setDisabledProviders] = useState<Provider[]>(LOCAL_DISABLED_PROVIDERS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function openSettings() {
    let nextDisabledProviders = disabledProviders;
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const config = (await response.json()) as {
          disabledProviders?: Provider[];
          providersWithServerKey?: Provider[];
        };
        setServerKeyProviders(config.providersWithServerKey || []);
        nextDisabledProviders = config.disabledProviders || LOCAL_DISABLED_PROVIDERS;
        setDisabledProviders(nextDisabledProviders);
      }
    } catch {
      setServerKeyProviders([]);
      nextDisabledProviders = LOCAL_DISABLED_PROVIDERS;
      setDisabledProviders(nextDisabledProviders);
    }
    setDraftAi(nextDisabledProviders.includes(ai.provider) ? { ...ai, provider: FALLBACK_PROVIDER } : ai);
    setSettingsOpen(true);
  }

  function saveSettings() {
    setAi({
      ...draftAi,
      model: draftAi.model.trim()
    });
    setSettingsOpen(false);
  }

  const closeSettings = () => setSettingsOpen(false);

  return {
    ai,
    draftAi,
    setDraftAi,
    serverKeyProviders,
    disabledProviders,
    settingsOpen,
    openSettings,
    saveSettings,
    closeSettings
  };
}
