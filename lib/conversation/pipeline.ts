import 'server-only';
import { Prisma, type Settings } from '@prisma/client';
import type { ChatMessage, LLMProvider, ToolProvider } from '@/lib/ai/types';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { createLLMProvider } from '@/lib/ai/factory';
import { createToolProvider } from '@/lib/tools/n8n';
import { prisma } from '@/lib/db/client';
import { getSettings } from '@/lib/db/settings';
import { screenInput, screenOutput } from '@/lib/guardrails';
import { classifyTopic, dominantTopic } from '@/lib/analytics/topics';
import { logServiceError } from '@/lib/observability/log';
import { retrieve, recordUnanswered, type RetrievalResult } from '@/lib/rag/retrieve';
import { buildSystemPrompt } from '@/lib/conversation/prompt';
import { loadMemory, maybeUpdateSummary, memoryToMessages } from '@/lib/conversation/memory';
import { SentenceSplitter } from '@/lib/conversation/sentence-splitter';
import { registerTurn, TurnInterruptedError } from '@/lib/conversation/turn-registry';
import type { SseWriter } from '@/lib/http/sse';
import type { ChatRequest } from '@/lib/validation/schemas';
import { OUT_OF_SCOPE_MESSAGE } from '@/lib/config/constants';

/**
 * اجرای یک نوبت کامل مکالمه.
 *
 * ترتیب (مطابق §۴.۲):
 *   Guardrail لایه ۱ → RAG → ابزار خارجی (در صورت نیاز) →
 *   تولید جریانی پاسخ → Guardrail لایه ۳ روی هر جمله → TTS
 *
 * قاعدهٔ حاکم بر کل این تابع: **هرگز منتظر تکمیل کل پاسخ نمی‌مانیم.**
 * هر جمله به‌محض کامل شدن با رویداد `sentence` بیرون می‌رود تا
 * کلاینت بتواند فوراً آن را به TTS بدهد (§F6.4 و §۱۰.۱).
 */

/** بیشینهٔ دور فراخوانی ابزار — بدون سقف، مدل می‌تواند در حلقه بیفتد. */
const MAX_TOOL_ROUNDS = 1;

