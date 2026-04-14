import type { Config } from "tailwindcss";

/**
 * Design System: "Structured Editorial"
 * ─────────────────────────────────────
 * Palette: Warm paper × near-black ink × Singapore-chili accent
 * Fonts:   Syne (display) · Karla (body) · Space Mono (data/labels)
 * Principle: Borders over shadows. Typography over decoration. Signal over noise.
 */

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // ── Override defaults deliberately ───────────────────────────────────────
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "4px",
      md: "4px",
      lg: "6px",
      // No xl / 2xl / 3xl – sharp geometry is the system rule
    },
    boxShadow: {
      none: "none",
      // Crisp offset shadows for interactive lift – not diffuse blur
      crisp: "2px 2px 0 0 #1A1712",
      "crisp-sm": "1px 1px 0 0 #1A1712",
      "crisp-accent": "2px 2px 0 0 #C8471A",
      "crisp-border": "2px 2px 0 0 #D8D2C8",
      // Inset border replacement
      "inset-border": "inset 0 0 0 1px #D8D2C8",
      "inset-border-ink": "inset 0 0 0 1px #1A1712",
    },
    extend: {
      // ── Color Palette ──────────────────────────────────────────────────────
      colors: {
        // Warm near-black – primary text & high-contrast elements
        ink: {
          DEFAULT: "#1A1712",
          50: "#F7F3EC",   // paper
          100: "#EDE7DC",  // cream
          200: "#D8D2C8",  // border
          300: "#B9B1A6",  // placeholder
          400: "#968D83",  // disabled text
          500: "#7A7166",  // muted text
          600: "#5C5650",  // secondary text
          700: "#403C37",
          800: "#2A2723",
          900: "#1A1712",  // default ink
          950: "#0D0C0A",  // near pure black
        },
        // Singapore chili-red – the single intentional accent
        chili: {
          DEFAULT: "#C8471A",
          light: "#E06030",
          dark: "#A33814",
          muted: "#F7EBE6",  // tinted background for chips/tags
          subtle: "#FAEEE9",
        },
        // Semantic surface colors
        paper: "#F7F3EC",   // page background – warm off-white
        surface: "#FFFFFF", // card / panel background
        overlay: "#FDFAF6", // slightly warmer than white for nested surfaces
        // Semantic status
        success: {
          DEFAULT: "#2D7D3A",
          muted: "#EBF5EC",
        },
        warning: {
          DEFAULT: "#B86B00",
          muted: "#FEF3E2",
        },
        error: {
          DEFAULT: "#B91C1C",
          muted: "#FEF2F2",
        },
        // MRT line colors – Singapore context
        mrt: {
          nsl: "#E6001F", // North-South
          ewl: "#009645", // East-West
          nel: "#9900AA", // North-East
          ccl: "#FA9E0D", // Circle
          dtl: "#005EC4", // Downtown
          tel: "#9D5B25", // Thomson-East Coast
        },
      },

      // ── Font Families ──────────────────────────────────────────────────────
      fontFamily: {
        // Editorial display serif – Syne for headers (loaded in globals.css)
        display: ["Syne", "ui-sans-serif", "system-ui", "sans-serif"],
        // Clean grotesque body – Karla
        sans: ["Karla", "ui-sans-serif", "system-ui", "sans-serif"],
        // Monospaced for data, stats, labels, codes – Space Mono
        mono: ["Space Mono", "ui-monospace", "Menlo", "monospace"],
      },

      // ── Type Scale ─────────────────────────────────────────────────────────
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
        xs:  ["0.75rem",  { lineHeight: "1.125rem" }],
        sm:  ["0.875rem", { lineHeight: "1.375rem" }],
        base: ["0.9375rem", { lineHeight: "1.6rem" }],
        md:  ["1rem",     { lineHeight: "1.625rem" }],
        lg:  ["1.125rem", { lineHeight: "1.75rem" }],
        xl:  ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.875rem", letterSpacing: "-0.015em" }],
        "3xl": ["1.875rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem",  { lineHeight: "2.5rem",   letterSpacing: "-0.025em" }],
        "5xl": ["3rem",     { lineHeight: "1.1",       letterSpacing: "-0.03em" }],
        "6xl": ["3.75rem",  { lineHeight: "1.05",      letterSpacing: "-0.035em" }],
        "7xl": ["4.5rem",   { lineHeight: "1",          letterSpacing: "-0.04em" }],
      },

      // ── Letter Spacing ─────────────────────────────────────────────────────
      letterSpacing: {
        tightest:  "-0.04em",
        tighter:   "-0.025em",
        tight:     "-0.015em",
        editorial: "-0.01em",
        normal:    "0em",
        wide:      "0.02em",
        wider:     "0.05em",
        widest:    "0.1em",
        label:     "0.08em",   // mono uppercase labels
        eyebrow:   "0.12em",   // section eyebrow text
      },

      // ── Line Heights ───────────────────────────────────────────────────────
      lineHeight: {
        none:      "1",
        tightest:  "1.05",
        tighter:   "1.1",
        tight:     "1.25",
        snug:      "1.375",
        normal:    "1.5",
        relaxed:   "1.625",
        loose:     "1.75",
        data:      "1",        // for mono stat values
      },

      // ── Spacing Overrides ──────────────────────────────────────────────────
      spacing: {
        // Fine-grained control for tight UI work
        "0.5": "0.125rem",
        "1.5": "0.375rem",
        "2.5": "0.625rem",
        "3.5": "0.875rem",
        "4.5": "1.125rem",
        "5.5": "1.375rem",
        // Section breathing room
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
      },

      // ── Max Widths ─────────────────────────────────────────────────────────
      maxWidth: {
        "content": "72rem",      // 1152px – dashboard max
        "panel": "40rem",        // 640px – input panel max
        "prose": "65ch",         // body text column
        "label": "20ch",         // truncated labels
      },

      // ── Border Width ───────────────────────────────────────────────────────
      borderWidth: {
        DEFAULT: "1px",
        "0": "0",
        "2": "2px",
        "4": "4px",   // accent underlines / rule emphasis
      },

      // ── Transitions ────────────────────────────────────────────────────────
      transitionDuration: {
        DEFAULT: "150ms",
        fast: "100ms",
        base: "150ms",
        slow: "250ms",
      },
      transitionTimingFunction: {
        DEFAULT: "ease",
        "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },

      // ── Grid / Layout ──────────────────────────────────────────────────────
      gridTemplateColumns: {
        "dashboard": "280px 1fr",                  // sidebar + main
        "dashboard-lg": "320px 1fr",
        "results": "repeat(auto-fill, minmax(300px, 1fr))",
        "stats": "repeat(4, 1fr)",
        "stats-sm": "repeat(2, 1fr)",
      },

      // ── Keyframes & Animations ─────────────────────────────────────────────
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.4" },
        },
      },
      animation: {
        shimmer:         "shimmer 1.6s ease-in-out infinite",
        "fade-up":       "fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in":       "fade-in 0.25s ease both",
        "slide-right":   "slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-dot":     "pulse-dot 1.5s ease-in-out infinite",
      },

      // ── Z-Index ────────────────────────────────────────────────────────────
      zIndex: {
        base:    "0",
        raised:  "10",
        overlay: "40",
        modal:   "50",
        toast:   "60",
      },
    },
  },
  plugins: [],
};

export default config;
