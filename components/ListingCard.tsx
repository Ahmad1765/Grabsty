import { memo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '@/lib/rnText';
// expo-image straight, deliberately NOT Animated.createAnimatedComponent(Image):
// nothing on this card ever animates the photo, and the wrapper cost a
// Reanimated-managed component plus its props node per photo, per card, on every
// FlashList recycle. (The product screen's hero carousel is a different case.)
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  cardImageUrl,
  getOptimizedImageUrl,
  thumbWidthFor,
  IMAGE_TRANSITION,
  setImagePlaceholder,
  prefetchImages,
} from '@/lib/images';
import { putCachedListing } from '@/lib/listingCache';

import { peekLikedIds } from '@/lib/engagementCache';
import { formatPrice } from '@/lib/currency';
import { priceBreakdown } from '@/lib/fees';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { isLiked as fetchIsLiked, toggleLike } from '@/lib/listings';
import { useGuestGate } from '@/components/GuestGate';
import { PopIcon, type PopIconHandle } from '@/components/product/PopIcon';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { SoldBadge } from '@/components/ui/SoldBadge';
import { BRAND_PURPLE, conditionLabel } from '@/components/product/shared';
import { radii, shadow } from '@/lib/theme';
import type { Listing } from '@/types';

import { useTheme } from '@/context/ThemeContext';
interface Props {
  listing: Listing;
  // Rendered width of the card, when the caller already knows it. Every grid in
  // the app computes this via useGridDimensions and wraps the card in a
  // `style={{ width }}` view, so measuring it again with onLayout only bought a
  // second render per card (and a first frame at the wrong image source width).
  // Left optional so any call site that genuinely can't know its width keeps
  // the self-measuring behaviour.
  width?: number;
}

