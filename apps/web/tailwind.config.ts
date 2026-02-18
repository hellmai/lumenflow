import type { Config } from 'tailwindcss';

const CONTENT_PATHS = ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'];

const TAILWIND_CONFIG: Config = {
  content: CONTENT_PATHS,
  theme: {
    extend: {
      colors: {
        canvas: '#f6f8fb',
        ink: '#0f172a',
        accent: '#0ea5e9',
      },
    },
  },
  plugins: [],
};

export default TAILWIND_CONFIG;
