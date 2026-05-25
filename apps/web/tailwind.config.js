/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#ededed',
        primary: {
          DEFAULT: '#ffffff',
          foreground: '#000000',
        },
        card: {
          DEFAULT: '#121212',
          border: '#1f1f1f',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