export async function runTurn(request: ChatRequest, writer: SseWriter): Promise<void> {
  const { conversationId, turnId, message, inputType } = request;
  const startedAt = Date.now();

  // ثبت نوبت — نوبت قبلی همین مکالمه فوراً لغو می‌شود (§F8).
  const turn = registerTurn(conversationId, turnId);
  const { signal } = turn;

  /** هر رویدادی که به نوبت منسوخ تعلق دارد Drop می‌شود (F8.3). */
  const emit: SseWriter['send'] = (event) => {
    if (!turn.isCurrent() || signal.aborted) return;
    writer.send(event);
  };

  let settings: Settings;
  try {
    settings = await getSettings();
  } catch (error) {
    await logServiceError(
      'llm',
      'خواندن تنظیمات شکست خورد',
      error instanceof Error ? error.message : String(error),
      turnId,
    );
    writer.send({ event: 'error', data: { turnId, error: 'تنظیمات سیستم در دسترس نیست.' } });
    turn.release();
    return;
  }

  await ensureConversation(conversationId, inputType);

  const turnRow = await prisma.turn
    .create({
      data: {
        id: turnId,
        conversationId,
        inputType,
        status: 'active',
        vadStartAt: request.vadStartAt ? new Date(request.vadStartAt) : null,
        sttEndAt: inputType === 'voice' ? new Date() : null,
      },
      select: { id: true },
    })
    .catch(() => null);

  const topic = classifyTopic(message);
  const screening = screenInput(message, settings);

  await prisma.message.create({
    data: {
      conversationId,
      turnId,
      role: 'user',
      content: message,
      inputType,
      topic,
      injectionFlag: screening.injectionSuspected,
    },
  });

  // ── لایه ۱: امتناع پیش از فراخوانی مدل ───────────────────────
  if (screening.blocked) {
    emit({ event: 'refused', data: { turnId, reason: screening.category, layer: 'pre' } });

    // متن اول می‌رود تا زیرنویس بلافاصله دیده شود، بعد جمله‌ها برای TTS.
    // هر جمله شمارهٔ ترتیبی خودش را دارد وگرنه صف صدا نمی‌داند کدام
    // جمله اول پخش شود.
    emit({ event: 'token', data: { turnId, token: screening.message } });

    splitForSpeech(screening.message).forEach((sentence, index) => {
      emit({ event: 'sentence', data: { turnId, sentence, index } });
    });

    await persistAssistantMessage({
      conversationId,
      turnId,
      content: screening.message,
      topic,
      latencyMs: Date.now() - startedAt,
      refusal: { reason: screening.category, layer: 'pre' },
    });

    await finishTurn(turnRow?.id, 'completed');
    emit({ event: 'done', data: { turnId, latencyMs: Date.now() - startedAt } });
    writer.close();
    turn.release();
    return;
  }

  // ── ساخت Provider ────────────────────────────────────────────
  let llm: LLMProvider;
  try {
    llm = createLLMProvider({ provider: settings.llmProvider, model: settings.llmModel });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await logServiceError('llm', 'ساخت Provider مدل زبانی شکست خورد', detail, turnId);
    writer.send({
      event: 'error',
      data: {
        turnId,
        error:
          error instanceof ProviderNotConfiguredError
            ? 'مدل زبانی هنوز پیکربندی نشده است. مدیر باید آن را در تنظیمات فعال کند.'
            : 'ارتباط با مدل زبانی برقرار نشد. لطفاً دوباره تلاش کنید.',
      },
    });
    await finishTurn(turnRow?.id, 'error');
    writer.close();
    turn.release();
    return;
  }

  let tools: ToolProvider;
  try {
    tools = createToolProvider(settings.enabledTools);
  } catch (error) {
    await logServiceError(
      'tool',
      'ساخت Provider ابزارها شکست خورد',
      error instanceof Error ? error.message : String(error),
      turnId,
    );
    tools = createToolProvider([]);
  }

  // ── RAG ──────────────────────────────────────────────────────
  let retrieval: RetrievalResult = {
    hasKnowledgeBase: false,
    matches: [],
    context: '',
    sources: [],
  };
  try {
    retrieval = await retrieve(message, settings, signal);
  } catch {
    // retrieve خودش لاگ می‌کند و نتیجهٔ خالی برمی‌گرداند؛ اینجا فقط
    // مطمئن می‌شویم مکالمه ادامه پیدا کند (§۱۲.۱).
  }

  if (signal.aborted) return abortAndClose(writer, turnId, turnRow?.id, turn.release);

  const toolSchemas = tools.listTools();
  const systemPrompt = buildSystemPrompt({
    settings,
    retrieval,
    injectionSuspected: screening.injectionSuspected,
    hasTools: toolSchemas.length > 0,
  });

  const memory = await loadMemory(conversationId);
  const history = memoryToMessages(memory).filter((m) => m.role !== 'system');
  const conversationMessages: ChatMessage[] = [...history, { role: 'user', content: message }];

  emit({
    event: 'meta',
    data: {
      turnId,
      ragUsed: retrieval.matches.length > 0,
      sources: retrieval.sources,
      topic,
    },
  });

  await touchTurn(turnRow?.id, { llmStartAt: new Date() });

  // ── تولید پاسخ ───────────────────────────────────────────────
  const splitter = new SentenceSplitter();
  let sentenceIndex = 0;
  let fullText = '';
  let firstTokenAt: Date | null = null;
  let refusedByOutputLayer: { reason: string } | null = null;

  /** جمله را پیش از رسیدن به TTS از لایه ۳ عبور می‌دهد (§۷.۳). */
  const emitSentence = (sentence: string): boolean => {
    const outputCheck = screenOutput(sentence, settings);
    if (outputCheck.blocked) {
      refusedByOutputLayer = { reason: outputCheck.category };
      emit({ event: 'refused', data: { turnId, reason: outputCheck.category, layer: 'post' } });
      emit({ event: 'sentence', data: { turnId, sentence: outputCheck.message, index: 0 } });
      fullText = outputCheck.message;
      return false;
    }

    if (sentenceIndex === 0) void touchTurn(turnRow?.id, { ttsStartAt: new Date() });
    emit({ event: 'sentence', data: { turnId, sentence, index: sentenceIndex } });
    sentenceIndex += 1;
    return true;
  };

  try {
    let messagesForModel = conversationMessages;
    let round = 0;
    let keepGoing = true;

    while (keepGoing && round <= MAX_TOOL_ROUNDS) {
      const pendingToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> =
        [];

      for await (const chunk of llm.stream(messagesForModel, {
        systemPrompt,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        tools: round === 0 ? toolSchemas : undefined,
        signal,
      })) {
        if (signal.aborted || !turn.isCurrent()) {
          return abortAndClose(writer, turnId, turnRow?.id, turn.release);
        }

        if (chunk.type === 'text') {
          if (!firstTokenAt) {
            firstTokenAt = new Date();
            void touchTurn(turnRow?.id, { firstTokenAt });
          }

          fullText += chunk.text;
          emit({ event: 'token', data: { turnId, token: chunk.text } });

          for (const sentence of splitter.push(chunk.text)) {
            if (!emitSentence(sentence)) break;
          }
          if (refusedByOutputLayer) break;
        } else if (chunk.type === 'tool_call') {
          pendingToolCalls.push({ id: chunk.id, name: chunk.name, args: chunk.arguments });
        }
      }

      if (refusedByOutputLayer) break;

      if (pendingToolCalls.length === 0 || round >= MAX_TOOL_ROUNDS) {
        keepGoing = false;
        break;
      }

      // ── فراخوانی ابزارها و دور دوم تولید (§F9) ────────────────
      const toolMessages: ChatMessage[] = [];

      for (const call of pendingToolCalls) {
        emit({ event: 'tool_call', data: { turnId, name: call.name, status: 'started' } });
        const calledAt = Date.now();
        const result = await tools.execute(call.name, call.args, signal);
        const latencyMs = Date.now() - calledAt;

        await prisma.toolCall
          .create({
            data: {
              conversationId,
              turnId,
              name: call.name,
              argumentsJson: call.args as Prisma.InputJsonValue,
              resultJson:
                result.data === undefined || result.data === null
                  ? Prisma.JsonNull
                  : (result.data as Prisma.InputJsonValue),
              status: result.ok ? 'success' : result.timedOut ? 'timeout' : 'error',
              errorMessage: result.error?.slice(0, 500),
              latencyMs,
            },
          })
          .catch(() => null);

        emit({
          event: 'tool_call',
          data: {
            turnId,
            name: call.name,
            status: result.ok ? 'success' : result.timedOut ? 'timeout' : 'error',
          },
        });

        toolMessages.push({
          role: 'tool',
          toolName: call.name,
          toolCallId: call.id,
          content: result.ok
            ? JSON.stringify(result.data ?? {})
            : `خطا: ${result.error ?? 'ابزار پاسخ نداد.'}`,
        });
      }

      messagesForModel = [...messagesForModel, ...toolMessages];
      round += 1;
    }

    // باقی‌ماندهٔ بافر جمله‌ساز
    if (!refusedByOutputLayer) {
      const tail = splitter.flush();
      if (tail) emitSentence(tail);
    }

    const finalText = fullText.trim();

    // پاسخ خالی: مدل چیزی تولید نکرد — صادقانه اعلام می‌کنیم.
    if (!finalText) {
      const fallback = OUT_OF_SCOPE_MESSAGE;
      fullText = fallback;
      emit({ event: 'token', data: { turnId, token: fallback } });
      emit({ event: 'sentence', data: { turnId, sentence: fallback, index: sentenceIndex } });
    }

    // سؤال بی‌پاسخ: پایگاه دانش داشتیم ولی چیزی بالای آستانه نبود.
    if (retrieval.hasKnowledgeBase && retrieval.matches.length === 0 && !refusedByOutputLayer) {
      await recordUnanswered(message);
    }

    const latencyMs = Date.now() - startedAt;
    const refusal = refusedByOutputLayer as { reason: string } | null;

    await persistAssistantMessage({
      conversationId,
      turnId,
      content: fullText,
      topic,
      latencyMs,
      ragUsed: retrieval.matches.length > 0,
      ragChunkIds: retrieval.matches.map((m) => m.id),
      refusal: refusal ? { reason: refusal.reason, layer: 'post' } : undefined,
    });

    await finishTurn(turnRow?.id, 'completed');
    await updateConversationTopic(conversationId);

    emit({ event: 'done', data: { turnId, latencyMs } });
    writer.close();

    // خلاصه‌سازی حافظه پس از بسته شدن پاسخ انجام می‌شود تا روی
    // تأخیر مکالمه اثری نگذارد.
    const count = await prisma.message.count({ where: { conversationId } });
    void maybeUpdateSummary(conversationId, llm, count);
  } catch (error) {
    if (isAbort(error) || signal.aborted) {
      return abortAndClose(writer, turnId, turnRow?.id, turn.release);
    }

    await logServiceError(
      'llm',
      'تولید پاسخ شکست خورد',
      error instanceof Error ? error.message : String(error),
      turnId,
    );

    writer.send({
      event: 'error',
      data: { turnId, error: 'مشکلی در تولید پاسخ پیش آمد. لطفاً دوباره بپرسید.' },
    });
    await finishTurn(turnRow?.id, 'error');
    writer.close();
  } finally {
    turn.release();
  }
}

