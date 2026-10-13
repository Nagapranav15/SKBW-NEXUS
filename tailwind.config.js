/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary = #0059CF (600)
        blue: {
          50: '#EEF5FF', 100: '#D9E8FF', 200: '#B8D4FB', 300: '#86B5F3', 400: '#4B8CE6',
          500: '#1A6FDB', 600: '#0059CF', 700: '#004AAD', 800: '#003D8F', 900: '#00306F', 950: '#001F47',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
