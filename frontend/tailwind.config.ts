import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5eedb",
          100: "#d8bd7c",
          500: "#a27035",
          600: "#b88b4a",
          700: "#ddca7d",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(162, 112, 53, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
