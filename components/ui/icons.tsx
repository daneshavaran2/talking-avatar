/**
 * آیکون‌های درون‌خطی.
 * بدون وابستگی خارجی تا باندل کوچک بماند و بارگذاری اولیهٔ صفحه
 * زیر ۲ ثانیه باقی بماند (NFR8).
 */

type IconProps = { className?: string };

const base = 'h-5 w-5';

export function MicIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3.5" strokeLinecap="round" />
    </svg>
  );
}

export function MicOffIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M9 9V5.5a3 3 0 0 1 5.9-.75M15 12.2V9" strokeLinecap="round" />
      <path d="M5 11a7 7 0 0 0 10.5 6.06M19 11v.5" strokeLinecap="round" />
      <path d="M12 18v3.5" strokeLinecap="round" />
      <path d="M3.5 3.5l17 17" strokeLinecap="round" />
    </svg>
  );
}

export function SendIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M20 12 4 4l3 8-3 8 16-8Z" strokeLinejoin="round" />
      <path d="M7 12h13" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
      <path d="M20 4v4.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StopIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
    </svg>
  );
}

export function DocumentIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.8-7 9-4.1-1.2-7-4.8-7-9V6l7-3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function ChartIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M4 20h16" strokeLinecap="round" />
      <path d="M7 20v-6M12 20V6M17 20v-9" strokeLinecap="round" />
    </svg>
  );
}

export function FaceIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10.5h.01M15 10.5h.01" strokeLinecap="round" />
      <path d="M8.8 15a4 4 0 0 0 6.4 0" strokeLinecap="round" />
    </svg>
  );
}

export function SpeakerIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M5 9.5h3l4-3.5v12l-4-3.5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" strokeLinecap="round" />
    </svg>
  );
}

export function SlidersIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

export function PlugIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M9 3v5M15 3v5" strokeLinecap="round" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" strokeLinejoin="round" />
      <path d="M12 17v4" strokeLinecap="round" />
    </svg>
  );
}

export function ChatIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.3h.01" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" strokeLinecap="round" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" strokeLinejoin="round" />
    </svg>
  );
}
