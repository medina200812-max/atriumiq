/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gold: "#C9A227",
        goldLight: "#E4C866",
        navy: "#0F172A",
        navyLight: "#1E293B",
        cyan: "#38BDF8",
      },
      fontFamily: {
        display: ["Poppins", "sans-serif"],
        body: ["Poppins", "sans-serif"],
        mono: ["Poppins", "sans-serif"],
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