export const ListingCard = memo(function ListingCard({ listing, width }: Props) {
  const { theme: colors } = useTheme();
  const { user } = useAuth();
  // Narrowed once, then used everywhere below instead of `user?.id`.
  //
  // This is not cosmetic. React Compiler refuses to compile a component whose
  // manual memoization it cannot preserve, and reading `user.id` inside a
  // useCallback that lists `user?.id` as a dependency made it infer the whole
  // `user` object as the real dependency ("Inferred less specific property than
  // source") — so it bailed out of ListingCard entirely. Depending on a plain
  // string makes the inferred and declared dependencies agree.
  const userId = user?.id ?? null;
  const toast = useToast();
  const guestGate = useGuestGate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const cardWidth = width ?? measuredWidth;
  // Seeded from the warm cache so the very first paint already shows the right
  // heart, rather than rendering unliked and correcting itself a tick later.
  // (Only runs on a true mount; FlashList recycles are handled by the effect.)
  const [liked, setLiked] = useState(() =>
    userId ? (peekLikedIds(userId)?.has(listing.id) ?? false) : false,
  );
  const [likeCount, setLikeCount] = useState(listing.likes ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  // Multi-photo cards mount only their first slide until the shopper actually
  // touches the carousel — see the ScrollView below.
  const [carouselHydrated, setCarouselHydrated] = useState(false);
  // images is nullable in Postgres; `['']` keeps the carousel's single-slot
  // placeholder behaviour for rows with no photos.
  //
  // `images` is only used for its LENGTH and slide identity here — every actual
  // source goes through cardImageUrl(), which prefers the card-sized copy in
  // listings.thumbnails. A tile is ~194px wide; the full-size upload is 1440px
  // (~260 KB) and legacy rows can be far larger, so this is the difference
  // between ~40 KB and ~260 KB per visible card.
  const images = listing.images?.length ? listing.images : [''];
  const hasMultiple = images.length > 1;

  const likedInteractedRef = useRef(false);
  // Imperative handle for the like pop — fired on tap so the Instagram-style
  // spring bounce never rides an async server-hydration update.
  const heartAnimRef = useRef<PopIconHandle>(null);
  const carouselRef = useRef<Animated.ScrollView>(null);
  const pointerDownPos = useRef({ x: 0, y: 0, time: 0 });
  const isSwipingOrDragging = useRef(false);
  const lastDragEndTime = useRef(0);
  const webScrollTimeoutRef = useRef<any>(null);
  const containerRef = useRef<any>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const hasMultipleRef = useRef(hasMultiple);
  hasMultipleRef.current = hasMultiple;
  const imagesLengthRef = useRef(images.length);
  imagesLengthRef.current = images.length;
  const cardWidthRef = useRef(cardWidth);
  cardWidthRef.current = cardWidth;

  useEffect(() => {
    return () => {
      if (webScrollTimeoutRef.current) {
        clearTimeout(webScrollTimeoutRef.current);
      }
    };
  }, []);

  // Hydrate the liked state for the current user. Cards are recycled in the
  // feed grid so we re-run this whenever the listing id or user changes.
  //
  // The warm-cache path is deliberately synchronous. fetchIsLiked is async even
  // when the answer is already in memory, so every card used to render once with
  // `liked=false`, resolve a microtask, then setState and render AGAIN — per
  // card, and again on every FlashList recycle mid-scroll. That doubled render
  // work sat on the UI thread and was the main contributor to the 33% janky
  // frames measured while scrolling the feed. peekLikedIds answers from the same
  // cache without a promise, so the common case now costs zero extra renders
  // (setState with an unchanged value bails out inside React).
  useEffect(() => {
    // A recycled instance is showing a different listing now, so the previous
    // shopper's "they swiped this one" flag no longer applies. Cards that were
    // never swiped are already false, and React bails out of an unchanged
    // setState, so this costs a render only on cards that were actually opened.
    setCarouselHydrated(false);

    if (!userId) {
      setLiked(false);
      return;
    }
    likedInteractedRef.current = false;

    const warm = peekLikedIds(userId);
    if (warm) {
      setLiked(warm.has(listing.id));
      return;
    }

    // Cold cache only: one batched round-trip, shared by every card mounting in
    // this frame (engagementCache dedupes in-flight requests).
    let cancelled = false;
    fetchIsLiked(listing.id, userId).then((v) => {
      if (!cancelled && !likedInteractedRef.current) setLiked(v);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id, userId]);

  // Keep the visible count in sync when the parent re-fetches and `likes`
  // changes from the server (e.g. someone else liked the listing). Skipped on
  // the first run: likeCount is already initialized to this exact value above,
  // so firing on mount was a guaranteed no-op render for every card in the grid.
  const likesHydrated = useRef(false);
  useEffect(() => {
    if (!likesHydrated.current) {
      likesHydrated.current = true;
      return;
    }
    setLikeCount(listing.likes ?? 0);
  }, [listing.likes]);

  // Multi-image listings are swipeable again (reverted from the auto-advancing
  // slideshow). A horizontal paging ScrollView lets the shopper flick through
  // every photo at their own pace; the dots below track the current page.
  //
  // The scroll runs on the UI thread. This used to be a plain `onScroll` with
  // `scrollEventThrottle={16}`, which means a JS-thread callback every frame of
  // every carousel swipe — on a card inside a feed that is itself scrolling and
  // recycling. Now a worklet writes the offset to a shared value and the dots
  // read it inside useAnimatedStyle, so a swipe animates without re-rendering
  // any React component at all. (Same mechanism as AnimatedTabBar and the
  // product screen's HeroPageDot.)
  // First contact with the carousel promotes it from "thumbnail" to "gallery"
  // and mounts the remaining slides. Repeat touches are free — React bails out
  // of a setState that doesn't change the value.
  const hydrateCarousel = useCallback(() => {
    setCarouselHydrated(true);
  }, []);

  const handleDragBegin = useCallback(() => {
    hydrateCarousel();
    isSwipingOrDragging.current = true;
  }, [hydrateCarousel]);

  const handleDragEnd = useCallback(() => {
    lastDragEndTime.current = Date.now();
    if (webScrollTimeoutRef.current) {
      clearTimeout(webScrollTimeoutRef.current);
    }
    webScrollTimeoutRef.current = setTimeout(() => {
      isSwipingOrDragging.current = false;
    }, 450);
  }, []);

  const offsetX = useSharedValue(0);
  const pageW = useSharedValue(0);
  const carouselScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      offsetX.value = e.contentOffset.x;
      // Read from the event rather than assuming cardWidth, exactly as the old
      // JS handler did — it is the measured viewport width of the slide.
      pageW.value = e.layoutMeasurement.width;
    },
    onBeginDrag: () => {
      runOnJS(handleDragBegin)();
    },
    onEndDrag: () => {
      runOnJS(handleDragEnd)();
    },
    onMomentumBegin: () => {
      runOnJS(handleDragBegin)();
    },
    onMomentumEnd: () => {
      runOnJS(handleDragEnd)();
    },
  });

  // The JS thread is crossed once per PAGE CHANGE, not once per frame. React
  // still needs `activeIndex`, but only for the lazy-slide invariant below (a
  // recycled card parked mid-carousel must render its current slide for real).
  useAnimatedReaction(
    () => {
      if (pageW.value <= 0) return 0;
      return Math.round(offsetX.value / pageW.value);
    },
    (page, previous) => {
      // `previous` is null on the reaction's first run, at mount. Without the
      // null guard that first run always crosses to JS to set activeIndex to
      // the 0 it already is — one wasted hop per card, i.e. ~60 on a feed
      // screen, which is precisely the cost this handler exists to avoid.
      // A real 0 → 1 change still fires: by then `previous` is 0, not null.
      if (previous !== null && page !== previous) runOnJS(setActiveIndex)(page);
    },
  );

  const handleToggleLike = useCallback(async () => {
    if (!userId) {
      guestGate.prompt({
        title: 'Save your favourites',
        message: 'Create a free account to like items and keep everything you love in one place.',
        icon: 'heart',
        resume: { kind: 'like', listingId: listing.id },
      });
      return;
    }
    if (likeBusy) return;
    likedInteractedRef.current = true;
    const prev = liked;
    const next = !prev;
    // Optimistic flip — rollback below if the server disagrees.
    heartAnimRef.current?.animateTo(next);
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setLikeBusy(true);

    // Undo the optimistic flip. Declared OUT here rather than inlined into the
    // try/catch below, and the trailing setLikeBusy(false) is deliberately not
    // in a `finally`. Both shapes are required by
    // babel-plugin-react-compiler@1.0.0, which bails out of the WHOLE enclosing
    // component — not just the offending function — on either of:
    //
    //   • "Handle TryStatement with a finalizer ('finally') clause"
    //   • "Support value blocks (conditional, logical, optional chaining, etc)
    //      within a try/catch statement"  ← `heartAnimRef.current?.animateTo`
    //
    // That cost React Compiler memoization for all of ListingCard, the most
    // rendered component in the app (~60 live instances on a feed screen). Keep
    // optional chaining, ternaries, `&&`/`||`/`??` out of the try/catch bodies.
    //
    // The `finally` removal is exactly equivalent, not merely close: neither the
    // try nor the catch contains a `return`, `break`, or `continue`, and the
    // catch deliberately does not re-throw (see below), so control always
    // reaches the next statement. Re-check that before adding an early return.
    const rollback = () => {
      heartAnimRef.current?.animateTo(prev);
      setLiked(prev);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    };

    try {
      const result = await toggleLike(listing.id, userId, prev);
      if (result !== next) rollback();
    } catch (error) {
      // We intentionally do NOT re-throw — the onPress caller doesn't await
      // this, so a throw would become an unhandled promise rejection.
      rollback();
      console.warn('[ListingCard] toggleLike failed:', error);
      toast.show("Couldn't update like", { variant: 'default', icon: 'alert-triangle' });
    }
    setLikeBusy(false);
  }, [liked, likeBusy, listing.id, toast, userId, guestGate]);

  useEffect(() => {
    if (cardWidth > 0) {
      pageW.value = cardWidth;
    }
  }, [cardWidth, pageW]);

  const isPointerDownRef = useRef(false);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });
  const pointerStartScrollRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const getScrollEl = useCallback((): HTMLElement | null => {
    if (Platform.OS !== 'web') return null;
    if (containerRef.current) {
      const container =
        typeof containerRef.current.getScrollableNode === 'function'
          ? containerRef.current.getScrollableNode()
          : containerRef.current instanceof HTMLElement
          ? containerRef.current
          : containerRef.current?._innerViewRef;
      if (container instanceof HTMLElement) {
        const scrollChild = Array.from(container.querySelectorAll<HTMLElement>('*')).find(
          (el) => el.scrollWidth > el.clientWidth,
        );
        if (scrollChild) return scrollChild;
      }
    }
    if (carouselRef.current) {
      const target = carouselRef.current as any;
      const node =
        (typeof target.getScrollableNode === 'function' && target.getScrollableNode()) ||
        (typeof target._component?.getScrollableNode === 'function' && target._component.getScrollableNode()) ||
        target._component ||
        target;
      if (node instanceof HTMLElement) {
        if (node.scrollWidth > node.clientWidth) return node;
        const inner = Array.from(node.querySelectorAll?.<HTMLElement>('*') || []).find(
          (el: any) => el.scrollWidth > el.clientWidth,
        );
        if (inner) return inner as HTMLElement;
      }
    }
    return null;
  }, []);

  const startDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!hasMultiple) return;
      hydrateCarousel();

      isPointerDownRef.current = true;
      hasDraggedRef.current = false;
      pointerStartPosRef.current = { x: clientX, y: clientY };

      const scrollEl = getScrollEl();
      if (scrollEl) {
        pointerStartScrollRef.current = scrollEl.scrollLeft;
        scrollEl.style.scrollSnapType = 'none';
        scrollEl.style.scrollBehavior = 'auto';
      } else {
        pointerStartScrollRef.current = activeIndex * (cardWidth || 200);
      }
    },
    [hasMultiple, hydrateCarousel, getScrollEl, activeIndex, cardWidth],
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number, preventDefault?: () => void) => {
      if (!isPointerDownRef.current || !hasMultiple) return;

      const dx = clientX - pointerStartPosRef.current.x;
      const dy = clientY - pointerStartPosRef.current.y;

      if (!hasDraggedRef.current) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          if (Math.abs(dy) > Math.abs(dx)) {
            // Dominant vertical motion: shopper is scrolling the feed.
            // Cancel carousel dragging and restore scroll snap.
            isPointerDownRef.current = false;
            const scrollEl = getScrollEl();
            if (scrollEl) {
              scrollEl.style.scrollSnapType = 'x mandatory';
            }
            return;
          }
          hasDraggedRef.current = true;
          isSwipingOrDragging.current = true;
          lastDragEndTime.current = Date.now();
          setIsDragging(true);
        }
      }

      if (hasDraggedRef.current) {
        preventDefault?.();
        const scrollEl = getScrollEl();
        if (scrollEl) {
          scrollEl.scrollLeft = pointerStartScrollRef.current - dx;
        } else {
          carouselRef.current?.scrollTo({ x: pointerStartScrollRef.current - dx, animated: false });
        }
      }
    },
    [hasMultiple, getScrollEl],
  );

  const endDrag = useCallback(
    (clientX?: number) => {
      if (!isPointerDownRef.current || !hasMultiple) return;
      isPointerDownRef.current = false;
      setIsDragging(false);

      const scrollEl = getScrollEl();
      if (hasDraggedRef.current) {
        const endX = clientX ?? pointerStartPosRef.current.x;
        const dx = endX - pointerStartPosRef.current.x;
        const w = cardWidth || 200;
        const threshold = Math.min(36, w * 0.16);

        const startPage = Math.max(
          0,
          Math.min(images.length - 1, Math.round(pointerStartScrollRef.current / w)),
        );
        let target = startPage;
        if (dx < -threshold && startPage < images.length - 1) {
          target = startPage + 1;
        } else if (dx > threshold && startPage > 0) {
          target = startPage - 1;
        }

        setActiveIndex(target);
        offsetX.value = target * w;
        lastDragEndTime.current = Date.now();
        isSwipingOrDragging.current = true;

        const targetX = target * w;
        if (scrollEl) {
          scrollEl.style.scrollSnapType = 'none';
          scrollEl.style.scrollBehavior = 'smooth';
          try {
            (scrollEl as any).scrollTo?.({ x: targetX, y: 0, animated: true });
            (Element.prototype.scrollTo as any).call(scrollEl, { left: targetX, behavior: 'smooth' });
          } catch {
            scrollEl.scrollLeft = targetX;
          }
          // Delay restoring snap-type so WebKit does not cancel smooth scroll mid-flight
          setTimeout(() => {
            if (scrollEl) {
              scrollEl.style.scrollSnapType = 'x mandatory';
            }
          }, 350);
        } else {
          carouselRef.current?.scrollTo({ x: targetX, animated: true });
        }

        if (webScrollTimeoutRef.current) {
          clearTimeout(webScrollTimeoutRef.current);
        }
        webScrollTimeoutRef.current = setTimeout(() => {
          isSwipingOrDragging.current = false;
        }, 450);
      } else {
        if (scrollEl) {
          scrollEl.style.scrollSnapType = 'x mandatory';
        }
      }
      hasDraggedRef.current = false;
    },
    [hasMultiple, getScrollEl, cardWidth, images.length, offsetX],
  );

  const cancelDrag = useCallback(() => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    setIsDragging(false);
    hasDraggedRef.current = false;
    isSwipingOrDragging.current = false;
    const scrollEl = getScrollEl();
    if (scrollEl) {
      scrollEl.style.scrollSnapType = 'x mandatory';
    }
  }, [getScrollEl]);

  const handlePointerDown = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web' || !hasMultiple) return;
      // On web touch screens, touch events handle swiping; skip mouse pointer capture
      if (e.pointerType === 'touch') return;
      if (e.button !== undefined && e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest?.('button, [role="button"]')) {
        return;
      }

      const clientX = e.clientX ?? e.nativeEvent?.clientX;
      const clientY = e.clientY ?? e.nativeEvent?.clientY;
      if (clientX === undefined) return;

      startDrag(clientX, clientY);

      if (e.target?.setPointerCapture && e.pointerId !== undefined) {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch {}
      }
    },
    [hasMultiple, startDrag],
  );

  const handlePointerMove = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web' || !isPointerDownRef.current || !hasMultiple) return;

      const clientX = e.clientX ?? e.nativeEvent?.clientX;
      const clientY = e.clientY ?? e.nativeEvent?.clientY;
      if (clientX === undefined) return;

      moveDrag(clientX, clientY, () => e.preventDefault?.());
    },
    [hasMultiple, moveDrag],
  );

  const handlePointerUp = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web' || !isPointerDownRef.current || !hasMultiple) return;

      if (e.target?.releasePointerCapture && e.pointerId !== undefined) {
        try {
          e.target.releasePointerCapture(e.pointerId);
        } catch {}
      }

      const clientX = e.clientX ?? e.nativeEvent?.clientX;
      endDrag(clientX);
    },
    [hasMultiple, endDrag],
  );

  const handlePointerCancel = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web') return;
      cancelDrag();
    },
    [cancelDrag],
  );

  const touchStartPosRef = useRef<{ x: number; y: number; time: number; startIndex: number }>({
    x: 0,
    y: 0,
    time: 0,
    startIndex: 0,
  });
  const touchLastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasTouchSwipedRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: any) => {
      if (!hasMultiple) return;
      hydrateCarousel();
      const touch = e.nativeEvent?.touches?.[0] || e.touches?.[0] || e.nativeEvent;
      if (!touch) return;
      const clientX = touch.clientX ?? touch.pageX;
      const clientY = touch.clientY ?? touch.pageY;
      if (clientX !== undefined && clientY !== undefined) {
        touchStartPosRef.current = {
          x: clientX,
          y: clientY,
          time: Date.now(),
          startIndex: activeIndex,
        };
        touchLastPosRef.current = { x: clientX, y: clientY };
        hasTouchSwipedRef.current = false;
      }
    },
    [hasMultiple, hydrateCarousel, activeIndex],
  );

  const handleTouchMove = useCallback(
    (e: any) => {
      if (!hasMultiple) return;
      const touch = e.nativeEvent?.touches?.[0] || e.touches?.[0] || e.nativeEvent;
      if (!touch) return;
      const clientX = touch.clientX ?? touch.pageX;
      const clientY = touch.clientY ?? touch.pageY;
      if (clientX !== undefined && clientY !== undefined) {
        touchLastPosRef.current = { x: clientX, y: clientY };
        const dx = Math.abs(clientX - touchStartPosRef.current.x);
        const dy = Math.abs(clientY - touchStartPosRef.current.y);
        if (dx > 6 && dx > dy) {
          hasTouchSwipedRef.current = true;
          isSwipingOrDragging.current = true;
          lastDragEndTime.current = Date.now();
        }
      }
    },
    [hasMultiple],
  );

  const handleTouchEnd = useCallback(
    (e: any) => {
      const touch = e?.nativeEvent?.changedTouches?.[0] || e?.changedTouches?.[0] || e?.nativeEvent;
      const endX = touch ? (touch.clientX ?? touch.pageX) : touchLastPosRef.current.x;
      const dx = endX - touchStartPosRef.current.x;
      const dt = Date.now() - touchStartPosRef.current.time;
      const velocity = Math.abs(dx) / Math.max(1, dt);
      const w = cardWidth || 200;
      const threshold = Math.min(28, w * 0.14);

      if (hasTouchSwipedRef.current || Math.abs(dx) > threshold) {
        lastDragEndTime.current = Date.now();
        isSwipingOrDragging.current = true;

        const startIdx = touchStartPosRef.current.startIndex;
        let target = startIdx;
        if (dx < -threshold || (dx < -10 && velocity > 0.16)) {
          if (startIdx < images.length - 1) {
            target = startIdx + 1;
          }
        } else if (dx > threshold || (dx > 10 && velocity > 0.16)) {
          if (startIdx > 0) {
            target = startIdx - 1;
          }
        }

        const scrollEl = getScrollEl();
        const slideW = scrollEl?.clientWidth || cardWidth || 200;
        setActiveIndex(target);
        offsetX.value = target * slideW;
        const targetX = target * slideW;
        if (scrollEl) {
          scrollEl.style.scrollSnapType = 'none';
          scrollEl.style.scrollBehavior = 'smooth';
          try {
            (scrollEl as any).scrollTo?.({ x: targetX, y: 0, animated: true });
            (Element.prototype.scrollTo as any).call(scrollEl, { left: targetX, behavior: 'smooth' });
          } catch {
            scrollEl.scrollLeft = targetX;
          }
          setTimeout(() => {
            if (scrollEl) {
              scrollEl.style.scrollSnapType = 'x mandatory';
            }
          }, 350);
        } else {
          carouselRef.current?.scrollTo({ x: targetX, animated: true });
        }

        if (webScrollTimeoutRef.current) {
          clearTimeout(webScrollTimeoutRef.current);
        }
        webScrollTimeoutRef.current = setTimeout(() => {
          isSwipingOrDragging.current = false;
        }, 450);
      }
      hasTouchSwipedRef.current = false;
    },
    [cardWidth, images.length, getScrollEl, offsetX],
  );

  const handleTouchCancel = useCallback(() => {
    hasTouchSwipedRef.current = false;
    isSwipingOrDragging.current = false;
  }, []);

  // Web capture phase interception: halts synthetic clicks following swipes before
  // bubbling to the card's outer Pressable, and handles native mobile web swipes reliably.
  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;
    const node = containerRef.current as any;
    const target: HTMLElement | null =
      typeof node.getScrollableNode === 'function'
        ? node.getScrollableNode()
        : node instanceof HTMLElement
        ? node
        : (node._innerViewRef ?? null);

    if (!target) return;

    const handleClickCapture = (e: MouseEvent) => {
      if (isSwipingOrDragging.current || Date.now() - lastDragEndTime.current < 450) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startIdx = 0;
    let hasSwiped = false;

    const onNativeTouchStart = (e: TouchEvent) => {
      if (!hasMultipleRef.current) return;
      hydrateCarousel();
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      startIdx = activeIndexRef.current;
      hasSwiped = false;
    };

    const onNativeTouchMove = (e: TouchEvent) => {
      if (!hasMultipleRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (dx > 6 && dx > dy) {
        hasSwiped = true;
        isSwipingOrDragging.current = true;
        lastDragEndTime.current = Date.now();
      }
    };

    const onNativeTouchEnd = (e: TouchEvent) => {
      if (!hasMultipleRef.current) return;
      const t = e.changedTouches[0];
      const endX = t ? t.clientX : startX;
      const dx = endX - startX;
      const dt = Date.now() - startTime;
      const velocity = Math.abs(dx) / Math.max(1, dt);
      const scrollEl = getScrollEl();
      const slideW = scrollEl?.clientWidth || cardWidthRef.current || 200;
      const threshold = Math.min(28, slideW * 0.14);

      if (hasSwiped || Math.abs(dx) > threshold) {
        lastDragEndTime.current = Date.now();
        isSwipingOrDragging.current = true;

        let targetIdx = startIdx;
        if (dx < -threshold || (dx < -10 && velocity > 0.16)) {
          if (startIdx < imagesLengthRef.current - 1) {
            targetIdx = startIdx + 1;
          }
        } else if (dx > threshold || (dx > 10 && velocity > 0.16)) {
          if (startIdx > 0) {
            targetIdx = startIdx - 1;
          }
        }

        const targetX = targetIdx * slideW;
        if (scrollEl) {
          scrollEl.style.scrollSnapType = 'none';
          scrollEl.style.scrollBehavior = 'smooth';
          try {
            (scrollEl as any).scrollTo?.({ x: targetX, y: 0, animated: true });
            (Element.prototype.scrollTo as any).call(scrollEl, { left: targetX, behavior: 'smooth' });
          } catch {
            scrollEl.scrollLeft = targetX;
          }
          setTimeout(() => {
            if (scrollEl) {
              scrollEl.style.scrollSnapType = 'x mandatory';
            }
          }, 350);
        } else {
          carouselRef.current?.scrollTo({ x: targetX, animated: true });
        }

        if (webScrollTimeoutRef.current) {
          clearTimeout(webScrollTimeoutRef.current);
        }
        webScrollTimeoutRef.current = setTimeout(() => {
          isSwipingOrDragging.current = false;
        }, 450);
      }
      hasSwiped = false;
    };

    target.addEventListener('click', handleClickCapture, true);
    target.addEventListener('touchstart', onNativeTouchStart, { passive: true });
    target.addEventListener('touchmove', onNativeTouchMove, { passive: true });
    target.addEventListener('touchend', onNativeTouchEnd, { passive: true });

    return () => {
      target.removeEventListener('click', handleClickCapture, true);
      target.removeEventListener('touchstart', onNativeTouchStart);
      target.removeEventListener('touchmove', onNativeTouchMove);
      target.removeEventListener('touchend', onNativeTouchEnd);
    };
  }, [hydrateCarousel, getScrollEl, offsetX]);

  const handleWebScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const w = e.nativeEvent.layoutMeasurement?.width || cardWidth || 200;
      if (w > 0) {
        offsetX.value = x;
        pageW.value = w;
        const page = Math.round(x / w);
        if (page !== activeIndex && page >= 0 && page < images.length) {
          setActiveIndex(page);
        }
      }
      isSwipingOrDragging.current = true;
      lastDragEndTime.current = Date.now();
      if (webScrollTimeoutRef.current) {
        clearTimeout(webScrollTimeoutRef.current);
      }
      webScrollTimeoutRef.current = setTimeout(() => {
        isSwipingOrDragging.current = false;
      }, 450);
    },
    [cardWidth, activeIndex, images.length, offsetX, pageW],
  );

  const srcWidth = thumbWidthFor(cardWidth || 200);
  const currentSrc = getOptimizedImageUrl(cardImageUrl(listing, activeIndex) || cardImageUrl(listing, 0), {
    width: srcWidth,
  });

  const handleCardPress = useCallback(
    (e: any) => {
      if (isSwipingOrDragging.current || Date.now() - lastDragEndTime.current < 450) {
        isSwipingOrDragging.current = false;
        return;
      }
      const pageX = e?.nativeEvent?.pageX;
      const pageY = e?.nativeEvent?.pageY;
      if (pageX !== undefined && pageY !== undefined && pointerDownPos.current.time > 0) {
        const dx = Math.abs(pageX - pointerDownPos.current.x);
        const dy = Math.abs(pageY - pointerDownPos.current.y);
        if (dx > 8 || dy > 8) {
          return;
        }
      }
      putCachedListing(listing);
      setImagePlaceholder(listing.id, currentSrc);
      const heroUrl = getOptimizedImageUrl(cardImageUrl(listing, activeIndex) || cardImageUrl(listing, 0), {
        width: 600,
      });
      if (heroUrl) prefetchImages([heroUrl]);
      router.push({
        pathname: `/product/${listing.id}`,
        params: { initialImage: currentSrc },
      } as any);
    },
    [listing, currentSrc, activeIndex],
  );

  const meta = [listing.size?.trim(), conditionLabel(listing.condition)].filter(Boolean).join(' · ');
  const { item: itemPrice, total: totalPrice } = priceBreakdown(listing.price);

  return (
    <View style={{ flex: 1, marginBottom: 16 }}>
    <Pressable
      testID="listing-card"
      onPress={handleCardPress}
      onPressIn={(e) => {
        pointerDownPos.current = {
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
          time: Date.now(),
        };
        putCachedListing(listing);
        setImagePlaceholder(listing.id, currentSrc);
      }}
      accessibilityRole="link"
      accessibilityLabel={`${listing.brand || listing.title}${listing.size ? `, size ${listing.size}` : ''}, ${formatPrice(listing.price)}`}
      accessibilityHint="Opens listing details"
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.94 : 1 })}
    >

      {/* Outer wrapper carries the shadow — the inner view below needs
          overflow: hidden to clip the image/carousel to its rounded corners,
          and on iOS/Android that same clip silently eats a shadow applied to
          the same layer. Splitting the two views is the standard fix. */}
      <View className="w-full" style={{ borderRadius: radii.lg, ...shadow.sm }}>
      <View
        ref={containerRef}
        testID={hasMultiple ? 'listing-card-carousel' : 'listing-card-single-image'}
        className="relative w-full"
        style={{
          aspectRatio: 1 / 1.33,
          overflow: 'hidden',
          borderRadius: radii.lg,
          backgroundColor: colors.panel,
          ...(Platform.OS === 'web' && hasMultiple
            ? ({
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'pan-x pan-y',
              } as any)
            : {}),
        }}
        onLayout={
          width == null
            ? (e) => setMeasuredWidth(e.nativeEvent.layout.width)
            : undefined
        }
        onTouchStart={hasMultiple ? handleTouchStart : undefined}
        onTouchMove={hasMultiple ? handleTouchMove : undefined}
        onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
        onTouchCancel={hasMultiple ? handleTouchCancel : undefined}
        onPointerDown={Platform.OS === 'web' && hasMultiple ? handlePointerDown : undefined}
        onPointerMove={Platform.OS === 'web' && hasMultiple ? handlePointerMove : undefined}
        onPointerUp={Platform.OS === 'web' && hasMultiple ? handlePointerUp : undefined}
        onPointerCancel={Platform.OS === 'web' && hasMultiple ? handlePointerCancel : undefined}
        onPointerEnter={Platform.OS === 'web' && hasMultiple ? hydrateCarousel : undefined}
      >
        {hasMultiple ? (
          // Horizontal paging carousel — one full-width slide per photo. Nested
          // inside the fixed-ratio, clipped container so pages snap edge to edge.
          <Animated.ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            onScroll={Platform.OS === 'web' ? handleWebScroll : carouselScrollHandler}
            onScrollBeginDrag={handleDragBegin}
            onScrollEndDrag={handleDragEnd}
            onMomentumScrollBegin={handleDragBegin}
            onMomentumScrollEnd={handleDragEnd}
            scrollEventThrottle={16}
            style={[
              { width: '100%', height: '100%' },
              Platform.OS === 'web' && ({
                scrollSnapType: 'x mandatory',
                WebkitScrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorX: 'contain',
                touchAction: 'pan-x pan-y',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              } as any),
            ]}
          >
            {images.map((_uri, i) => (
              <View
                key={`${listing.id}-${i}`}
                style={[
                  { width: cardWidth || 200, height: '100%' },
                  Platform.OS === 'web' && ({
                    scrollSnapAlign: 'start',
                    WebkitScrollSnapAlign: 'start',
                    flexShrink: 0,
                  } as any),
                ]}
              >
                {Math.abs(i - activeIndex) <= 1 || carouselHydrated ? (
                  <Image
                    source={{ uri: getOptimizedImageUrl(cardImageUrl(listing, i), { width: srcWidth }) }}
                    style={[
                      { width: '100%', height: '100%' },
                      Platform.OS === 'web' && ({
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitUserDrag: 'none',
                      } as any),
                    ]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`${listing.id}-${i}`}
                    transition={IMAGE_TRANSITION}
                    priority={i === 0 ? 'high' : 'normal'}
                    pointerEvents="none"
                  />
                ) : null}
              </View>
            ))}
          </Animated.ScrollView>
        ) : (
          <Image
            source={{ uri: currentSrc }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={listing.id}
            transition={IMAGE_TRANSITION}
            priority="high"
          />
        )}

        {hasMultiple && (
          <View
            style={{
              position: 'absolute',
              bottom: 6,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {images.map((_, i) => (
              <CardPageDot
                key={i}
                index={i}
                offsetX={offsetX}
                pageW={pageW}
                activeIndex={activeIndex}
              />
            ))}
          </View>
        )}

        {/* Like badge — animated heart + count, bottom-right. Tap toggles
            like with optimistic UI. Nested Pressable wins the touch
            responder so the card's onPress doesn't fire when the badge is
            tapped. */}
        <Pressable
          onPress={handleToggleLike}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike listing' : 'Like listing'}
          accessibilityState={{ selected: liked }}
          style={({ pressed }) => ({
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 999,
            paddingVertical: 6,
            paddingHorizontal: 11,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            opacity: pressed ? 0.85 : 1,
            ...shadow.sm,
          })}
        >
          <PopIcon
            ref={heartAnimRef}
            name="heart"
            active={liked}
            size={16}
            activeColor={BRAND_PURPLE}
            inactiveColor={colors.ink}
          />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>
            {likeCount}
          </Text>
        </Pressable>

        {listing.is_sold && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <SoldBadge size="md" />
          </View>
        )}
      </View>
      </View>

      <View className="mt-1.5 w-full">
        <Text className="text-[13px] font-bold" style={{ color: colors.text }} numberOfLines={1}>
          {listing.brand || listing.title}
        </Text>
        {!!meta && (
          <Text className="text-[11px] mt-0.5" style={{ color: colors.text }} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text className="text-[11px] mt-1" style={{ color: colors.text }}>
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        <View className="flex-row items-center mt-0.5" style={{ gap: 4 }}>
          <Text className="text-[12px] font-bold" style={{ color: colors.text }}>
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <ShieldCheckIcon size={13} />
        </View>

      </View>
    </Pressable>
    </View>
  );
});

// One pagination dot, driven entirely from the carousel's shared scroll offset.
//
// The look is unchanged from the plain <View> this replaces — a 5px round dot,
// solid white on the current page and 55% white otherwise. Only the mechanism
// moved: the fill is computed in a worklet on the UI thread, so swiping a card's
// photos repaints the dots without a single React render.
const CardPageDot = memo(function CardPageDot({
  index,
  offsetX,
  pageW,
  activeIndex = 0,
}: {
  index: number;
  offsetX: SharedValue<number>;
  pageW: SharedValue<number>;
  activeIndex?: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    // Before the first scroll event the width is still 0; page 0 is active.
    const page = pageW.value > 0 ? Math.round(offsetX.value / pageW.value) : activeIndex;
    return {
      backgroundColor: page === index ? 'white' : 'rgba(255,255,255,0.55)',
    };
  });
  return <Animated.View style={[{ width: 5, height: 5, borderRadius: 3 }, animStyle]} />;
});
