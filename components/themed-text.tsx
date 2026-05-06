import { Text, TextProps, StyleSheet } from "react-native";
import { useTheme } from "../lib/useTheme";

type Props = TextProps & {
  type?: "default" | "title" | "secondary" | "link" | "error";
};

export function ThemedText({ style, type = "default", ...rest }: Props) {
  const colors = useTheme();

  return (
    <Text
      {...rest}
      style={[
        { color: colors.text },

        type === "title" && styles.title,
        type === "secondary" && { color: colors.textSecondary },
        type === "link" && { color: colors.accent },
        type === "error" && { color: colors.danger },

        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
});
