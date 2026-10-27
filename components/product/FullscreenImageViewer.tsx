import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  useWindowDimensions,
  StyleSheet,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { Text } from '@/lib/rnText';
import { tap } from './shared';

export function FullscreenImageViewer({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const isInitialOpenRef = useRef(true);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // Sync to initialIndex whenever the viewer opens
  useEffect(() => {
    if (!visible) {
      isInitialOpenRef.current = true;
      return;
    }

    if (isInitialOpenRef.current) {
      setActiveIndex(initialIndex);
      isInitialOpenRef.current = false;
    }
  }, [visible, initialIndex]);

  if (!visible || !images || images.length === 0) return null;

  const targetIndex = isInitialOpenRef.current ? initialIndex : activeIndex;

  const handleLayout = () => {
    if (targetIndex > 0) {
      scrollRef.current?.scrollTo({
        x: targetIndex * width,
        y: 0,
        animated: false,
      });
    }
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    if (index !== activeIndex && index >= 0 && index < images.length) {
      setActiveIndex(index);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      tap('selection');
      const nextIdx = activeIndex - 1;
      setActiveIndex(nextIdx);
      scrollRef.current?.scrollTo({ x: nextIdx * width, y: 0, animated: true });
    }
  };

  const handleNext = () => {
    if (activeIndex < images.length - 1) {
      tap('selection');
      const nextIdx = activeIndex + 1;
      setActiveIndex(nextIdx);
      scrollRef.current?.scrollTo({ x: nextIdx * width, y: 0, animated: true });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar style="light" animated />
      <View style={[styles.backdrop, { flex: 1, width }]}>
        {/* Top Bar with Counter and Close Button */}
        <View style={styles.topBar}>
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>
              {activeIndex + 1} / {images.length}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              tap('selection');
              onClose();
            }}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Swipeable Image Gallery */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onLayout={handleLayout}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          bounces={images.length > 1}
          style={{ width, height }}
        >
          {images.map((uri, i) => (
            <View key={i} style={[styles.slide, { width, height }]}>
              <Image
                source={{
                  uri: getOptimizedImageUrl(uri, { width: Math.min(width * 2, 1600), quality: 90 }),
                }}
                style={{ width: width * 0.94, height: height * 0.82 }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={IMAGE_TRANSITION}
                priority={i === activeIndex ? 'high' : 'normal'}
              />
            </View>
          ))}
        </ScrollView>

        {/* Web/Desktop Navigation Arrows */}
        {Platform.OS === 'web' && images.length > 1 && activeIndex > 0 && (
          <Pressable
            onPress={handlePrev}
            style={({ pressed }) => [styles.arrowBtn, styles.leftArrow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Previous image"
          >
            <Feather name="chevron-left" size={26} color="#fff" />
          </Pressable>
        )}

        {Platform.OS === 'web' && images.length > 1 && activeIndex < images.length - 1 && (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [styles.arrowBtn, styles.rightArrow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Next image"
          >
            <Feather name="chevron-right" size={26} color="#fff" />
          </Pressable>
        )}

        {/* Pagination Dots (Bottom) */}
        {images.length > 1 && (
          <View style={styles.dotsContainer}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === activeIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#0a0a0a',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 50,
  },
  counterBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  counterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  leftArrow: {
    left: 18,
  },
  rightArrow: {
    right: 18,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    zIndex: 50,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#ffffff',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
});
