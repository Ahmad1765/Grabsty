import React, { useEffect, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  ViewStyle,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Text } from '@/lib/rnText';
import { colors, radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Sticky footer locked inside bottom thumb-zone */
  footer?: React.ReactNode;
  /** Snap height fraction between 0.3 and 0.95 (default: 0.75) */
  snapHeightRatio?: number;
  /** Whether inner content should be wrapped in a ScrollView */
  scrollable?: boolean;
  /** Custom header right element (e.g. "Clear" button) */
  headerRight?: React.ReactNode;
  /** Custom header replacement (overrides title, subtitle, headerRight) */
  customHeader?: React.ReactNode;
  /** Custom sheet background color (defaults to theme.panel for paper white) */
  sheetBackgroundColor?: string;
  /** Custom horizontal padding for scroll content (default: 20) */
  contentPaddingHorizontal?: number;
  /** Disable drag-to-dismiss gesture */
  disableDrag?: boolean;
  /** Fixed explicit height in pixels (overrides snapHeightRatio) */
  fixedHeight?: number;
  /** Auto-size to content height (ignores snapHeightRatio/fixedHeight) */
  autoHeight?: boolean;
  /** Optional custom container style */
  style?: ViewStyle;
}

const SPRING_CONFIG = {
  damping: 24,
  stiffness: 240,
  mass: 0.8,
};

/**
 * Mobile-Native 120fps Gesture-Driven Bottom Sheet Modal.
 * Powered by React Native Reanimated 4 and Gesture Handler with velocity-aware dismiss.
 */
export function BottomSheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  snapHeightRatio = 0.75,
  fixedHeight,
  autoHeight = false,
  scrollable = true,
  headerRight,
  customHeader,
  sheetBackgroundColor,
  contentPaddingHorizontal,
  disableDrag = false,
  style,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  // Live window height: a module-level Dimensions read goes stale on
  // foldables, split-screen and web resize, mis-sizing the sheet.
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const { theme } = useTheme();
  const calculatedHeight = fixedHeight ?? (autoHeight ? undefined : SCREEN_HEIGHT * Math.min(Math.max(snapHeightRatio, 0.3), 0.95));
  const fallbackDismissHeight = calculatedHeight ?? 400;

  const translateY = useSharedValue(Platform.OS === 'web' ? 0 : SCREEN_HEIGHT);
  const contextY = useSharedValue(0);

  // Internal visibility stays true during exit animation so the component
  // remains mounted until the slide-down completes.
  const [internalVisible, setInternalVisible] = useState(visible);

  // Trigger haptic tick on open
  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, () => {
        runOnJS(setInternalVisible)(false);
      });
    }
    // Resize alone must not replay the open haptic/spring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, translateY]);

  const handleDismiss = () => {
    onClose();
  };

  const panGesture = Gesture.Pan()
    .enabled(!disableDrag)
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      // Only allow dragging downwards or slight resistance upwards
      if (event.translationY > 0) {
        translateY.value = contextY.value + event.translationY;
      } else {
        translateY.value = contextY.value + event.translationY * 0.2;
      }
    })
    .onEnd((event) => {
      // Dismiss if dragged down by > 120px or with strong downward velocity
      if (event.translationY > 120 || event.velocityY > 600) {
        translateY.value = withTiming(fallbackDismissHeight + 100, { duration: 200 }, () => {
          runOnJS(handleDismiss)();
        });
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, (calculatedHeight ?? 300) * 0.7],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  if (!internalVisible) return null;

  const isScrollEnabled = autoHeight ? false : scrollable;
  const ContentWrapper = isScrollEnabled ? ScrollView : View;

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType={Platform.OS === 'web' ? 'fade' : 'none'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Backdrop Scrim (Z: 100) */}
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            style={styles.backdropPressable}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close modal"
          />
        </Animated.View>


        {/* Bottom Sheet Container (Z: 110) */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBackgroundColor ?? theme.panel,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            calculatedHeight ? { height: calculatedHeight } : { maxHeight: SCREEN_HEIGHT * 0.88 },
            sheetAnimatedStyle,
            style,
          ]}
        >
          {/* Ergonomic Drag Indicator Pill & Header with Pan Gesture */}
          <GestureDetector gesture={panGesture}>
            <View>
              <View style={styles.dragHandleContainer}>
                <View style={[styles.dragHandle, { backgroundColor: theme.hairline }]} />
              </View>

              {/* Custom Header or Default Header with Title & Dismiss Button */}
              {customHeader ? (
                customHeader
              ) : (title || subtitle || headerRight) ? (
                <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
                  <View style={styles.headerTextContainer}>
                    {title && (
                      <Text
                        style={[
                          styles.headerTitle,
                          { color: theme.ink, fontFamily: type.family.sansBold },
                        ]}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                    )}
                    {subtitle && (
                      <Text style={[styles.headerSubtitle, { color: theme.mute }]} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    )}
                  </View>

                  <View style={styles.headerActions}>
                    {headerRight}
                    <Pressable
                      onPress={onClose}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={[styles.closeButton, { backgroundColor: theme.panel }]}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Feather name="x" size={20} color={theme.ink} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </GestureDetector>

          {/* Dynamic Body Content */}
          <ContentWrapper
            {...(isScrollEnabled
              ? {
                  style: { flex: 1 },
                  showsVerticalScrollIndicator: false,
                  keyboardShouldPersistTaps: 'handled' as const,
                  keyboardDismissMode: 'on-drag' as const,
                  contentContainerStyle: [
                    styles.scrollContent,
                    contentPaddingHorizontal !== undefined && { paddingHorizontal: contentPaddingHorizontal },
                  ],
                }
              : {
                  style: [
                    styles.staticContent,
                    contentPaddingHorizontal !== undefined && { paddingHorizontal: contentPaddingHorizontal },
                  ],
                })}
          >
            {children}
          </ContentWrapper>

          {/* Thumb-Zone Pinned Footer (Z: 120 inside sheet) */}
          {footer && (
            <View style={[styles.footerContainer, { backgroundColor: sheetBackgroundColor ?? theme.panel, borderTopColor: theme.hairline }]}>
              {footer}
            </View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 15, 15, 0.45)',
    zIndex: 100,
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii['3xl'],
    borderTopRightRadius: radii['3xl'],
    zIndex: 110,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.1,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
      default: {
        boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.12)',
      },
    }),
  },
  dragHandleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.hairline,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.mute,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  staticContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.paper,
  },
});
