import type { Config } from 'tailwindcss';

/**
 * پیکربندی Tailwind
 *
 * نکتهٔ RTL: در سراسر پروژه از ابزارهای منطقی (ms/me/ps/pe/start/end)
 * استفاده می‌شود تا رابط کاربری بدون پلاگین اضافی در جهت راست‌به‌چپ درست بنشیند.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-vazir)', 'Vazirmatn', 'Tahoma', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: '#0B0F14',
          soft: '#121922',
        },
        surface: {
          DEFAULT: '#151E28',
          raised: '#1D2833',
          sunken: '#0E141B',
        },
        line: {
          DEFAULT: '#26323F',
          strong: '#34424F',
        },
        content: {
          DEFAULT: '#E7EEF5',
          muted: '#93A3B4',
          faint: '#64748B',
        },
        brand: {
          DEFAULT: '#E3A857',
          soft: '#F2C98A',
          deep: '#B7823A',
          wash: 'rgba(227, 168, 87, 0.12)',
        },
        state: {
          idle: '#64748B',
          listening: '#2DD4A7',
          thinking: '#E3A857',
          speaking: '#59A5F5',
          error: '#F2748C',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.9)',
        glow: '0 0 0 1px rgba(227,168,87,0.35), 0 0 32px -8px rgba(227,168,87,0.45)',
      },
      keyframes: {
        'breathe': {
          '0%, 100%': { transform: 'scale(1) translateY(0)' },
          '50%': { transform: 'scale(1.012) translateY(-0.35%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.92)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
        'wave': {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      animation: {
        breathe: 'breathe 5.5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        wave: 'wave 1s ease-in-out infinite',
        'fade-up': 'fade-up 0.24s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
