/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf8f5',
        ink: '#3a3733',
        stone: {
          50: '#faf8f5',
          100: '#f3f0ea',
          200: '#e8e3da',
          300: '#d8d1c4',
          400: '#b8ae9c',
          500: '#958974',
          600: '#75695a',
          700: '#5c5245',
          800: '#443d34',
          900: '#302a24',
        },
        sage: {
          50: '#f4f6f3',
          100: '#e5ebe1',
          200: '#cdd8c5',
          300: '#aebd9f',
          400: '#8fa17c',
          500: '#728a5e',
          600: '#5a6f49',
        },
        clay: {
          100: '#f2e4dd',
          200: '#e6c8bb',
          300: '#d6a78f',
          400: '#c2876a',
          500: '#a86847',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Noto Sans TC"',
          '"PingFang TC"',
          '"Microsoft JhengHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(58, 55, 51, 0.06)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
}