// ── کمکی‌ها ────────────────────────────────────────────────────

function isAbort(error: unknown): boolean {
  if (error instanceof TurnInterruptedError) return true;
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function abortAndClose(
  writer: SseWriter,
  turnId: string,
  turnRowId: string | undefined,
  release: () => void,
): void {
  writer.send({ event: 'aborted', data: { turnId, reason: 'barge-in' } });
  writer.close();
  void finishTurn(turnRowId, 'interrupted');
  release();
}

async function ensureConversation(conversationId: string, inputType: string): Promise<void> {
  const existing = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { inputMode: true },
  });

  if (!existing) {
    await prisma.conversation
      .create({ data: { id: conversationId, inputMode: inputType } })
      .catch(() => null);
    return;
  }

  if (existing.inputMode && existing.inputMode !== inputType && existing.inputMode !== 'mixed') {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { inputMode: 'mixed' },
    });
  }
}

async function persistAssistantMessage(options: {
  conversationId: string;
  turnId: string;
  content: string;
  topic: string;
  latencyMs: number;
  ragUsed?: boolean;
  ragChunkIds?: string[];
  refusal?: { reason: string; layer: 'pre' | 'post' };
}): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId: options.conversationId,
      turnId: options.turnId,
      role: 'assistant',
      content: options.content,
      inputType: 'text',
      topic: options.topic,
      latencyMs: options.latencyMs,
      ragUsed: options.ragUsed ?? false,
      ragChunkIds: options.ragChunkIds ?? [],
      wasRefused: Boolean(options.refusal),
      refusalReason: options.refusal?.reason,
      refusalLayer: options.refusal?.layer,
    },
  });

  await prisma.conversation.update({
    where: { id: options.conversationId },
    data: { messageCount: { increment: 2 } },
  });
}

async function touchTurn(
  turnId: string | undefined,
  data: Record<string, Date | string>,
): Promise<void> {
  if (!turnId) return;
  await prisma.turn.update({ where: { id: turnId }, data }).catch(() => null);
}

async function finishTurn(
  turnId: string | undefined,
  status: 'completed' | 'interrupted' | 'error',
): Promise<void> {
  if (!turnId) return;
  await prisma.turn
    .update({ where: { id: turnId }, data: { status, completedAt: new Date() } })
    .catch(() => null);
}

async function updateConversationTopic(conversationId: string): Promise<void> {
  const rows = await prisma.message.findMany({
    where: { conversationId, role: 'user' },
    select: { topic: true },
    take: 50,
  });

  await prisma.conversation
    .update({
      where: { id: conversationId },
      data: { topic: dominantTopic(rows.map((r) => r.topic)) },
    })
    .catch(() => null);
}

/** پیام امتناع را برای TTS به جمله‌های کوتاه می‌شکند. */
function splitForSpeech(text: string): string[] {
  const splitter = new SentenceSplitter();
  const sentences = splitter.push(text);
  const tail = splitter.flush();
  if (tail) sentences.push(tail);
  return sentences.length > 0 ? sentences : [text];
}
