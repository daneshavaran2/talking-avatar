'use client';

import { AvatarStage } from '@/components/avatar/AvatarStage';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import { StatusPill } from '@/components/ui/StatusPill';
import { AlertIcon, RefreshIcon } from '@/components/ui/icons';
import { useConversation } from '@/lib/client/store';
import { useConversationEngine } from '@/lib/client/use-conversation-engine';
import { TOOL_LABEL_BY_NAME } from '@/lib/tools/labels';

/**
 * تجربهٔ کامل مکالمه برای کاربر نهایی (§۴.۲).
 *
 * چیدمان: آواتار ستون اصلی است و گفتگو کنارش. در موبایل آواتار
 * بالا می‌آید و گفتگو زیرش — چون در صفحهٔ کوچک، دیدن چهره حین
 * تایپ کردن اهمیت کمتری دارد تا دیدن خود متن.
 */
export function ConversationExperience() {
  const { sendMessage, toggleMic, interrupt, resetConversation } = useConversationEngine();

  const state = useConversation((store) => store.state);
  const messages = useConversation((store) => store.messages);
  const liveText = useConversation((store) => store.liveText);
  const partialTranscript = useConversation((store) => store.partialTranscript);
  const micEnabled = useConversation((store) => store.micEnabled);
  const micError = useConversation((store) => store.micError);
  const error = useConversation((store) => store.error);
  const config = useConversation((store) => store.config);
  const toolActivity = useConversation((store) => store.toolActivity);

  const micAvailable = config?.speech.sttMode === 'browser';

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-content">
            {config?.businessName ?? 'دستیار دیجیتال'}
          </h1>
          <p className="mt-0.5 text-xs text-content-faint">دستیار دیجیتال — پاسخ‌گوی زنده</p>
        </div>

        <button
          type="button"
          onClick={() => void resetConversation()}
          className="btn-ghost h-9 px-3 text-xs"
          title="شروع گفتگوی تازه"
        >
          <RefreshIcon className="h-4 w-4" />
          گفتگوی جدید
        </button>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ── ستون آواتار ────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-4">
          <AvatarStage state={state} config={config} />

          <StatusPill state={state} />

          {/* زیرنویس هم‌زمان (§۴.۲) */}
          <div className="min-h-[3.5rem] w-full max-w-[22rem]">
            {liveText && (
              <p
                className="rounded-xl border border-line/70 bg-surface/70 px-4 py-3 text-center text-sm leading-7 text-content backdrop-blur"
                aria-live="polite"
              >
                {liveText}
              </p>
            )}

            {toolActivity && toolActivity.status === 'started' && (
              <p className="mt-2 text-center text-[11px] text-content-faint">
                در حال دریافت اطلاعات به‌روز از «
                {TOOL_LABEL_BY_NAME[toolActivity.name] ?? toolActivity.name}»…
              </p>
            )}
          </div>
        </section>

        {/* ── ستون گفتگو ─────────────────────────────────────── */}
        <section className="flex min-h-[24rem] flex-col panel p-4 lg:p-5">
          <div className="flex-1 overflow-y-auto pe-1">
            <MessageList messages={messages} partialTranscript={partialTranscript} />
          </div>

          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {(error || micError) && (
              <p className="flex items-start gap-2 rounded-lg bg-state-error/10 px-3 py-2 text-xs leading-relaxed text-state-error">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {error ?? micError}
              </p>
            )}

            {config && !config.speech.ttsAvailable && (
              <p className="text-[11px] text-content-faint">
                پاسخ‌ها به‌صورت متنی نمایش داده می‌شوند؛ صدای آواتار در این نصب پیکربندی نشده است.
              </p>
            )}

            <Composer
              state={state}
              micEnabled={micEnabled}
              micAvailable={micAvailable}
              onSend={(text) => void sendMessage(text, 'text')}
              onToggleMic={toggleMic}
              onInterrupt={() => interrupt()}
            />

            <p className="hint">
              گفتگوها برای بهبود کیفیت پاسخ‌گویی ذخیره می‌شوند.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
