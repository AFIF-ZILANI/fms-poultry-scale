import { View, ViewProps } from 'react-native';
import { useTheme } from '../lib/useTheme';

type Props = ViewProps & {
  variant?: 'default' | 'surface' | 'elevated';
};

export function ThemedView({ style, variant = 'default', ...rest }: Props) {
  const colors = useTheme();

  const backgroundColor =
    variant === 'surface'
      ? colors.surface
      : variant === 'elevated'
      ? colors.surfaceElevated
      : colors.background;

  return <View {...rest} style={[{ backgroundColor }, style]} />;
}