import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        yt: {
          bg: "var(--bg)",
          elev: "var(--bg-elev)",
          hover: "var(--bg-hover)",
          text: "var(--text)",
          dim: "var(--text-dim)",
          border: "var(--border)",
          blue: "#3ea6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
