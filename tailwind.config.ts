import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111318",
        signal: "#31C48D",
        copper: "#D97745",
        frost: "#E8EEF2"
      },
      boxShadow: {
        panel: "0 16px 50px rgba(17, 19, 24, 0.08)"
      }
    },
  },
  plugins: [],
};

export default config;
