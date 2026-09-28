/** @type {import('tailwindcss').Config} */
const tokens = [
  'canvas', 'surface', 'sunken', 'ink', 'ink-2', 'muted', 'line', 'line-strong',
  'leaf', 'leaf-2', 'leaf-ink', 'leaf-soft', 'turmeric', 'turmeric-2', 'turmeric-ink', 'turmeric-soft',
  'ok', 'ok-soft', 'warn', 'warn-soft', 'bad', 'bad-soft', 'display', 'display-ink', 'display-dim',
  'rail', 'rail-ink', 'rail-muted',
];

module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(tokens.map((t) => [t, `rgb(var(--${t}) / <alpha-value>)`])),
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', '"Atkinson Hyperlegible Next Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Atkinson Hyperlegible Mono"', '"Atkinson Hyperlegible Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xl: ['1.3125rem', { lineHeight: '1.75rem' }],
      },
    },
  },
  plugins: [],
};
