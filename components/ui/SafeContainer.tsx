import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ScrollViewProps,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

export type SafeEdge = 'top' | 'bottom' | 'left' | 'right';

/** Fixed content clearance reserved above the sticky footer across all modes. */
const STICKY_FOOTER_CLEARANCE = 80;

export interface SafeContainerProps {
  children: React.ReactNode;
  /** Edges to apply safe area padding. Defaults to ['top', 'bottom', 'left', 'right'] */
  edges?: SafeEdge[];
  /** Container layout mode: standard View, ScrollView, or KeyboardAvoiding */
  mode?: 'view' | 'scroll' | 'keyboard-avoiding';
  /** If true in keyboard-avoiding mode, disables the inner ScrollView wrapper (useful for FlatList/FlashList) */
  noScroll?: boolean;
  /** Optional sticky footer element locked into the bottom thumb zone */
  stickyFooter?: React.ReactNode;
  /** Extra bottom clearance (useful when sticky bars or floating tabs are present) */
  extraBottomPadding?: number;
  /** Background color override */
  backgroundColor?: string;
  /** NativeWind / Tailwind className */
  className?: string;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Custom scrollview content container style (when mode='scroll') */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** ScrollView props pass-through (when mode='scroll') */
  scrollViewProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;
  /** Keyboard vertical offset for KeyboardAvoidingView (when mode='keyboard-avoiding') */
  keyboardVerticalOffset?: number;
  /** KeyboardAvoidingView behavior override (defaults to 'padding' on iOS and Android) */
  keyboardBehavior?: 'padding' | 'height' | 'position';
}

/**
 * Android only: true while the soft keyboard is up. RN's KeyboardAvoidingView handles
 * keyboardDidHide like a show event and subtracts its screenY, which under edge-to-edge
 * is not the screen bottom, leaving ~95dp of stale padding after the keyboard closes.
 * Pass `enabled={useAndroidKeyboardShown()}` to zero the padding while it's hidden.
 */
export function useAndroidKeyboardShown(active = true) {
  // Seed from the live state: a keyboard already up at mount fires no new show event.
  const [shown, setShown] = React.useState(() => Keyboard.isVisible());
  React.useEffect(() => {
    if (!active || Platform.OS !== 'android') return;
    setShown(Keyboard.isVisible());
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active]);
  return Platform.OS !== 'android' || shown;
}

/**
 * Drop-in KeyboardAvoidingView that also lifts content on Android. Edge-to-edge
 * disables adjustResize, so `behavior={ios ? 'padding' : undefined}` leaves inputs
 * hidden under the keyboard there (especially inside `statusBarTranslucent` modals).
 */
export function KeyboardAvoider(props: React.ComponentProps<typeof KeyboardAvoidingView>) {
  const shown = useAndroidKeyboardShown();
  return <KeyboardAvoidingView behavior="padding" {...props} enabled={shown && props.enabled !== false} />;
}

/**
 * Hooks into Mobile Safari's visualViewport to prevent headers from getting pushed
 * off-screen and eliminate empty gaps above the keyboard on iOS Web.
 */
function useSafeContainerVisualViewport(enabled: boolean) {
  const [viewportStyle, setViewportStyle] = React.useState<ViewStyle | null>(null);

  React.useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;

      const currentHeight = vv.height;
      const offsetTop = vv.offsetTop;
      const totalHeight = window.innerHeight;
      const scale = vv.scale ?? 1;
      const isZoomed = Math.abs(scale - 1) > 0.01;
      const isUp = !isZoomed && totalHeight - currentHeight > 60;

      if (isUp) {
        setViewportStyle({
          position: 'fixed' as any,
          top: offsetTop,
          left: 0,
          right: 0,
          height: currentHeight,
          maxHeight: currentHeight,
          overflow: 'hidden',
        });
      } else {
        setViewportStyle(null);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }
    window.addEventListener('scroll', onViewportChange, { passive: true });
    onViewportChange();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onViewportChange);
        window.visualViewport.removeEventListener('scroll', onViewportChange);
      }
      window.removeEventListener('scroll', onViewportChange);
    };
  }, [enabled]);

  return viewportStyle;
}

/**
 * Mobile-native SafeContainer.
 * Handles top notch, Dynamic Island, status bar, and bottom home indicator
 * dynamically using react-native-safe-area-context.
 */
