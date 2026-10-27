import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Pressable, Modal, ScrollView, Platform, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { type } from '@/lib/theme';
import * as Haptics from 'expo-haptics';

const DISPLAY_BOLD = type.family.sansBold;

export interface FullPagePickerProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  headerRight?: React.ReactNode;
}

export function FullPagePicker({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  scroll = true,
  headerRight,
}: FullPagePickerProps) {
  const { theme } = useTheme();
  const Content = scroll ? ScrollView : View;
  const closedByPopStateRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Prevent immediate double-tap or ghost click-through on sheet mount
  const [touchReady, setTouchReady] = useState(false);
  useEffect(() => {
    if (visible) {
      setTouchReady(false);
      const timer = setTimeout(() => setTouchReady(true), 250);
      return () => clearTimeout(timer);
    } else {
      setTouchReady(false);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onCloseRef.current();
  }, []);

  // Hardware back button integration on Android
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleClose]);

  // Escape key & history sync on Web (strictly depends on `visible` only)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    closedByPopStateRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Sync with browser history so the browser's Back button closes the full-page picker
    const stateId = `sell_picker_${Date.now()}`;
    try {
      window.history.pushState({ sellPicker: stateId }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      closedByPopStateRef.current = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (!closedByPopStateRef.current && window.history.state?.sellPicker === stateId) {
        window.history.back();
      }
    };
  }, [visible, handleClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        pointerEvents={touchReady ? 'auto' : 'none'}
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
      >
        <KeyboardAvoider style={{ flex: 1 }}>
        {/* Full Page Navigation Header */}
        <View
          style={{
            height: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          }}
        >
          {/* Back button (< arrow) */}
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.panel : 'transparent',
              marginLeft: -6,
            })}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>

          {/* Title & subtitle */}
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: DISPLAY_BOLD,
                fontSize: 17,
                color: theme.ink,
                letterSpacing: -0.2,
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: theme.mute,
                  marginTop: 1,
                  textAlign: 'center',
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* Right spacer or custom action */}
          <View style={{ width: 40, alignItems: 'flex-end', marginRight: -6 }}>
            {headerRight || <View style={{ width: 40 }} />}
          </View>
        </View>

        {/* Full Page Content */}
        <Content
          {...(scroll
            ? {
                style: { flex: 1 },
                showsVerticalScrollIndicator: true,
                keyboardShouldPersistTaps: 'handled' as const,
                contentContainerStyle: {
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: footer ? 24 : 60,
                },
              }
            : {
                style: {
                  flex: 1,
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: footer ? 24 : 60,
                },
              })}
        >
          {children}
        </Content>

        {/* Sticky Footer */}
        {footer ? (
          <View
            style={{
              backgroundColor: theme.surface,
            }}
          >
            {footer}
          </View>
        ) : null}
        </KeyboardAvoider>
      </SafeAreaView>
    </Modal>
  );
}

// Re-export BottomSheet as alias so all existing pickers seamlessly render as full pages
export const BottomSheet = FullPagePicker;
