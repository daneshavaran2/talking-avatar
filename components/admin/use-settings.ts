'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BlockedCategory } from '@/lib/config/constants';

/** وضعیت مشترک تنظیمات برای پنل‌های مدیریتی. */

export type SettingsShape = {
  businessName: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  temperature: number;
  maxTokens: number;
  ragTopK: number;
  ragThreshold: number;
  blockedCategories: BlockedCategory[];
  refusalMessages: Record<string, string[]>;
  customBlockedKeywords: string[];
  enabledTools: string[];
  kioskResetSeconds: number;
  setupCompleted: boolean;
};

export type CapabilityReport = {
  llm: boolean;
  embedding: boolean;
  tts: boolean;
  stt: 'browser' | 'server' | 'off';
  avatar: boolean;
  livekit: boolean;
  tools: boolean;
};

export type ToolInfo = {
  name: string;
  label: string;
  description: string;
  timeoutMs: number;
};

export function useSettings() {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings');
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'خواندن تنظیمات ممکن نشد.');
        return;
      }

      const body = (await response.json()) as {
        settings: SettingsShape;
        capabilities: CapabilityReport;
        tools: ToolInfo[];
      };

      setSettings(body.settings);
      setCapabilities(body.capabilities);
      setTools(body.tools);
      setError(null);
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback((changes: Partial<SettingsShape>) => {
    setSaved(false);
    setSettings((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const save = useCallback(
    async (changes: Partial<SettingsShape>) => {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(changes),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? 'ذخیرهٔ تنظیمات ممکن نشد.');
          return false;
        }

        const body = (await response.json()) as { settings: SettingsShape };
        setSettings(body.settings);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
        return true;
      } catch {
        setError('ارتباط با سرور برقرار نشد.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { settings, capabilities, tools, loading, saving, saved, error, patch, save, reload: load };
}
