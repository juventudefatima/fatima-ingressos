/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12231F',
        paper: '#F7F5F1',
        primary: {
          DEFAULT: '#0F6B5C',
          dark: '#0B4F44',
          light: '#E4F1EE',
        },
        accent: {
          DEFAULT: '#E8A33D',
          dark: '#C97F1E',
        },
        danger: '#B3261E',
        line: '#DCD6C9',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        ticket: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,35,31,0.06), 0 8px 24px -8px rgba(18,35,31,0.12)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        checkPop: {
          '0%': { transform: 'scale(0)' },
          '60%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.28s ease-out both',
        'pop-in': 'popIn 0.2s ease-out both',
        'check-pop': 'checkPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
}
