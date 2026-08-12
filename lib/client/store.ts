'use client';

import { create } from 'zustand';
import type { ConversationState } from '@/lib/config/constants';

/**
 * وضعیت مرکزی مکالمه (Zustand).
 *
 * State Machine (§فاز ۱):
 *   idle → listening → thinking → speaking → idle
 *   هر کدام از این‌ها می‌تواند به interrupted یا error برود.
 *
 * نکتهٔ مهم: `speaking` وقتی فعال می‌شود که **صدا** شروع شود، نه
 * وقتی اولین توکن متن رسید (§فاز ۲). اگر TTS در دسترس نباشد، به
 * ناچار با شروع متن فعال می‌شود تا وضعیت با آنچه کاربر می‌بیند
 * هماهنگ بماند.
 */

export type ChatMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  refused?: boolean;
  refusalReason?: string;
  sources?: Array<{ title: string; page: number | null }>;
  pending?: boolean;
};

export type RuntimeConfig = {
  businessName: string;
  setupCompleted: boolean;
  kioskResetSeconds: number;
  knowledgeBaseReady: boolean;
  avatar: { imageUrl: string | null; idleLoopUrl: string | null; realtime: boolean };
  speech: { ttsAvailable: boolean; sttMode: 'browser' | 'server' | 'off' };
  livekit: boolean;
};

export type ToolActivity = { name: string; status: 'started' | 'success' | 'error' | 'timeout' };

type ConversationStore = {
  state: ConversationState;
  conversationId: string;
  turnId: string | null;
  messages: ChatMessageView[];
  /** متن در حال تولید آواتار — زیرنویس زنده */
  liveText: string;
  /** متن جزئی تشخیص گفتار کاربر */
  partialTranscript: string;
  micEnabled: boolean;
  micError: string | null;
  error: string | null;
  notice: string | null;
  config: RuntimeConfig | null;
  toolActivity: ToolActivity | null;

  setState: (state: ConversationState) => void;
  setConfig: (config: RuntimeConfig) => void;
  setConversationId: (id: string) => void;
  startTurn: (turnId: string, userText: string) => void;
  appendToken: (turnId: string, token: string) => void;
  setMeta: (turnId: string, meta: { sources?: Array<{ title: string; page: number | null }> }) => void;
  setToolActivity: (activity: ToolActivity | null) => void;
  markRefused: (turnId: string, reason: string) => void;
  finishTurn: (turnId: string) => void;
  abortTurn: () => void;
  setPartialTranscript: (text: string) => void;
  setMicEnabled: (enabled: boolean) => void;
  setMicError: (message: string | null) => void;
  setError: (message: string | null) => void;
  setNotice: (message: string | null) => void;
  reset: (conversationId: string) => void;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useConversation = create<ConversationStore>((set, get) => ({
  state: 'idle',
  conversationId: '',
  turnId: null,
  messages: [],
  liveText: '',
  partialTranscript: '',
  micEnabled: false,
  micError: null,
  error: null,
  notice: null,
  config: null,
  toolActivity: null,

  setState: (state) => set({ state }),
  setConfig: (config) => set({ config }),
  setConversationId: (conversationId) => set({ conversationId }),

  startTurn: (turnId, userText) =>
    set((store) => ({
      turnId,
      state: 'thinking',
      liveText: '',
      partialTranscript: '',
      error: null,
      toolActivity: null,
      messages: [
        ...store.messages,
        { id: newId(), role: 'user', content: userText },
        { id: turnId, role: 'assistant', content: '', pending: true },
      ],
    })),

  appendToken: (turnId, token) => {
    // توکن‌های نوبت منسوخ Drop می‌شوند (§F8.3).
    if (get().turnId !== turnId) return;
    set((store) => ({
      liveText: store.liveText + token,
      messages: store.messages.map((message) =>
        message.id === turnId ? { ...message, content: message.content + token } : message,
      ),
    }));
  },

  setMeta: (turnId, meta) => {
    if (get().turnId !== turnId) return;
    set((store) => ({
      messages: store.messages.map((message) =>
        message.id === turnId ? { ...message, sources: meta.sources } : message,
      ),
    }));
  },

  setToolActivity: (toolActivity) => set({ toolActivity }),

  markRefused: (turnId, reason) => {
    if (get().turnId !== turnId) return;
    set((store) => ({
      liveText: '',
      messages: store.messages.map((message) =>
        message.id === turnId
          ? { ...message, content: '', refused: true, refusalReason: reason }
          : message,
      ),
    }));
  },

  finishTurn: (turnId) => {
    if (get().turnId !== turnId) return;
    set((store) => ({
      state: 'idle',
      turnId: null,
      liveText: '',
      toolActivity: null,
      messages: store.messages.map((message) =>
        message.id === turnId ? { ...message, pending: false } : message,
      ),
    }));
  },

  abortTurn: () =>
    set((store) => ({
      state: 'interrupted',
      turnId: null,
      liveText: '',
      toolActivity: null,
      messages: store.messages
        .map((message) => (message.pending ? { ...message, pending: false } : message))
        // پاسخ‌های خالیِ نوبت قطع‌شده در تاریخچه نمی‌مانند.
        .filter((message) => message.role !== 'assistant' || message.content.trim().length > 0),
    })),

  setPartialTranscript: (partialTranscript) => set({ partialTranscript }),
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setMicError: (micError) => set({ micError }),
  setError: (error) => set({ error, state: error ? 'error' : 'idle' }),
  setNotice: (notice) => set({ notice }),

  reset: (conversationId) =>
    set({
      conversationId,
      state: 'idle',
      turnId: null,
      messages: [],
      liveText: '',
      partialTranscript: '',
      error: null,
      toolActivity: null,
    }),
}));

export { newId };
