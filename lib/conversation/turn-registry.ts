import 'server-only';

/**
 * ردیاب نوبت‌ها سمت سرور — قلب Barge-In (§F8).
 *
 * مسئله‌ای که حل می‌کند: وقتی کاربر وسط پاسخ حرف می‌زند، Turn جدیدی
 * شروع می‌شود. اما جریان LLM/TTS مربوط به Turn قبلی ممکن است چند
 * صد میلی‌ثانیه بعد هنوز داده تولید کند. آن داده‌ها **باید Drop
 * شوند** (F8.3)، نه اینکه به کاربر برسند.
 *
 * برای همین هر مکالمه دقیقاً یک Turn فعال دارد؛ ثبت Turn جدید،
 * AbortController نوبت قبلی را فوراً لغو می‌کند.
 *
 * محدودیت: این ردیاب در حافظهٔ فرآیند است. برای استقرار چند-نمونه‌ای
 * باید به Redis منتقل شود؛ در آن حالت کلید همان conversationId است.
 */

type TurnEntry = {
  turnId: string;
  controller: AbortController;
  startedAt: number;
};

const activeTurns = new Map<string, TurnEntry>();

/** پس از این مدت بی‌استفادگی، ورودی‌های رهاشده پاک‌سازی می‌شوند. */
const STALE_AFTER_MS = 10 * 60 * 1000;

export type RegisteredTurn = {
  turnId: string;
  signal: AbortSignal;
  /** آیا این Turn هنوز نوبت فعال مکالمه است؟ */
  isCurrent: () => boolean;
  /** پایان طبیعی نوبت. */
  release: () => void;
};

/**
 * ثبت یک نوبت جدید. نوبت قبلی همان مکالمه بلافاصله لغو می‌شود.
 */
export function registerTurn(conversationId: string, turnId: string): RegisteredTurn {
  sweep();

  const previous = activeTurns.get(conversationId);
  if (previous && previous.turnId !== turnId) {
    previous.controller.abort(new TurnInterruptedError(previous.turnId));
  }

  const controller = new AbortController();
  activeTurns.set(conversationId, { turnId, controller, startedAt: Date.now() });

  return {
    turnId,
    signal: controller.signal,
    isCurrent: () => activeTurns.get(conversationId)?.turnId === turnId,
    release: () => {
      const current = activeTurns.get(conversationId);
      if (current?.turnId === turnId) activeTurns.delete(conversationId);
    },
  };
}

/**
 * لغو صریح نوبت فعال — وقتی کلاینت اعلام Barge-In می‌کند.
 * برمی‌گرداند: شناسهٔ نوبتی که لغو شد (اگر نوبتی فعال بود).
 */
export function interruptTurn(conversationId: string, reason = 'barge-in'): string | null {
  const current = activeTurns.get(conversationId);
  if (!current) return null;

  current.controller.abort(new TurnInterruptedError(current.turnId, reason));
  activeTurns.delete(conversationId);
  return current.turnId;
}

export function currentTurnId(conversationId: string): string | null {
  return activeTurns.get(conversationId)?.turnId ?? null;
}

export class TurnInterruptedError extends Error {
  readonly turnId: string;
  readonly reason: string;

  constructor(turnId: string, reason = 'superseded') {
    super(`نوبت ${turnId} لغو شد (${reason})`);
    this.name = 'TurnInterruptedError';
    this.turnId = turnId;
    this.reason = reason;
  }
}

function sweep(): void {
  const cutoff = Date.now() - STALE_AFTER_MS;
  for (const [conversationId, entry] of activeTurns) {
    if (entry.startedAt < cutoff) {
      entry.controller.abort(new TurnInterruptedError(entry.turnId, 'stale'));
      activeTurns.delete(conversationId);
    }
  }
}
