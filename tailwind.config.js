import typography from '@tailwindcss/typography'
import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          raised: 'hsl(var(--surface-raised))',
          sunken: 'hsl(var(--surface-sunken))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        subtle: 'hsl(var(--subtle-foreground))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          soft: 'hsl(var(--info-soft))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          soft: 'hsl(var(--danger-soft))',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
          '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans SC"',
          '"Microsoft YaHei"', 'sans-serif',
        ],
        mono: [
          'ui-monospace', '"SF Mono"', '"JetBrains Mono"', 'Menlo',
          'Consolas', '"Liberation Mono"', 'monospace',
        ],
      },
      spacing: {
        '8.5': '2.125rem',
        '13': '3.25rem',
        '18': '4.5rem',
      },
      borderRadius: {
        card: '12px',
        control: '8px',
        badge: '6px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.02)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.18), 0 4px 8px -4px rgb(0 0 0 / 0.08)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.04)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
      typography: () => ({
        report: {
          css: {
            '--tw-prose-body': 'hsl(var(--foreground))',
            '--tw-prose-bold': 'hsl(var(--foreground))',
            '--tw-prose-counters': 'hsl(var(--primary))',
            '--tw-prose-bullets': 'hsl(var(--primary) / 0.5)',
            '--tw-prose-quotes': 'hsl(var(--muted-foreground))',
            '--tw-prose-quote-borders': 'hsl(var(--border))',
            '--tw-prose-code': 'hsl(var(--foreground))',
            '--tw-prose-hr': 'hsl(var(--border))',
            '--tw-prose-headings': 'hsl(var(--foreground))',
            maxWidth: 'none',
            fontSize: '14px',
            lineHeight: '1.75',
            'ol > li::marker': { fontWeight: '600' },
            'ol, ul': { paddingLeft: '1.4em', marginTop: '0.4em', marginBottom: '0.4em' },
            li: { marginTop: '0.25em', marginBottom: '0.25em' },
            'li > p': { marginTop: '0', marginBottom: '0' },
            p: { marginTop: '0.6em', marginBottom: '0.6em' },
            code: {
              background: 'hsl(var(--surface-sunken))',
              padding: '0.15em 0.4em',
              borderRadius: '4px',
              fontWeight: '500',
              fontSize: '0.9em',
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            'p:first-child': { marginTop: '0' },
            'p:last-child': { marginBottom: '0' },
            '> :first-child': { marginTop: '0' },
            '> :last-child': { marginBottom: '0' },
          },
        },
      }),
    },
  },
  plugins: [typography, animate],
}
