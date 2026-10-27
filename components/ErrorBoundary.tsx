// App-wide React error boundary. `Sentry.wrap` (in _layout) captures NATIVE
// crashes, but a JavaScript error thrown during render/commit of a screen isn't
// a native crash — without a boundary it unmounts the whole tree and the user is
// left staring at a blank white screen with no way back. This catches that case,
// reports it through our thin `captureError` helper (no-op when Sentry is off),
// and shows a branded recovery UI.
//
// Must be a class component: `getDerivedStateFromError` / `componentDidCatch`
// have no hooks equivalent. It depends only on static theme tokens + captureError
// (no context/providers), so it stays functional even if a provider is what threw.

import { Component, type ReactNode } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii } from '@/lib/theme';
import { captureError } from '@/lib/sentry';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureError(error, {
      boundary: 'root',
      componentStack: info?.componentStack ?? undefined,
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  reload = () => {
    // Web can hard-reload to fully re-bootstrap. Native has no equivalent, so we
    // fall back to clearing the error and re-rendering the tree.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.reset();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.purpleSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <Feather name="alert-triangle" size={26} color={colors.purple} />
        </View>

        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            color: colors.ink,
            textAlign: 'center',
            letterSpacing: -0.2,
          }}
        >
          Something went wrong
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            color: colors.mute,
            marginTop: 6,
            lineHeight: 19,
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          The app hit an unexpected error. We were notified, and your data is
          safe. Try again below.
        </Text>

        {__DEV__ && error?.message && (
          <View
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.2)',
              maxWidth: 360,
            }}
          >
            <Text style={{ fontSize: 11.5, color: '#DC2626', fontFamily: 'monospace' }}>
              {error.message}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            hitSlop={8}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 22,
              borderRadius: radii.pill,
              backgroundColor: colors.purple,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 0.1 }}>
              Try again
            </Text>
          </Pressable>

          <Pressable
            onPress={this.reload}
            accessibilityRole="button"
            accessibilityLabel="Reload the app"
            hitSlop={8}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 22,
              borderRadius: radii.pill,
              backgroundColor: colors.paper,
              borderWidth: 1,
              borderColor: colors.hairline,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700', letterSpacing: 0.1 }}>
              Reload
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
}
