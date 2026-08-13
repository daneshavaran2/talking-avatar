'use client';

import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';

import { AvatarStage } from '@/components/avatar/AvatarStage';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import { StatusPill } from '@/components/chat/StatusPill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useConversation } from '@/lib/client/store';
import { useConversationEngine } from '@/lib/client/use-conversation-engine';
import { TOOL_LABEL_BY_NAME } from '@/lib/tools/labels';

/**
 * تجربهٔ کامل مکالمه برای کاربر نهایی (§۴.۲).
 *
 * چیدمان: آواتار ستون اصلی است و گفتگو کنارش. در موبایل آواتار
 * بالا می‌آید و گفتگو زیرش.
 */
export function ConversationExperience() {
  const { sendMessage, toggleMic, interrupt, resetConversation, audio } = useConversationEngine();

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
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">
            {config?.businessName ?? 'دستیار دیجیتال'}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">دستیار دیجیتال — پاسخ‌گوی زنده</p>
        </div>

        <Button variant="outline" size="sm" onClick={() => void resetConversation()}>
          <RotateCcwIcon />
          گفتگوی جدید
        </Button>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <section className="flex flex-col items-center gap-4">
          <AvatarStage state={state} config={config} audio={audio} />

          <StatusPill state={state} />

          {/* زیرنویس هم‌زمان (§۴.۲) */}
          <div className="min-h-14 w-full max-w-80">
            {liveText && (
              <p
                className="rounded-xl border bg-card/70 px-4 py-3 text-center text-sm leading-7 backdrop-blur"
                aria-live="polite"
              >
                {liveText}
              </p>
            )}

            {toolActivity?.status === 'started' && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                در حال دریافت اطلاعات به‌روز از «
                {TOOL_LABEL_BY_NAME[toolActivity.name] ?? toolActivity.name}»…
              </p>
            )}
          </div>
        </section>

        <Card className="flex min-h-96 flex-col p-4 lg:p-5">
          <div className="flex flex-1 flex-col overflow-y-auto pe-1">
            <MessageList messages={messages} partialTranscript={partialTranscript} />
          </div>

          <Separator className="my-4" />

          <div className="flex flex-col gap-3">
            {(error || micError) && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertDescription>{error ?? micError}</AlertDescription>
              </Alert>
            )}

            {config && !config.speech.ttsAvailable && (
              <p className="text-[11px] text-muted-foreground">
                پاسخ‌ها به‌صورت متنی نمایش داده می‌شوند؛ صدای آواتار در این نصب پیکربندی نشده و
                به همین دلیل لیپ‌سینک هم اجرا نمی‌شود.
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

            <p className="text-[11px] text-muted-foreground">
              گفتگوها برای بهبود کیفیت پاسخ‌گویی ذخیره می‌شوند.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
