/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { display: ["Cormorant Garamond", "Georgia", "serif"], sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.05)" },
    },
  },
  plugins: [],
};
