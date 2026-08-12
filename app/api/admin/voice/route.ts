import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { RATE_LIMITS, UPLOAD_LIMITS } from '@/lib/config/constants';
import { requireAdminApi } from '@/lib/auth/guard';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { createTTSProvider } from '@/lib/speech/factory';
import { prisma } from '@/lib/db/client';
import { badRequest, notImplemented, serverError, tooManyRequests } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { logServiceError } from '@/lib/observability/log';
import { saveFile } from '@/lib/storage/files';

export const runtime = 'nodejs';

/** `GET /api/admin/voice` — وضعیت پروفایل صوتی فعال. */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const profile = await prisma.voiceProfile.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      providerName: true,
      consentConfirmed: true,
      consentAt: true,
      updatedAt: true,
    },
  });

  let ttsConfigured = true;
  try {
    createTTSProvider();
  } catch {
    ttsConfigured = false;
  }

  return NextResponse.json({ profile, ttsConfigured });
}

/**
 * `POST /api/admin/voice` — آپلود نمونهٔ صدا و ساخت Voice Clone (§F2).
 *
 * الزام حقوقی (§۱۱.۳): تأیید مالکیت صدا اجباری است و با زمان،
 * شناسهٔ کاربر و آدرس IP ثبت می‌شود. بدون این تأیید، هیچ Clone‌ای
 * ساخته نمی‌شود.
 *
 * الزام عملکردی (F2.4/F2.5): Clone دقیقاً یک‌بار انجام می‌شود و
 * شناسهٔ حاصل در پایگاه داده Cache می‌شود. مسیر پاسخ‌دهی هرگز
 * دوباره Clone نمی‌کند.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(clientKey(request, 'upload'), RATE_LIMITS.upload);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('فرم آپلود نامعتبر است.');
  }

  if (form.get('consent') !== 'true') {
    return badRequest(
      'برای ساخت صدای اختصاصی، تأیید مالکیت صدا یا داشتن رضایت کتبی صاحب صدا الزامی است.',
      'consent_required',
    );
  }

  const file = form.get('audio');
  if (!(file instanceof File)) return badRequest('فایل صوتی ارسال نشده است.');

  const limits = UPLOAD_LIMITS.voiceSample;
  if (file.size > limits.maxBytes) {
    return badRequest(`حجم فایل بیش از حد مجاز است. ${limits.label}`);
  }
  if (!limits.mimeTypes.includes(file.type as (typeof limits.mimeTypes)[number])) {
    return badRequest(`فرمت فایل پشتیبانی نمی‌شود. ${limits.label}`);
  }

  let provider;
  try {
    provider = createTTSProvider();
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return notImplemented(
        'tts',
        'سرویس صدا پیکربندی نشده است. ابتدا TTS_PROVIDER و کلید آن را تنظیم کنید.',
      );
    }
    return serverError();
  }

  if (!provider.supportsCloning || !provider.cloneVoice) {
    return notImplemented('tts', 'سرویس صدای فعلی از ساخت صدای اختصاصی پشتیبانی نمی‌کند.');
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const stored = await saveFile('voices', data, file.name, file.type);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;

  const profile = await prisma.voiceProfile.create({
    data: {
      sourceAudioUrl: stored.url,
      status: 'processing',
      providerName: provider.name,
      consentConfirmed: true,
      consentAt: new Date(),
      consentIp: ip,
      consentUserId: auth.session.userId,
      isActive: true,
    },
  });

  await prisma.voiceProfile.updateMany({
    where: { isActive: true, id: { not: profile.id } },
    data: { isActive: false },
  });

  try {
    const { voiceId } = await provider.cloneVoice({
      data,
      fileName: file.name,
      mimeType: file.type,
      displayName: 'صدای آواتار',
    });

    const ready = await prisma.voiceProfile.update({
      where: { id: profile.id },
      data: { status: 'ready', providerVoiceId: voiceId, errorMessage: null },
      select: { id: true, status: true, providerName: true, consentAt: true },
    });

    return NextResponse.json({ profile: ready });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logServiceError('tts', 'ساخت صدای اختصاصی شکست خورد', message);

    await prisma.voiceProfile.update({
      where: { id: profile.id },
      data: { status: 'error', errorMessage: message.slice(0, 500) },
    });

    return serverError('ساخت صدای اختصاصی شکست خورد. کیفیت نمونه و اعتبار کلید سرویس را بررسی کنید.');
  }
}
