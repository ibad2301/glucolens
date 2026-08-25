import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Wraps app initialization (DB open, auth restore) so a thrown error there
// shows a recovery screen instead of a white screen. Resetting `hasError`
// remounts the wrapped subtree, which re-runs its init effects from scratch.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] App initialization failed:', error, info.componentStack);
  }

  retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong starting GlucoLens</Text>
          <Text style={styles.subtitle}>Please try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={this.retry}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: THEME_COLORS.background, alignItems: 'center', justifyContent: 'center', padding: SCREEN_PADDING },
  title:      { ...TYPE.title3, color: THEME_COLORS.textPrimary, textAlign: 'center', marginBottom: SPACE.space2 },
  subtitle:   { ...TYPE.body, color: THEME_COLORS.textSecondary, textAlign: 'center', marginBottom: SPACE.space6 },
  btn:        { minHeight: 52, minWidth: 160, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, paddingHorizontal: SPACE.space6 },
  btnPressed: { backgroundColor: THEME_COLORS.primaryPressed },
  btnText:    { color: THEME_COLORS.textInverse, ...TYPE.headline },
});
