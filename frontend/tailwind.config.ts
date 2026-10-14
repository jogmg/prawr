import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5eedb",
          100: "#d8bd7c",
          500: "#ddca7d",
          600: "#b69f54",
          700: "#927b38",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(221, 202, 125, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
