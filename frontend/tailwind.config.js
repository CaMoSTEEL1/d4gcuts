/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0f1a",
        foreground: "#f4f7ff",
      },
    },
  },
  plugins: [],
};
