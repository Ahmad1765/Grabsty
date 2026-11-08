import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  ViewStyle,
  Pressable,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { getOptimizedImageUrl, thumbWidthFor, IMAGE_TRANSITION, prefetchImages } from '@/lib/images';
import { useProductDimensions } from '@/components/product/shared';

export interface ImageCarouselProps {
  images: string[];
  aspectRatio?: '1:1' | '4:5';
  onImagePress?: (index: number) => void;
  className?: string;
  style?: ViewStyle;
  placeholderImage?: string;
  listingId?: string;
  /** Desktop thumbnails drive the carousel through this pair. */
  index?: number;
  onIndexChange?: (index: number) => void;
}

/**
 * Mobile-Native Image Carousel.
 * Full-bleed swipeable gallery with momentum pagination,
 * dynamic active indicator dots, and crisp tap-to-expand.
 */
export function ImageCarousel({
  images,
  aspectRatio = '4:5',
  onImagePress,
  className = '',
  style,
  placeholderImage,
  listingId,
  index: requestedIndex,
  onIndexChange,
}: ImageCarouselProps) {
  const { theme } = useTheme();
  // Phone: the window up to CONTENT_MAX_WIDTH. Desktop: the gallery column.
  const { contentWidth, desktop } = useProductDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(contentWidth);
  const scrollRef = useRef<ScrollView>(null);

  const validImages = useMemo(() => (images || []).filter(Boolean), [images]);

  // Proactively prefetch adjacent gallery images on mount so swipes are instantaneous
  useEffect(() => {
    if (validImages.length > 1) {
      const targetWidth = thumbWidthFor(carouselWidth);
      const toPrefetch = validImages
        .slice(1)
        .map((u) => getOptimizedImageUrl(u, { width: targetWidth }));
      prefetchImages(toPrefetch);
    }
  }, [validImages, carouselWidth]);

  const prevWidthRef = useRef(carouselWidth);
  useEffect(() => {
    setCarouselWidth(contentWidth);
  }, [contentWidth]);

  // Only realign when carouselWidth actually changes (e.g. device rotation), never during swipes
  useEffect(() => {
    if (prevWidthRef.current !== carouselWidth && carouselWidth > 0) {
      prevWidthRef.current = carouselWidth;
      scrollRef.current?.scrollTo({
        x: activeIndex * carouselWidth,
        y: 0,
        animated: false,
      });
    }
  }, [carouselWidth, activeIndex]);

  // Height based on aspect ratio
  const carouselHeight = aspectRatio === '1:1' ? carouselWidth : carouselWidth * 1.25;

  // Smooth scroll to a slide. On web, snap is suspended for the scroll so the
  // browser doesn't fight the animation.
  const scrollToIndex = useCallback(
    (target: number) => {
      const node: any = scrollRef.current;
      const scrollNode: HTMLElement | null =
        typeof node?.getScrollableNode === 'function'
          ? node.getScrollableNode()
          : node instanceof HTMLElement
          ? node
          : null;
      const targetX = target * carouselWidth;
      if (scrollNode) {
        scrollNode.style.scrollSnapType = 'none';
        scrollNode.style.scrollBehavior = 'smooth';
        try {
          (scrollNode as any).scrollTo?.({ x: targetX, y: 0, animated: true });
          (Element.prototype.scrollTo as any).call(scrollNode, { left: targetX, behavior: 'smooth' });
        } catch {
          scrollNode.scrollLeft = targetX;
        }
        setTimeout(() => {
          if (scrollNode) {
            scrollNode.style.scrollSnapType = 'x mandatory';
          }
        }, 350);
      } else {
        scrollRef.current?.scrollTo({ x: targetX, y: 0, animated: true });
      }
    },
    [carouselWidth],
  );

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(validImages.length - 1, target));
      setActiveIndex(clamped);
      scrollToIndex(clamped);
    },
    [validImages.length, scrollToIndex],
  );

  // Desktop thumbnails ask for a slide; the carousel reports where it is.
  useEffect(() => {
    if (requestedIndex != null && requestedIndex !== activeIndex) goTo(requestedIndex);
    // Only a new request should move the carousel, not its own index updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedIndex]);
  useEffect(() => {
    onIndexChange?.(activeIndex);
  }, [activeIndex, onIndexChange]);

  const touchStartPos = useRef({ x: 0, y: 0, time: 0 });
  const isSwiping = useRef(false);
  const lastSwipeTime = useRef(0);

  const handleTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent?.touches?.[0] || e.touches?.[0] || e.nativeEvent;
    if (!touch) return;
    touchStartPos.current = {
      x: touch.clientX ?? touch.pageX,
      y: touch.clientY ?? touch.pageY,
      time: Date.now(),
    };
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    const touch = e.nativeEvent?.touches?.[0] || e.touches?.[0] || e.nativeEvent;
    if (!touch) return;
    const dx = Math.abs((touch.clientX ?? touch.pageX) - touchStartPos.current.x);
    const dy = Math.abs((touch.clientY ?? touch.pageY) - touchStartPos.current.y);
    if (dx > 6 && dx > dy) {
      isSwiping.current = true;
      lastSwipeTime.current = Date.now();
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: any) => {
      const touch = e.nativeEvent?.changedTouches?.[0] || e.changedTouches?.[0] || e.nativeEvent;
      const endX = touch ? (touch.clientX ?? touch.pageX) : touchStartPos.current.x;
      const dx = endX - touchStartPos.current.x;
      const dt = Date.now() - touchStartPos.current.time;
      const velocity = Math.abs(dx) / Math.max(1, dt);
      const threshold = Math.min(45, carouselWidth * 0.15);

      if (isSwiping.current || Math.abs(dx) > threshold) {
        lastSwipeTime.current = Date.now();
        let target = activeIndex;
        if (dx < -threshold || (dx < -12 && velocity > 0.16)) {
          if (activeIndex < validImages.length - 1) {
            target = activeIndex + 1;
          }
        } else if (dx > threshold || (dx > 12 && velocity > 0.16)) {
          if (activeIndex > 0) {
            target = activeIndex - 1;
          }
        }

        setActiveIndex(target);
        scrollToIndex(target);
        setTimeout(() => {
          isSwiping.current = false;
        }, 350);
      } else {
        isSwiping.current = false;
      }
    },
    [activeIndex, carouselWidth, validImages.length, scrollToIndex],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselWidth);
      if (index !== activeIndex && index >= 0 && index < validImages.length) {
        setActiveIndex(index);
      }
    },
    [activeIndex, carouselWidth, validImages.length]
  );

  const handleImagePress = useCallback(
    (index: number) => {
      if (isSwiping.current || Date.now() - lastSwipeTime.current < 400) {
        return;
      }
      onImagePress?.(index);
    },
    [onImagePress],
  );

  if (validImages.length === 0) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          { height: carouselHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel },
          style,
        ]}
      >
        <Feather name="image" size={36} color={theme.mute} />
      </View>
    );
  }

  return (
    <View
      testID="product-hero-carousel"
      className={className}
      style={[styles.container, { height: carouselHeight, backgroundColor: theme.panel }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - carouselWidth) > 2) {
          setCarouselWidth(w);
        }
      }}
      onTouchStart={validImages.length > 1 ? handleTouchStart : undefined}
      onTouchMove={validImages.length > 1 ? handleTouchMove : undefined}
      onTouchEnd={validImages.length > 1 ? handleTouchEnd : undefined}
      onTouchCancel={validImages.length > 1 ? handleTouchEnd : undefined}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={validImages.length > 1}
        style={styles.scroll}
      >
        {validImages.map((uri, index) => (
          <CarouselSlide
            key={listingId ? `${listingId}-${index}` : `${uri}-${index}`}
            uri={uri}
            index={index}
            width={carouselWidth}
            height={carouselHeight}
            placeholderUri={index === 0 ? placeholderImage : undefined}
            listingId={listingId}
            onPress={onImagePress ? () => handleImagePress(index) : undefined}
          />
        ))}
      </ScrollView>

      {/* Desktop: a mouse can't swipe, so give it previous / next. */}
      {desktop && validImages.length > 1 && (
        <>
          {activeIndex > 0 && (
            <ArrowButton side="left" onPress={() => goTo(activeIndex - 1)} />
          )}
          {activeIndex < validImages.length - 1 && (
            <ArrowButton side="right" onPress={() => goTo(activeIndex + 1)} />
          )}
        </>
      )}

      {/* Bar-style page indicators (bottom center) */}
      {validImages.length > 1 && (
        <View style={styles.indicatorWrapper} pointerEvents="none">
          <View style={styles.barContainer}>
            {validImages.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  i === activeIndex ? styles.barActive : styles.barInactive,
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function ArrowButton({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? 'Previous photo' : 'Next photo'}
      style={(state) => [
        styles.arrow,
        side === 'left' ? { left: 14 } : { right: 14 },
        { opacity: (state as { hovered?: boolean }).hovered ? 1 : 0.88 },
      ]}
    >
      <Feather name={side === 'left' ? 'chevron-left' : 'chevron-right'} size={20} color="#111111" />
    </Pressable>
  );
}

const CarouselSlide = React.memo(
  function CarouselSlide({
    uri,
    index,
    width,
    height,
    placeholderUri,
    listingId,
    onPress,
  }: {
    uri: string;
    index: number;
    width: number;
    height: number;
    placeholderUri?: string;
    listingId?: string;
    onPress?: () => void;
  }) {
    const optimizedUri = getOptimizedImageUrl(uri, { width: thumbWidthFor(width) });
    const imageElement = (
      <Image
        source={{ uri: optimizedUri }}
        placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={IMAGE_TRANSITION}
        priority={index === 0 ? 'high' : 'normal'}
        cachePolicy="memory-disk"
        recyclingKey={listingId ? `${listingId}-${index}` : undefined}
        style={styles.image}
      />
    );

    if (onPress) {
      return (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="View full photo"
          style={({ pressed }) => [
            styles.slide,
            { width, height, opacity: pressed ? 0.96 : 1 },
          ]}
        >
          {imageElement}
        </Pressable>
      );
    }

    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="Product photo"
        style={[styles.slide, { width, height }]}
      >
        {imageElement}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.index === next.index &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.placeholderUri === next.placeholderUri &&
    prev.listingId === next.listingId &&
    (prev.onPress !== undefined) === (next.onPress !== undefined),
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    ...Platform.select({
      web: {
        scrollSnapType: 'x mandatory',
        WebkitScrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        overscrollBehaviorX: 'contain',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      } as any,
    }),
  },
  slide: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        scrollSnapAlign: 'start',
        WebkitScrollSnapAlign: 'start',
        flexShrink: 0,
      } as any,
    }),
  },
  image: {
    width: '100%',
    height: '100%',
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    zIndex: 12,
  },
  indicatorWrapper: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bar: {
    height: 4,
    borderRadius: 2,
  },
  barActive: {
    width: 20,
    backgroundColor: '#FFFFFF',
  },
  barInactive: {
    width: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
});
