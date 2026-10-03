import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f9ff",
          500: "#1e88ff",
          600: "#1565c0",
          700: "#0d47a1",
        },
      },
      boxShadow: {
        glow: "0 0 30px rgba(30, 136, 255, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
