/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#111218",
          card: "#1a1c25",
          elevated: "#22253a",
        },
        accent: {
          DEFAULT: "#d4a853",
          light: "#e8c07a",
          dark: "#a07830",
        },
        text: {
          DEFAULT: "#f0ede8",
          muted: "#8a8a9a",
          dim: "#555566",
        },
        success: "#4ade80",
        danger: "#f87171",
        violet: "#a78bfa",
      },
    },
  },
  plugins: [],
};
