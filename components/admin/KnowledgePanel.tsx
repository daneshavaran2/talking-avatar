'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Card, Spinner, StatusBadge } from '@/components/admin/ui';
import { RefreshIcon, TrashIcon } from '@/components/ui/icons';

/**
 * مدیریت پایگاه دانش (§F3).
 *
 * وضعیت اسناد در حال پردازش زنده به‌روز می‌شود (F3.5) — بدون آن،
 * مدیر نمی‌داند ایندکس تمام شده یا گیر کرده.
 */

type DocumentRow = {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  status: string;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number;
  byteSize: number | null;
  indexedAt: string | null;
  createdAt: string;
};

type RagMatch = {
  id: string;
  documentTitle: string;
  page: number | null;
  section: string | null;
  similarity: number;
  preview: string;
};

export function KnowledgePanel({ onReady }: { onReady?: (ready: boolean) => void } = {}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [embeddingConfigured, setEmbeddingConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Array<{ fileName: string; reason: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    threshold: number;
    matches: RagMatch[];
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/documents');
      if (!response.ok) return;
      const body = (await response.json()) as {
        documents: DocumentRow[];
        embeddingConfigured: boolean;
      };
      setDocuments(body.documents);
      setEmbeddingConfigured(body.embeddingConfigured);
      onReady?.(body.documents.some((doc) => doc.status === 'indexed'));
    } catch {
      setError('خواندن فهرست اسناد ممکن نشد.');
    }
  }, [onReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const inFlight = documents.some((doc) => doc.status === 'pending' || doc.status === 'processing');

  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const upload = async (files: FileList) => {
    setBusy(true);
    setError(null);
    setRejected([]);

    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('files', file);

      const response = await fetch('/api/admin/documents', { method: 'POST', body: form });
      const body = (await response.json().catch(() => null)) as {
        rejected?: Array<{ fileName: string; reason: string }>;
        error?: string;
      } | null;

      if (!response.ok) {
        setError(body?.error ?? 'آپلود اسناد ممکن نشد.');
        return;
      }

      if (body?.rejected?.length) setRejected(body.rejected);
      await load();
    } catch {
      setError('آپلود اسناد ممکن نشد.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/documents/${id}`, { method: 'DELETE' }).catch(() => {});
    await load();
  };

  const reindex = async (id: string) => {
    await fetch(`/api/admin/documents/${id}/reindex`, { method: 'POST' }).catch(() => {});
    await load();
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const response = await fetch('/api/admin/rag/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const body = (await response.json().catch(() => null)) as
        | { threshold: number; matches: RagMatch[]; error?: string }
        | null;

      if (!response.ok || !body) {
        setError(body?.error ?? 'تست بازیابی ممکن نشد.');
        return;
      }

      setTestResult({ threshold: body.threshold, matches: body.matches });
    } catch {
      setError('تست بازیابی ممکن نشد.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        title="پایگاه دانش"
        description="اسناد کسب‌وکار را آپلود کنید. آواتار پاسخ‌ها را از همین اسناد استخراج می‌کند، نه از دانش عمومی مدل."
      >
        <div className="space-y-4">
          {!embeddingConfigured && (
            <Alert tone="warn">
              سرویس تعبیه‌سازی پیکربندی نشده است. بدون آن سند قابل ایندکس نیست —{' '}
              <code className="latn">EMBEDDING_PROVIDER</code> و کلید آن را تنظیم کنید.
            </Alert>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          {rejected.length > 0 && (
            <Alert tone="warn">
              <p className="mb-1 font-medium">این فایل‌ها پذیرفته نشدند:</p>
              <ul className="space-y-0.5">
                {rejected.map((item) => (
                  <li key={item.fileName}>
                    {item.fileName} — {item.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              disabled={busy || !embeddingConfigured}
              onChange={(event) => {
                if (event.target.files?.length) void upload(event.target.files);
              }}
              className="hidden"
              id="docs-file"
            />
            <label
              htmlFor="docs-file"
              className={
                embeddingConfigured && !busy
                  ? 'btn-primary cursor-pointer'
                  : 'btn-primary pointer-events-none opacity-45'
              }
            >
              {busy && <Spinner />}
              آپلود سند
            </label>
            <p className="mt-2 hint">PDF، DOCX، TXT یا Markdown تا ۲۵ مگابایت — چند فایل هم‌زمان</p>
          </div>

          {documents.length === 0 ? (
            <p className="hint py-4 text-center">هنوز سندی آپلود نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-start text-xs">
                <thead className="text-content-faint">
                  <tr className="border-b border-line">
                    <th className="p-2 text-start font-medium">سند</th>
                    <th className="p-2 text-start font-medium">وضعیت</th>
                    <th className="p-2 text-start font-medium">صفحات</th>
                    <th className="p-2 text-start font-medium">قطعات</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b border-line/60 last:border-0">
                      <td className="max-w-[16rem] p-2">
                        <p className="truncate text-content" title={doc.fileName}>
                          {doc.title}
                        </p>
                        <p className="mt-0.5 text-[11px] uppercase text-content-faint latn">
                          {doc.fileType}
                          {doc.byteSize ? ` · ${Math.round(doc.byteSize / 1024)} KB` : ''}
                        </p>
                        {doc.errorMessage && (
                          <p className="mt-1 text-[11px] leading-relaxed text-state-error">
                            {doc.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="p-2">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="p-2 tabular-nums text-content-muted latn">
                        {doc.pageCount ?? '—'}
                      </td>
                      <td className="p-2 tabular-nums text-content-muted latn">{doc.chunkCount}</td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void reindex(doc.id)}
                            title="ایندکس مجدد"
                            className="rounded-lg p-1.5 text-content-faint transition-colors hover:bg-surface-raised hover:text-content"
                          >
                            <RefreshIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(doc.id)}
                            title="حذف سند"
                            className="rounded-lg p-1.5 text-content-faint transition-colors hover:bg-state-error/10 hover:text-state-error"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="تست بازیابی"
        description="سؤال نمونه بپرسید و ببینید دقیقاً چه قطعاتی به مدل زبانی داده می‌شود."
      >
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="مثلاً: شرایط گارانتی چیست؟"
            className="field flex-1"
          />
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing || question.trim().length < 2}
            className="btn-ghost shrink-0"
          >
            {testing ? <Spinner /> : null}
            جستجو
          </button>
        </div>

        {testResult && (
          <div className="mt-4 space-y-3">
            <p className="hint">
              آستانهٔ شباهت فعلی: <span className="latn">{testResult.threshold}</span> — قطعاتی که
              نمرهٔ کمتری بگیرند به مدل داده نمی‌شوند.
            </p>

            {testResult.matches.length === 0 ? (
              <Alert tone="warn">
                هیچ قطعه‌ای بالای آستانه پیدا نشد. آواتار برای این سؤال صادقانه می‌گوید اطلاعات
                کافی ندارد. اگر انتظار داشتید جواب بدهد، یا سند مربوطه را اضافه کنید یا آستانه را
                در تنظیمات پایین بیاورید.
              </Alert>
            ) : (
              <ul className="space-y-2">
                {testResult.matches.map((match) => (
                  <li key={match.id} className="rounded-xl border border-line bg-surface-sunken p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-content-muted">
                        {match.documentTitle}
                        {match.page ? ` — صفحهٔ ${match.page}` : ''}
                        {match.section ? ` — ${match.section}` : ''}
                      </span>
                      <span className="rounded bg-brand-wash px-1.5 py-0.5 tabular-nums text-brand-soft latn">
                        {match.similarity.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-xs leading-6 text-content-muted">{match.preview}…</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
