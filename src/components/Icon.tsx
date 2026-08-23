import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';

export function Icon({ ios, android, size = 18, color }: {
  ios: SFSymbol; android: keyof typeof Ionicons.glyphMap; size?: number; color: string;
}) {
  return (
    <SymbolView
      name={ios}
      size={size}
      tintColor={color}
      style={{ width: size, height: size }}
      fallback={<Ionicons name={android} size={size} color={color} />}
    />
  );
}
