import Colors, { type ThemeColors } from "@/constants/colors";
import { useSettings } from "./SettingsContext";

export function useTheme(): ThemeColors & { isDark: boolean } {
  const { isDark } = useSettings();
  const colors = isDark ? Colors.dark : Colors.light;
  return { ...colors, isDark };
}
