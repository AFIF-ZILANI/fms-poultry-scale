import { useColorScheme } from "react-native";
import Colors, { type ThemeColors } from "@/constants/colors";

export function useTheme(): ThemeColors & { isDark: boolean } {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  return { ...colors, isDark };
}
