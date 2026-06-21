const Colors = {
  light: {
    background: "#F4F6F9",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    text: "#0D1117",
    textSecondary: "#4A5568",
    textTertiary: "#9BA3AF",
    accent: "#2563EB",
    accentLight: "#EBF2FF",
    accentDark: "#1D4ED8",
    accentMuted: "#BFDBFE",
    warm: "#F59E0B",
    warmLight: "#FEF3C7",
    danger: "#EF4444",
    dangerLight: "#FEE2E2",
    success: "#10B981",
    successLight: "#D1FAE5",
    border: "#E4E8EF",
    borderLight: "#F0F3F7",
    tint: "#2563EB",
    tabIconDefault: "#9BA3AF",
    tabIconSelected: "#2563EB",
    cardShadow: "rgba(13, 17, 23, 0.07)",
    overlay: "rgba(13, 17, 23, 0.5)",
    timerBg: "#1E3A5F",
  },
  dark: {
    // Backgrounds — true near-black, no blue cast
    background: "#0C0C0F",
    surface: "#141417",
    surfaceElevated: "#1C1C22",

    // Text hierarchy
    text: "#EEEEF3",
    textSecondary: "#8A8A9E",
    textTertiary: "#46465A",

    // Accent — single refined blue
    accent: "#4080FF",
    accentLight: "#18213F",
    accentDark: "#6FA3FF",
    accentMuted: "#111830",

    // Semantic
    warm: "#F0A020",
    warmLight: "#1E1500",
    danger: "#FF4D4D",
    dangerLight: "#2A0909",
    success: "#2ED47A",
    successLight: "#071A0F",

    // Borders — nearly invisible, just enough to define edges
    border: "#242430",
    borderLight: "#18181F",

    tint: "#4080FF",
    tabIconDefault: "#46465A",
    tabIconSelected: "#4080FF",
    cardShadow: "rgba(0, 0, 0, 0.55)",
    overlay: "rgba(0, 0, 0, 0.82)",
    timerBg: "#0C0C0F",
  },
};

export default Colors;

export type ThemeColors = typeof Colors.light;
