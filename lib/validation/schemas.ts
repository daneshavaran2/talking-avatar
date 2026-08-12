import { z } from 'zod';
import { BLOCKED_CATEGORIES } from '@/lib/config/constants';

/**
 * اعتبارسنجی تمام ورودی‌های API با Zod (§۹.۳).
 * هیچ Route Handler‌ی نباید بدنهٔ درخواست را بدون عبور از اینجا باور کند.
 */

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid(),
  turnId: z.string().uuid(),
  message: z.string().trim().min(1, 'پیام خالی است.').max(4000, 'پیام بیش از حد طولانی است.'),
  inputType: z.enum(['text', 'voice']).default('text'),
  /** زمان تشخیص شروع صحبت — برای محاسبهٔ تأخیر End-to-End (§۱۰.۱) */
  vadStartAt: z.number().int().positive().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const resetConversationSchema = z.object({
  conversationId: z.string().uuid().optional(),
});

export const interruptSchema = z.object({
  conversationId: z.string().uuid(),
});

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  turnId: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('ایمیل معتبر نیست.'),
  password: z.string().min(8, 'رمز عبور حداقل ۸ کاراکتر است.'),
});

export const voiceTestSchema = z.object({
  text: z.string().trim().min(1).max(300),
});

export const ragTestSchema = z.object({
  question: z.string().trim().min(2).max(500),
});

export const settingsUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(120).optional(),
  systemPrompt: z.string().trim().min(20).max(8000).optional(),
  llmProvider: z.enum(['gemini', 'groq', 'openai', 'anthropic', 'ollama']).optional(),
  llmModel: z.string().trim().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(8192).optional(),
  ragTopK: z.number().int().min(1).max(20).optional(),
  ragThreshold: z.number().min(0).max(1).optional(),
  blockedCategories: z.array(z.enum(BLOCKED_CATEGORIES)).optional(),
  refusalMessages: z.record(z.string(), z.array(z.string().trim().min(1).max(500))).optional(),
  customBlockedKeywords: z.array(z.string().trim().min(2).max(80)).max(200).optional(),
  enabledTools: z.array(z.string().trim().min(1).max(60)).optional(),
  kioskResetSeconds: z.number().int().min(15).max(1800).optional(),
  setupCompleted: z.boolean().optional(),
});

export const conversationQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  topic: z.string().trim().max(40).optional(),
  search: z.string().trim().max(200).optional(),
  inputType: z.enum(['text', 'voice']).optional(),
  refusedOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const voiceConsentSchema = z.object({
  consent: z.literal('true', {
    errorMap: () => ({ message: 'تأیید مالکیت صدا الزامی است.' }),
  }),
});
