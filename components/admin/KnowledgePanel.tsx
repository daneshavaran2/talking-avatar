'use client';

import { RotateCcwIcon, SearchIcon, TrashIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard, StatusBadge } from '@/components/admin/ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * مدیریت پایگاه دانش (§F3).
 * وضعیت اسناد در حال پردازش زنده به‌روز می‌شود (F3.5).
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
  const [rejected, setRejected] = useState<Array<{ fileName: string; reason: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ threshold: number; matches: RagMatch[] } | null>(
    null,
  );

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
      toast.error('خواندن فهرست اسناد ممکن نشد.');
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
        toast.error(body?.error ?? 'آپلود اسناد ممکن نشد.');
        return;
      }

      if (body?.rejected?.length) setRejected(body.rejected);
      await load();
    } catch {
      toast.error('آپلود اسناد ممکن نشد.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/documents/${id}`, { method: 'DELETE' }).catch(() => {});
    await load();
    toast.success('سند حذف شد.');
  };

  const reindex = async (id: string) => {
    await fetch(`/api/admin/documents/${id}/reindex`, { method: 'POST' }).catch(() => {});
    await load();
  };

  const runTest = async () => {
    setTesting(true);
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
        toast.error(body?.error ?? 'تست بازیابی ممکن نشد.');
        return;
      }

      setTestResult({ threshold: body.threshold, matches: body.matches });
    } catch {
      toast.error('تست بازیابی ممکن نشد.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="پایگاه دانش"
        description="اسناد کسب‌وکار را آپلود کنید. آواتار پاسخ‌ها را از همین اسناد استخراج می‌کند، نه از دانش عمومی مدل."
      >
        <div className="flex flex-col gap-4">
          {!embeddingConfigured && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                سرویس تعبیه‌سازی پیکربندی نشده است. بدون آن سند قابل ایندکس نیست —{' '}
                <code className="latn">EMBEDDING_PROVIDER</code> و کلید آن را تنظیم کنید.
              </AlertDescription>
            </Alert>
          )}

          {rejected.length > 0 && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                <p className="font-medium">این فایل‌ها پذیرفته نشدند:</p>
                <ul>
                  {rejected.map((item) => (
                    <li key={item.fileName}>
                      {item.fileName} — {item.reason}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
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
            <Button asChild disabled={busy || !embeddingConfigured}>
              <label
                htmlFor="docs-file"
                className={
                  embeddingConfigured && !busy ? 'cursor-pointer' : 'pointer-events-none opacity-50'
                }
              >
                {busy ? <Spinner /> : <UploadIcon />}
                آپلود سند
              </label>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              PDF، DOCX، TXT یا Markdown تا ۲۵ مگابایت — چند فایل هم‌زمان
            </p>
          </div>

          {documents.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              هنوز سندی آپلود نشده است.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>سند</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>صفحات</TableHead>
                  <TableHead>قطعات</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-64">
                      <p className="truncate text-xs" title={doc.fileName}>
                        {doc.title}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase text-muted-foreground latn">
                        {doc.fileType}
                        {doc.byteSize ? ` · ${Math.round(doc.byteSize / 1024)} KB` : ''}
                      </p>
                      {doc.errorMessage && (
                        <p className="mt-1 text-[11px] leading-relaxed text-destructive">
                          {doc.errorMessage}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground latn">
                      {doc.pageCount ?? '—'}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground latn">
                      {doc.chunkCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void reindex(doc.id)}
                          title="ایندکس مجدد"
                          aria-label="ایندکس مجدد"
                        >
                          <RotateCcwIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void remove(doc.id)}
                          title="حذف سند"
                          aria-label="حذف سند"
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="تست بازیابی"
        description="سؤال نمونه بپرسید و ببینید دقیقاً چه قطعاتی به مدل زبانی داده می‌شود."
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="مثلاً: شرایط گارانتی چیست؟"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void runTest()}
              disabled={testing || question.trim().length < 2}
            >
              {testing ? <Spinner /> : <SearchIcon />}
              جستجو
            </Button>
          </div>

          {testResult && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                آستانهٔ شباهت فعلی: <span className="latn">{testResult.threshold}</span> — قطعاتی
                که نمرهٔ کمتری بگیرند به مدل داده نمی‌شوند.
              </p>

              {testResult.matches.length === 0 ? (
                <Alert variant="warning">
                  <TriangleAlertIcon />
                  <AlertDescription>
                    هیچ قطعه‌ای بالای آستانه پیدا نشد. آواتار برای این سؤال صادقانه می‌گوید
                    اطلاعات کافی ندارد. اگر انتظار داشتید جواب بدهد، یا سند مربوطه را اضافه کنید
                    یا آستانه را در تنظیمات پایین بیاورید.
                  </AlertDescription>
                </Alert>
              ) : (
                <ul className="flex flex-col gap-2">
                  {testResult.matches.map((match) => (
                    <li key={match.id} className="rounded-xl border bg-muted/40 p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">
                          {match.documentTitle}
                          {match.page ? ` — صفحهٔ ${match.page}` : ''}
                          {match.section ? ` — ${match.section}` : ''}
                        </span>
                        <Badge variant="secondary" className="tabular-nums latn">
                          {match.similarity.toFixed(3)}
                        </Badge>
                      </div>
                      <p className="text-xs leading-6 text-muted-foreground">{match.preview}…</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