export const SafeContainer = React.forwardRef<View, SafeContainerProps>(
  function SafeContainer(
    {
      children,
      edges = ['top', 'bottom', 'left', 'right'],
      mode = 'view',
      noScroll = false,
      stickyFooter,
      extraBottomPadding = 0,
      backgroundColor: bgOverride,
      className = '',
      style,
      contentContainerStyle,
      scrollViewProps,
      keyboardVerticalOffset,
      keyboardBehavior,
    }: SafeContainerProps,
    ref
  ) {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const backgroundColor = bgOverride ?? theme.background;
    const webViewportStyle = useSafeContainerVisualViewport(mode === 'keyboard-avoiding');
    const keyboardShown = useAndroidKeyboardShown(mode === 'keyboard-avoiding');
    // Once the padding has shrunk the scroll area, bring the focused field into view;
    // the ScrollView does not do this itself, so a field low on the form stayed hidden.
    const kavScrollRef = React.useRef<ScrollView>(null);
    React.useEffect(() => {
      if (!keyboardShown || Platform.OS !== 'android' || mode !== 'keyboard-avoiding') return;
      const t = setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        if (input) kavScrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(input as any, 56, true);
      }, 50);
      return () => clearTimeout(t);
    }, [keyboardShown, mode]);

  const edgePadding = React.useMemo(() => {
    return {
      paddingTop: edges.includes('top') ? insets.top : 0,
      paddingBottom: edges.includes('bottom')
        ? Math.max(insets.bottom, 12) + extraBottomPadding
        : extraBottomPadding,
      paddingLeft: edges.includes('left') ? insets.left : 0,
      paddingRight: edges.includes('right') ? insets.right : 0,
    };
  }, [edges, insets, extraBottomPadding]);

  const stickyFooterStyle = [
    styles.stickyFooter,
    {
      backgroundColor: theme.surface,
      borderTopColor: theme.hairline,
      paddingBottom: edges.includes('bottom')
        ? Math.max(insets.bottom, 12)
        : 12,
    },
  ];

  // View Mode
  if (mode === 'view') {
    return (
      <View
        ref={ref}
        className={className}
        style={[
          styles.fill,
          {
            backgroundColor,
            paddingTop: edgePadding.paddingTop,
            paddingLeft: edgePadding.paddingLeft,
            paddingRight: edgePadding.paddingRight,
            paddingBottom: edgePadding.paddingBottom,
          },
          style,
        ]}
      >
        {stickyFooter ? (
          <View style={[styles.fill, { paddingBottom: STICKY_FOOTER_CLEARANCE }]}>
            {children}
          </View>
        ) : (
          children
        )}
        {stickyFooter && (
          <View style={[stickyFooterStyle, { paddingBottom: 12 }]}>
            {stickyFooter}
          </View>
        )}
      </View>
    );
  }

  // Scroll Mode
  if (mode === 'scroll') {
    return (
      <View
        ref={ref}
        className={className}
        style={[
          styles.fill,
          {
            backgroundColor,
            paddingTop: edgePadding.paddingTop,
            paddingLeft: edgePadding.paddingLeft,
            paddingRight: edgePadding.paddingRight,
          },
          style,
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            {
              paddingBottom: edges.includes('bottom')
                ? Math.max(insets.bottom, 16) + (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding
                : (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding,
            },
            contentContainerStyle,
          ]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>

        {stickyFooter && (
          <View style={stickyFooterStyle}>
            {stickyFooter}
          </View>
        )}
      </View>
    );
  }

  // Keyboard Avoiding Mode (for forms, chat threads, authentication, checkout flows)
  const resolvedBehavior =
    keyboardBehavior ??
    Platform.select({
      // Edge-to-edge (Expo 54) disables adjustResize, so Android needs padding too
      ios: 'padding' as const,
      android: 'padding' as const,
      default: undefined,
    });
  const resolvedOffset =
    keyboardVerticalOffset ??
    Platform.select({
      ios: 0,
      android: 0,
      default: 0,
    });

  return (
    <KeyboardAvoidingView
      ref={ref as any}
      behavior={resolvedBehavior}
      enabled={keyboardShown}
      keyboardVerticalOffset={resolvedOffset}
      className={className}
      style={[
        styles.fill,
        {
          backgroundColor,
          paddingTop: edgePadding.paddingTop,
          paddingLeft: edgePadding.paddingLeft,
          paddingRight: edgePadding.paddingRight,
        },
        style,
        webViewportStyle,
      ]}
    >
      {noScroll ? (
        children
      ) : (
        <ScrollView
          ref={kavScrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.grow,
            {
              paddingBottom: edges.includes('bottom')
                ? Math.max(insets.bottom, 16) + (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding
                : (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding,
            },
            contentContainerStyle,
          ]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      )}


      {stickyFooter && (
        <View style={stickyFooterStyle}>
          {stickyFooter}
        </View>
      )}
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
      },
    }),
  },
});
