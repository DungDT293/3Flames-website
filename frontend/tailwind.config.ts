import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 3Flames brand palette — dark mode crypto/SaaS aesthetic
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",  // primary orange
          600: "#ea580c",  // hover state
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
        flame: {
          red:    "#ef4444",
          orange: "#f97316",
          amber:  "#f59e0b",
        },
        surface: {
          900: "rgb(var(--app-bg) / <alpha-value>)",
          800: "rgb(var(--app-card) / <alpha-value>)",
          700: "rgb(var(--app-elevated) / <alpha-value>)",
          600: "rgb(var(--app-input) / <alpha-value>)",
          500: "rgb(var(--app-border) / <alpha-value>)",
        },
        app: {
          bg: "rgb(var(--app-bg) / <alpha-value>)",
          card: "rgb(var(--app-card) / <alpha-value>)",
          elevated: "rgb(var(--app-elevated) / <alpha-value>)",
          input: "rgb(var(--app-input) / <alpha-value>)",
          border: "rgb(var(--app-border) / <alpha-value>)",
          fg: "rgb(var(--app-fg) / <alpha-value>)",
          muted: "rgb(var(--app-muted) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "#71717a",
          foreground: "#a1a1aa",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      animation: {
        "flame-pulse": "flamePulse 2s ease-in-out infinite",
      },
      keyframes: {
        flamePulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
