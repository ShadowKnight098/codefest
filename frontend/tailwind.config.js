/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#16233F',
          soft: '#25355B',
        },
        paper: '#F6F6F2',
        surface: '#FFFFFF',
        line: {
          DEFAULT: '#DBD7C9',
          strong: '#C6C1B0',
        },
        text: {
          DEFAULT: '#1B2029',
          muted: '#59626F',
          faint: '#8B93A0',
        },
        accent: {
          DEFAULT: '#9C5B12',
          bg: '#F3E7D5',
        },
        success: {
          DEFAULT: '#1E7A46',
          bg: '#E8F3EC',
          line: '#BEDFCB',
        },
        error: {
          DEFAULT: '#AE2E22',
          bg: '#FBEAE8',
          line: '#EFC5BF',
        },
        warn: {
          DEFAULT: '#8A5A00',
          bg: '#FBF1DD',
          line: '#E9D6A3',
        },
        locked: {
          DEFAULT: '#7B8492',
          bg: '#EFEFEC',
        },
      },
      fontFamily: {
        serif: ['Spectral', 'Georgia', 'serif'],
        sans: ['IBM Plex Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '3px',
        md: '6px',
        lg: '6px',
      },
    },
  },
  plugins: [],
}
