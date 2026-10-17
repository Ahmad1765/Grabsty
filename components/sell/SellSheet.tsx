// Sell form, presented as a full-screen Modal — same primitive as OfferSheet /
// GuestGate (`<Modal animationType="slide">`), not an expo-router Stack screen.
// Mounted once at the root (see app/_layout.tsx) and driven app-wide via
// useSellSheet().open(): tapping the Sell tab, or any "Post an item" CTA,
// calls open() instead of navigating, so the form slides up over whatever
// screen is currently showing and leaves the tab bar's active tab untouched
// underneath — exactly like the Offer button's sheet on the product page.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, type ReactNode,
} from 'react';
import { capture } from '@/lib/analytics';
import {
  View, Pressable, ScrollView, Alert, ActivityIndicator,
  Platform, useWindowDimensions,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { updateListing, type UpdateListingInput } from '@/lib/listings';
import { uploadListingImages, deleteListingImages, type LocalImage } from '@/lib/upload';
import {
  makeSlot, resolveImage, type PhotoSlot,
} from '@/lib/photoClean/slots';
import { useToast } from '@/lib/toast';
import { putCachedListing } from '@/lib/listingCache';
import { emitListingCreated } from '@/lib/listingEvents';
import { invalidateFresh } from '@/lib/freshness';
import { router } from 'expo-router';
import type { Category, Condition, Gender, Listing } from '@/types';
import { categoryLabel, hasSubcategories, subcategoryLabel } from '@/lib/categories';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';
import { itemColorLabel } from '@/lib/itemColors';
import { SafetyBanner } from '@/components/SafetyBanner';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  SingleSelectSheet, SizeSheet, PriceSheet, ColorSheet, CategorySheet, TagsSheet,
  type SelectOption,
} from '@/components/sell/PickerSheets';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SellFormSchema, type SellFormValues } from '@/lib/schemas/sell';
import { createDefaultSellValues, listingToSellFormValues, patchListingInCache } from './editHelpers';

import { BrandSheet } from '@/components/sell/BrandSheet';
import { AuthenticitySheet } from '@/components/sell/AuthenticitySheet';
import {
  smartClassify,
  checkBrandCategoryCompatibility,
  UNBRANDED_LOCAL_TAILOR,
  TAXONOMY_VERSION,
} from '@/lib/taxonomy';
import { useGuestGate } from '@/components/GuestGate';

const DISPLAY_BOLD = typography.family.sansBold;

const CONDITIONS: SelectOption<Condition>[] = [
  { label: 'New with tags', value: 'new_with_tags', hint: 'Unworn, original tags attached' },
  { label: 'Like new', value: 'like_new', hint: 'Worn once or twice, no flaws' },
  { label: 'Good', value: 'good', hint: 'Gently used, minor signs of wear' },
  { label: 'Fair', value: 'fair', hint: 'Visible wear, still functional' },
];

const GENDERS: SelectOption<Gender>[] = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
];

type ParcelSize = 'small' | 'medium' | 'large';
const PARCEL_SIZES: SelectOption<ParcelSize>[] = [
  { value: 'small', label: 'Small', hint: 'Fits in a shoebox — shoes, accessories, small items' },
  { value: 'medium', label: 'Medium', hint: 'Fits in a shopping bag — tops, shoes, folded clothing' },
  { value: 'large', label: 'Large', hint: 'Larger than a shopping bag — coats, bulky items' },
];

const MAX_IMAGES = 7;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 1000;
const CONTENT_MAX_WIDTH = 600;

type ActiveSheet =
  | 'category' | 'brand' | 'authenticity' | 'size' | 'condition' | 'colors' | 'gender' | 'tags'
  | 'price' | 'parcel' | null;

// ── Context ──────────────────────────────────────────────────────────────
type SellSheetApi = {
  open: (listingToEdit?: Listing | null) => boolean;
  close: () => void;
};
const Ctx = createContext<SellSheetApi | undefined>(undefined);

export function useSellSheet(): SellSheetApi {
  const ctx = useContext(Ctx);
  if (!ctx) return { open: () => { router.push('/auth/login'); return false; }, close: () => {} };
  return ctx;
}



export function SellSheetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const guestGate = useGuestGate();

  const open = useCallback((listingToEdit?: Listing | null | any, e?: any) => {
    // If an event was passed as first or second arg, stop propagation
    const eventObj =
      listingToEdit && typeof listingToEdit.stopPropagation === 'function'
        ? listingToEdit
        : e && typeof e.stopPropagation === 'function'
          ? e
          : null;
    if (eventObj) {
      eventObj.stopPropagation();
      eventObj.preventDefault?.();
    }
    const realListing =
      listingToEdit && typeof listingToEdit.stopPropagation === 'function'
        ? null
        : listingToEdit;

    if (!user?.id) {
      guestGate.prompt({
        title: 'Sign in to sell',
        message: 'List your pre-loved fashion in seconds to thousands of buyers.',
        cta: 'Sign in to start selling',
      });
      return false;
    }

    const doNavigate = () => {
      if (realListing?.id) {
        router.push(`/sell?id=${realListing.id}` as any);
      } else {
        router.push('/sell' as any);
      }
    };

    if (Platform.OS === 'web') {
      // ponytail: defer navigation on web so synthetic touch/click finishes on the Sell button instead of bleeding into the new view
      setTimeout(doNavigate, 80);
    } else {
      doNavigate();
    }
    return true;
  }, [user, guestGate]);

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={api}>
      {children}
    </Ctx.Provider>
  );
}

// ── Visual Structure Components ───────────────────────────────────────────

function SectionHeaderTitle({
  title,
  badge,
  icon,
}: {
  title: string;
  badge?: string;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 10,
        marginTop: 18,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Feather name={icon} size={16} color={theme.ink} />}
        <Text
          style={{
            fontSize: 15,
            fontFamily: DISPLAY_BOLD,
            color: theme.ink,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </Text>
      </View>
      {badge && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: radii.pill,
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontFamily: DISPLAY_BOLD,
              color: theme.mute,
              letterSpacing: 0.2,
            }}
          >
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

function RowField({
  icon,
  label,
  value,
  placeholder,
  onPress,
  isLast = false,
  disabled = false,
}: {
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  isLast?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const lastPressRef = useRef(Platform.OS === 'web' ? Date.now() : 0);
  const handlePress = (e?: any) => {
    if (disabled) return;
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
      if (Platform.OS === 'web' && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    }
    const now = Date.now();
    if (now - lastPressRef.current < 450) return;
    lastPressRef.current = now;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  const hasValue = Boolean(value);

  return (
    <Pressable
      onPress={disabled ? undefined : handlePress}
      disabled={disabled}
      hitSlop={disabled ? undefined : { top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole={disabled ? undefined : 'button'}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 52,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.border,
        backgroundColor: !disabled && pressed ? (theme.primarySoft ?? 'rgba(0,0,0,0.04)') : 'transparent',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon && <Feather name={icon} size={16} color={theme.mute} />}
        <Text
          style={{
            fontSize: 14.5,
            fontFamily: typography.family.sansSemibold,
            color: theme.ink,
          }}
        >
          {label}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginLeft: 12 }}>
        {hasValue ? (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radii.sm,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              maxWidth: 180,
              flexShrink: 1,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontFamily: typography.family.sansMedium,
                color: theme.ink,
              }}
            >
              {value}
            </Text>
          </View>
        ) : (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13.5,
              fontFamily: typography.family.sans,
              color: theme.muteSoft ?? theme.mute,
              flexShrink: 1,
            }}
          >
            {placeholder}
          </Text>
        )}
        {!disabled && <Feather name="chevron-right" size={16} color={theme.mute} />}
      </View>
    </Pressable>
  );
}

export function SellForm({
  editingListing,
  onClose,
}: {
  editingListing?: Listing | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [publishing, setPublishing] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const isNavigatingSheetRef = useRef(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        isNavigatingSheetRef.current = false;
      }, 400);
      return () => clearTimeout(timer);
    }
  }, []);

  const openSheet = useCallback((sheet: ActiveSheet) => {
    if (isNavigatingSheetRef.current || activeSheet !== null) return;
    isNavigatingSheetRef.current = true;
    setActiveSheet(sheet);
    setTimeout(() => {
      isNavigatingSheetRef.current = false;
    }, 400);
  }, [activeSheet]);

  const closeSheet = useCallback(() => {
    if (isNavigatingSheetRef.current) return;
    isNavigatingSheetRef.current = true;
    setActiveSheet(null);
    setTimeout(() => {
      isNavigatingSheetRef.current = false;
    }, 400);
  }, []);

  const isEditing = !!editingListing;
  const initialValues = useMemo(
    () => listingToSellFormValues(editingListing),
    // Only recompute initialValues when editing a different listing to avoid wiping unsaved edits on refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingListing?.id],
  );

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SellFormValues>({
    resolver: zodResolver(SellFormSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const slots = watch('slots');
  const title = watch('title');
  const description = watch('description');
  const category = watch('category');
  const subcategory = watch('subcategory');
  const price = watch('price');
  const brand = watch('brand');
  const authenticity = watch('authenticity');
  const size = watch('size');
  const condition = watch('condition');
  const color = watch('color');
  const gender = watch('gender');
  const tags = watch('tags');
  const parcelSize = watch('parcelSize');

  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [debouncedTitle, setDebouncedTitle] = useState(title || '');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTitle(title || '');
    }, 250);
    return () => clearTimeout(handler);
  }, [title]);

  const classification = useMemo(() => {
    return smartClassify(debouncedTitle, gender);
  }, [debouncedTitle, gender]);

  const compatibility = useMemo(() => {
    return checkBrandCategoryCompatibility(brand, subcategory);
  }, [brand, subcategory]);

  const setCoverPhoto = (index: number) => {
    if (index <= 0 || index >= slots.length) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    const currentSlots = [...(slots as PhotoSlot[])];
    const [selected] = currentSlots.splice(index, 1);
    currentSlots.unshift(selected);
    setValue('slots', currentSlots, { shouldValidate: true });
    toast.show('Cover photo updated', { variant: 'default', icon: 'check' });
  };

  const tile = useMemo(() => {
    const pagePad = 16 * 2;
    const cardPad = 14 * 2 + 2; // + 1px border each side
    const gaps = 10 * 2;
    const usable = Math.min(width, CONTENT_MAX_WIDTH) - pagePad - cardPad;
    return Math.floor((usable - gaps) / 3);
  }, [width]);

  const pickImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: MAX_IMAGES,
        base64: true,
      });
      if (!result.canceled) {
        const room = MAX_IMAGES - slots.length;
        const picked = result.assets.slice(0, room);
        const newSlots = picked.map((a) => ({
          ...makeSlot(
            { uri: a.uri, base64: a.base64 ?? null },
            (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
          ),
          status: 'done' as const,
        }));
        const updatedSlots = [...slots, ...newSlots].slice(0, MAX_IMAGES);
        setValue('slots', updatedSlots, { shouldValidate: true });
      }
    } catch (err: any) {
      console.warn('[SellSheet] pickImages error', err);
      toast.show('Could not access photo library. Please check app permissions.', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };

  const resetForm = () => {
    reset(createDefaultSellValues());
    setIsCustomBrand(false);
  };

  const isBrandEntered = Boolean(brand && brand.trim().length > 0);
  const isBrandedItem =
    isBrandEntered &&
    brand !== UNBRANDED_LOCAL_TAILOR &&
    brand.toLowerCase() !== 'no brand';
  const isAuthenticityValid = !isBrandedItem || Boolean(authenticity);

  const canPublish =
    title?.trim().length > 0 &&
    parseFloat(price || '0') > 0 &&
    slots.length > 0 &&
    Boolean(category) &&
    (!hasSubcategories(category as Category) || !!subcategory) &&
    Boolean(condition) &&
    Boolean(gender) &&
    isAuthenticityValid;

  const onValidSubmit = async (formData: SellFormValues) => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to publish a listing.');
      return;
    }
    if (!formData.category || !formData.condition || !formData.gender) {
      return;
    }

    const priceNum = parseFloat(formData.price);
    setPublishing(true);

    if (isEditing && editingListing) {
      try {
        const photoSlots = formData.slots as PhotoSlot[];
        const resolvedImages = photoSlots.map(resolveImage);
        const isRemoteUrl = (uri: string) => uri.startsWith('http://') || uri.startsWith('https://');

        const existingImageToThumb = new Map<string, string>();
        (editingListing.images ?? []).forEach((imgUrl, idx) => {
          const thumb = editingListing.thumbnails?.[idx] || imgUrl;
          existingImageToThumb.set(imgUrl, thumb);
        });

        const newImagesToUpload: { index: number; image: LocalImage }[] = [];
        resolvedImages.forEach((img, idx) => {
          if (!isRemoteUrl(img.uri)) {
            newImagesToUpload.push({ index: idx, image: img });
          }
        });

        let uploadedNewImages: { index: number; url: string; thumbUrl: string }[] = [];
        if (newImagesToUpload.length > 0) {
          const uploaded = await uploadListingImages(
            newImagesToUpload.map((n) => n.image),
            user.id,
          );
          if (uploaded.length < newImagesToUpload.length) {
            const partialUrls = uploaded.map((u) => u.url).filter(Boolean);
            if (partialUrls.length > 0) {
              deleteListingImages(partialUrls).catch(() => {});
            }
            throw new Error('Failed to upload all images. Please try again.');
          }
          uploadedNewImages = uploaded.map((u, i) => ({
            index: newImagesToUpload[i].index,
            url: u.url,
            thumbUrl: u.thumbUrl,
          }));
        }

        const finalUrls: string[] = [];
        const finalThumbs: string[] = [];

        resolvedImages.forEach((img, idx) => {
          if (isRemoteUrl(img.uri)) {
            finalUrls.push(img.uri);
            finalThumbs.push(existingImageToThumb.get(img.uri) || img.uri);
          } else {
            const uploadedItem = uploadedNewImages.find((u) => u.index === idx);
            if (uploadedItem) {
              finalUrls.push(uploadedItem.url);
              finalThumbs.push(uploadedItem.thumbUrl);
            }
          }
        });

        const updatePayload: UpdateListingInput = {
          title: formData.title.trim(),
          description: formData.description?.trim() || null,
          price: priceNum,
          category: formData.category,
          subcategory: formData.subcategory || null,
          color: formData.color || null,
          gender: formData.gender,
          brand: formData.brand?.trim() || null,
          size: formData.size?.trim() || null,
          condition: formData.condition,
          parcel_size: formData.parcelSize || null,
          authenticity: formData.authenticity || null,
          taxonomy_version: TAXONOMY_VERSION,
          images: finalUrls,
          thumbnails: finalThumbs,
          tags: formData.tags || [],
        };

        let result: Awaited<ReturnType<typeof updateListing>>;
        try {
          result = await updateListing(editingListing.id, updatePayload);

          const isMissingColumn =
            result.code === '42703' ||
            result.code === 'PGRST204' ||
            /column .* does not exist/i.test(result.error || '') ||
            /could not find the .* column/i.test(result.error || '');

          if (!result.ok && isMissingColumn) {
            delete (updatePayload as any).authenticity;
            delete (updatePayload as any).taxonomy_version;
            delete (updatePayload as any).subcategory;
            delete (updatePayload as any).color;
            result = await updateListing(editingListing.id, updatePayload);
          }

          if (!result.ok) {
            throw new Error(result.error || 'Failed to update listing');
          }
        } catch (updateErr: any) {
          const newlyUploadedUrls = uploadedNewImages.map((u) => u.url);
          if (newlyUploadedUrls.length > 0) {
            await deleteListingImages(newlyUploadedUrls).catch(() => {});
          }
          throw updateErr;
        }

        const currentUrlSet = new Set(finalUrls);
        const removedUrls = (editingListing.images ?? []).filter((url) => !currentUrlSet.has(url));
        if (removedUrls.length > 0) {
          deleteListingImages(removedUrls).catch((err) => {
            console.warn('[sell] Failed to clean up removed images', err);
          });
        }

        const updatedListing: Listing = {
          ...editingListing,
          ...updatePayload,
          description: updatePayload.description || '',
        };

        patchListingInCache(editingListing.id, updatedListing);
        invalidateFresh();

        capture('listing_updated', {
          listing_id: editingListing.id,
          category: updatedListing.category,
          price: updatedListing.price,
        });

        toast.show('Listing updated', { variant: 'success', icon: 'check' });
        onClose();
      } catch (e: any) {
        Alert.alert('Could not save changes', e?.message ?? 'Unknown error');
      } finally {
        setPublishing(false);
      }
      return;
    }

    let urls: string[] = [];
    let thumbs: string[] = [];
    try {
      const chosen = (formData.slots as PhotoSlot[]).map(resolveImage);
      const uploaded = await uploadListingImages(chosen, user.id);
      urls = uploaded.map((u) => u.url);
      thumbs = uploaded.map((u) => u.thumbUrl);

      const listingPayload: any = {
        seller_id: user.id,
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        price: priceNum,
        category: formData.category,
        subcategory: formData.subcategory || null,
        color: formData.color || null,
        gender: formData.gender,
        brand: formData.brand?.trim() || null,
        size: formData.size?.trim() || null,
        condition: formData.condition,
        parcel_size: formData.parcelSize || null,
        images: urls,
        thumbnails: thumbs,
        is_sold: false,
        tags: formData.tags || [],
      };

      if (formData.authenticity) {
        listingPayload.authenticity = formData.authenticity;
      }
      listingPayload.taxonomy_version = TAXONOMY_VERSION;

      let insertRes = await supabase
        .from('listings')
        .insert(listingPayload)
        .select('id')
        .single();

      // Graceful fallback if database column hasn't been migrated yet
      const isMissingColumn =
        insertRes.error &&
        (insertRes.error.code === '42703' ||
          insertRes.error.code === 'PGRST204' ||
          /column .* does not exist/i.test(insertRes.error.message || '') ||
          /could not find the .* column/i.test(insertRes.error.message || ''));

      if (isMissingColumn) {
        delete listingPayload.authenticity;
        delete listingPayload.taxonomy_version;
        delete listingPayload.subcategory;
        delete listingPayload.color;
        insertRes = await supabase
          .from('listings')
          .insert(listingPayload)
          .select('id')
          .single();
      }

      if (insertRes.error) {
        await deleteListingImages(urls);
        throw insertRes.error;
      }

      const newId = insertRes.data!.id as string;

      const sellerSeed: Listing['seller'] = {
        id: user.id,
        username: profile?.username ?? '',
        avatar_url: profile?.avatar_url ?? null,
        full_name: profile?.full_name ?? '',
        bio: profile?.bio ?? null,
        location: profile?.location ?? null,
        rating: profile?.rating ?? 0,
        total_sales: profile?.total_sales ?? 0,
        created_at: profile?.created_at ?? new Date().toISOString(),
      };

      const newListing: Listing = {
        id: newId,
        seller_id: user.id,
        seller: sellerSeed,
        title: formData.title.trim(),
        description: formData.description?.trim() || '',
        price: priceNum,
        category: formData.category,
        subcategory: formData.subcategory || null,
        color: formData.color || null,
        gender: formData.gender,
        brand: formData.brand?.trim() || null,
        size: formData.size?.trim() || null,
        condition: formData.condition,
        parcel_size: formData.parcelSize || null,
        authenticity: formData.authenticity || null,
        taxonomy_version: TAXONOMY_VERSION,
        images: urls,
        thumbnails: thumbs,
        is_sold: false,
        views: 0,
        likes: 0,
        tags: formData.tags || [],
        created_at: new Date().toISOString(),
      };
      putCachedListing(newListing);
      emitListingCreated(newListing);
      invalidateFresh();
      capture('listing_created', { listing_id: newListing.id, category: newListing.category, price: newListing.price });

      resetForm();
      onClose();
      // The "Item listed" screen is the confirmation now; a toast on top would be noise.
      router.push(`/listed/${newId}` as any);
    } catch (e: any) {
      Alert.alert('Could not publish', e?.message ?? 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  const onInvalidSubmit = () => {
    if (slots.length === 0) {
      toast.show('Please add at least one photo', { variant: 'default', icon: 'camera' });
    } else if (errors.subcategory) {
      toast.show('Please choose a category and subcategory', { variant: 'default', icon: 'grid' });
    } else if (errors.authenticity) {
      toast.show(errors.authenticity.message ?? 'Please declare item authenticity', { variant: 'default', icon: 'shield' });
    } else if (errors.price) {
      toast.show(errors.price.message ?? 'Please enter a valid price', { variant: 'default', icon: 'tag' });
    } else if (errors.title) {
      toast.show(errors.title.message ?? 'Please enter a title', { variant: 'default', icon: 'edit-2' });
    }
  };

  const categoryValue = subcategory
    ? subcategoryLabel(category, subcategory)
    : hasSubcategories(category)
      ? ''
      : categoryLabel(category);

  const insets = useSafeAreaInsets();

  const handlePickImages = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    await pickImages();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
        }}
      >
        <Pressable
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed ? theme.panel : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Feather name="x" size={20} color={theme.ink} />
        </Pressable>

        <Text
          style={{
            fontSize: 16,
            fontFamily: DISPLAY_BOLD,
            color: theme.ink,
            letterSpacing: -0.2,
          }}
        >
          {isEditing ? 'Edit listing' : 'Sell an item'}
        </Text>

        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoider style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 24) + 36,
            maxWidth: CONTENT_MAX_WIDTH,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {/* Photos Studio Section */}
          <SectionHeaderTitle
            title="Photos"
            badge={`${slots.length} / ${MAX_IMAGES}`}
            icon="camera"
          />

          <View
            style={{
              borderRadius: radii['2xl'],
              borderWidth: 1,
              borderColor: errors.slots ? (theme.danger ?? '#EF4444') : theme.border,
              backgroundColor: theme.background,
              padding: slots.length === 0 ? 24 : 14,
              overflow: 'hidden',
            }}
          >
            {slots.length === 0 ? (
              <Pressable
                onPress={handlePickImages}
                accessibilityRole="button"
                accessibilityLabel="Upload photos"
                style={({ pressed }) => ({
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 18,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Feather name="image" size={24} color={theme.ink} />
                </View>
                <Text
                  style={{
                    fontSize: 15.5,
                    fontFamily: DISPLAY_BOLD,
                    color: theme.ink,
                    marginBottom: 4,
                    letterSpacing: -0.2,
                  }}
                >
                  Add up to {MAX_IMAGES} photos
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    color: theme.mute,
                    textAlign: 'center',
                    marginBottom: 16,
                    lineHeight: 18,
                  }}
                >
                  Bright, clear photos on a clean background sell fastest
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: radii.pill,
                    backgroundColor: theme.primary,
                  }}
                >
                  <Feather name="plus" size={15} color={theme.background} />
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontFamily: DISPLAY_BOLD,
                      color: theme.background,
                    }}
                  >
                    Select photos
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {(slots as PhotoSlot[]).map((slot, i) => (
                    <View
                      key={slot.id}
                      style={{
                        width: tile,
                        height: tile,
                        borderRadius: radii.xl,
                        overflow: 'hidden',
                        position: 'relative',
                        backgroundColor: theme.panel,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Image
                        source={{ uri: resolveImage(slot).uri }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      {i === 0 ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: radii.pill,
                            backgroundColor: theme.purple,
                          }}
                        >
                          <Text
                            style={{
                              color: '#FFFFFF',
                              fontSize: 8.5,
                              fontFamily: DISPLAY_BOLD,
                              letterSpacing: 0.6,
                            }}
                          >
                            COVER
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => setCoverPhoto(i)}
                          accessibilityRole="button"
                          accessibilityLabel="Set as cover photo"
                          style={({ pressed }) => ({
                            position: 'absolute',
                            bottom: 6,
                            left: 6,
                            right: 6,
                            paddingVertical: 3,
                            paddingHorizontal: 4,
                            borderRadius: radii.pill,
                            backgroundColor: 'rgba(15,15,15,0.72)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.75 : 1,
                          })}
                        >
                          <Text
                            style={{
                              color: '#FFFFFF',
                              fontSize: 9,
                              fontFamily: DISPLAY_BOLD,
                              letterSpacing: 0.2,
                            }}
                          >
                            Set cover
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => {
                          if (Platform.OS !== 'web') {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }
                          const updated = (slots as PhotoSlot[]).filter((s) => s.id !== slot.id);
                          setValue('slots', updated, { shouldValidate: true });
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                        style={({ pressed }) => ({
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Feather name="x" size={13} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}

                  {slots.length < MAX_IMAGES && (
                    <Pressable
                      onPress={handlePickImages}
                      accessibilityRole="button"
                      accessibilityLabel="Add more photos"
                      style={({ pressed }) => ({
                        width: tile,
                        height: tile,
                        borderRadius: radii.xl,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: theme.border,
                        backgroundColor: theme.panel,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Feather name="plus" size={18} color={theme.ink} />
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: DISPLAY_BOLD,
                          color: theme.mute,
                        }}
                      >
                        {slots.length}/{MAX_IMAGES}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <Text
                  style={{
                    fontSize: 12,
                    color: theme.mute,
                    marginTop: 12,
                    paddingHorizontal: 2,
                  }}
                >
                  First photo is the cover image shown on feeds and search results.
                </Text>
              </View>
            )}
          </View>

          {errors.slots?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                marginTop: 6,
                paddingHorizontal: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.slots.message}
            </Text>
          ) : null}

          {/* About Your Item Section */}
          <SectionHeaderTitle title="About your item" icon="edit-3" />

          <View
            style={{
              borderRadius: radii['2xl'],
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.background,
              padding: 16,
              gap: 16,
            }}
          >
            {/* Title Input */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text
                  style={{
                    fontSize: 13.5,
                    fontFamily: typography.family.sansSemibold,
                    color: theme.ink,
                  }}
                >
                  Title
                </Text>
                <Text style={{ fontSize: 11.5, color: theme.mute }}>
                  {(title || '').length}/{TITLE_MAX}
                </Text>
              </View>
              <Controller
                control={control}
                name="title"
                render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: error ? (theme.danger ?? '#EF4444') : theme.border,
                      borderRadius: radii.md,
                      backgroundColor: theme.background,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <TextInput
                      ref={ref}
                      value={value}
                      onChangeText={(t) => onChange(t.slice(0, TITLE_MAX))}
                      onBlur={onBlur}
                      placeholder="e.g. Vintage denim jacket"
                      placeholderTextColor={theme.muteSoft ?? theme.mute}
                      maxLength={TITLE_MAX}
                      style={
                        {
                          fontSize: 14.5,
                          color: theme.ink,
                          padding: 0,
                          outlineStyle: 'none',
                          outlineWidth: 0,
                        } as any
                      }
                    />
                  </View>
                )}
              />
              {errors.title?.message ? (
                <Text
                  accessibilityRole="alert"
                  style={{
                    fontSize: 12,
                    color: theme.danger ?? '#EF4444',
                    marginTop: 4,
                    fontFamily: typography.family.sansMedium,
                  }}
                >
                  {errors.title.message}
                </Text>
              ) : null}

              {/* Dual-Row Horizontal Suggestion Banner (Smart Classification) */}
              {(classification.suggestedCategories.length > 0 || classification.suggestedBrands.length > 0) ? (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {/* Row 1: Suggested Categories */}
                  {classification.suggestedCategories.length > 0 ? (
                    <View>
                      <Text style={{ fontSize: 11, fontFamily: DISPLAY_BOLD, color: theme.mute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, paddingHorizontal: 2 }}>
                        Suggested Category
                      </Text>
                      <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="handled"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8 }}
                      >
                        {classification.suggestedCategories.map((cat) => {
                          const isApplied = category === cat.rootCategory && subcategory === cat.subcategoryId;
                          return (
                            <Pressable
                              key={`${cat.code}-${cat.subcategoryId}`}
                              onPress={() => {
                                if (Platform.OS !== 'web') {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                }
                                setValue('category', cat.rootCategory, { shouldValidate: true });
                                setValue('subcategory', cat.subcategoryId, { shouldValidate: true });
                                if (cat.gender) {
                                  setValue('gender', cat.gender, { shouldValidate: true });
                                }
                              }}
                              style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                height: 30,
                                paddingHorizontal: 12,
                                borderRadius: 15,
                                borderWidth: 1,
                                borderColor: isApplied ? theme.ink : theme.border,
                                backgroundColor: isApplied ? theme.ink : theme.panel,
                                opacity: pressed ? 0.8 : 1,
                              })}
                            >
                              <Feather name="zap" size={12} color={isApplied ? theme.background : theme.ink} />
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontFamily: isApplied ? DISPLAY_BOLD : typography.family.sansMedium,
                                  color: isApplied ? theme.background : theme.ink,
                                }}
                              >
                                {cat.label}
                              </Text>
                              {isApplied && <Feather name="check" size={11} color={theme.background} />}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  {/* Row 2: Suggested Brands */}
                  {classification.suggestedBrands.length > 0 ? (
                    <View style={{ marginTop: 2 }}>
                      <Text style={{ fontSize: 11, fontFamily: DISPLAY_BOLD, color: theme.mute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, paddingHorizontal: 2 }}>
                        Suggested Brands
                      </Text>
                      <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="handled"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8 }}
                      >
                        {classification.suggestedBrands.map((bName) => {
                          const isApplied = brand?.toLowerCase() === bName.toLowerCase();
                          return (
                            <Pressable
                              key={bName}
                              onPress={() => {
                                if (Platform.OS !== 'web') {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                }
                                setValue('brand', bName, { shouldValidate: true });
                                setIsCustomBrand(false);
                                if (
                                  bName.toLowerCase() === 'no brand' ||
                                  bName === UNBRANDED_LOCAL_TAILOR
                                ) {
                                  setValue('authenticity', null, { shouldValidate: true });
                                }
                              }}
                              style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 5,
                                height: 30,
                                paddingHorizontal: 12,
                                borderRadius: 15,
                                borderWidth: 1,
                                borderColor: isApplied ? theme.ink : theme.border,
                                backgroundColor: isApplied ? theme.ink : theme.panel,
                                opacity: pressed ? 0.8 : 1,
                              })}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontFamily: isApplied ? DISPLAY_BOLD : typography.family.sansMedium,
                                  color: isApplied ? theme.background : theme.ink,
                                }}
                              >
                                {bName}
                              </Text>
                              {isApplied && <Feather name="check" size={11} color={theme.background} />}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Description Input */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text
                  style={{
                    fontSize: 13.5,
                    fontFamily: typography.family.sansSemibold,
                    color: theme.ink,
                  }}
                >
                  Description
                </Text>
                <Text style={{ fontSize: 11.5, color: theme.mute }}>
                  {(description || '').length}/{DESCRIPTION_MAX}
                </Text>
              </View>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: error ? (theme.danger ?? '#EF4444') : theme.border,
                      borderRadius: radii.md,
                      backgroundColor: theme.background,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <TextInput
                      ref={ref}
                      value={value}
                      onChangeText={(t) => onChange(t.slice(0, DESCRIPTION_MAX))}
                      onBlur={onBlur}
                      placeholder="Describe fit, condition, measurements, material, and any flaws..."
                      placeholderTextColor={theme.muteSoft ?? theme.mute}
                      maxLength={DESCRIPTION_MAX}
                      multiline
                      textAlignVertical="top"
                      style={
                        {
                          fontSize: 14.5,
                          color: theme.ink,
                          minHeight: 76,
                          padding: 0,
                          outlineStyle: 'none',
                          outlineWidth: 0,
                        } as any
                      }
                    />
                  </View>
                )}
              />
              {errors.description?.message ? (
                <Text
                  accessibilityRole="alert"
                  style={{
                    fontSize: 12,
                    color: theme.danger ?? '#EF4444',
                    marginTop: 4,
                    fontFamily: typography.family.sansMedium,
                  }}
                >
                  {errors.description.message}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Item Details Card */}
          <SectionHeaderTitle title="Item details" icon="tag" />

          <View
            style={{
              borderRadius: radii['2xl'],
              borderWidth: 1,
              borderColor: errors.subcategory ? (theme.danger ?? '#EF4444') : theme.border,
              backgroundColor: theme.panel,
              overflow: 'hidden',
            }}
          >
            <RowField
              icon="grid"
              label="Category"
              value={categoryValue}
              placeholder="Select category"
              onPress={() => openSheet('category')}
            />

            {!compatibility.compatible && compatibility.advisory ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  backgroundColor: theme.surface,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Feather name="info" size={13} color={theme.ink} />
                  <Text style={{ fontSize: 11.5, color: theme.ink, flex: 1 }} numberOfLines={2}>
                    {compatibility.advisory}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setValue('brand', 'No brand', { shouldValidate: true });
                    setValue('authenticity', null, { shouldValidate: true });
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radii.sm,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 11, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
                    Switch
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <RowField
              icon="bookmark"
              label="Brand"
              value={brand}
              placeholder="Add brand"
              onPress={() => openSheet('brand')}
            />

            {isBrandedItem ? (
              <>
                <RowField
                  icon="shield"
                  label="Authenticity"
                  value={
                    authenticity === 'original'
                      ? 'Original'
                      : authenticity === 'inspired'
                        ? 'Master Copy / Inspired'
                        : authenticity === 'replica'
                          ? 'Replica'
                          : authenticity === 'not_sure'
                            ? 'Not Sure'
                            : ''
                  }
                  placeholder="Declare authenticity"
                  disabled={isCustomBrand}
                  onPress={() => {
                    if (!isCustomBrand) {
                      openSheet('authenticity');
                    }
                  }}
                />
                {isCustomBrand ? (
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                      backgroundColor: theme.surface,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, color: theme.mute }}>
                      Custom/unverified brands are set to &ldquo;Not Sure&rdquo; by default.
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}

            <RowField
              icon="maximize-2"
              label="Size"
              value={size}
              placeholder="Add size"
              onPress={() => openSheet('size')}
            />

            <RowField
              icon="shield"
              label="Condition"
              value={CONDITIONS.find((c) => c.value === condition)?.label ?? ''}
              placeholder="Add condition"
              onPress={() => openSheet('condition')}
            />
            {condition ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  backgroundColor: theme.surface,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <Feather name="check" size={12} color={theme.purple} />
                <Text style={{ fontSize: 11.5, color: theme.mute, flex: 1 }} numberOfLines={1}>
                  {CONDITIONS.find((c) => c.value === condition)?.hint}
                </Text>
              </View>
            ) : null}

            <RowField
              icon="droplet"
              label="Color"
              value={color ? itemColorLabel(color) : ''}
              placeholder="Add color"
              onPress={() => openSheet('colors')}
            />

            <RowField
              icon="users"
              label="Gender"
              value={GENDERS.find((g) => g.value === gender)?.label ?? ''}
              placeholder="Add gender"
              onPress={() => openSheet('gender')}
            />

            <RowField
              icon="hash"
              label="Tags"
              value={tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : ''}
              placeholder="Add discovery tags"
              onPress={() => openSheet('tags')}
              isLast
            />
          </View>

          {errors.category?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                paddingHorizontal: 4,
                paddingTop: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.category.message}
            </Text>
          ) : null}

          {errors.subcategory?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                paddingHorizontal: 4,
                paddingTop: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.subcategory.message}
            </Text>
          ) : null}

          {errors.condition?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                paddingHorizontal: 4,
                paddingTop: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.condition.message}
            </Text>
          ) : null}

          {errors.gender?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                paddingHorizontal: 4,
                paddingTop: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.gender.message}
            </Text>
          ) : null}

          {errors.authenticity?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                paddingHorizontal: 4,
                paddingTop: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.authenticity.message}
            </Text>
          ) : null}

          {/* Pricing & Shipping Card */}
          <SectionHeaderTitle title="Pricing & Shipping" icon="tag" />

          <View
            style={{
              borderRadius: radii['2xl'],
              borderWidth: 1,
              borderColor: errors.price ? (theme.danger ?? '#EF4444') : theme.border,
              backgroundColor: theme.panel,
              overflow: 'hidden',
            }}
          >
            <RowField
              icon="tag"
              label="Price"
              value={price && Number.isFinite(parseFloat(price)) ? formatPrice(parseFloat(price), { whole: true }) : ''}
              placeholder={`Set price (${CURRENCY_SYMBOL})`}
              onPress={() => openSheet('price')}
            />

            <RowField
              icon="package"
              label="Parcel size"
              value={PARCEL_SIZES.find((p) => p.value === parcelSize)?.label ?? ''}
              placeholder="Select parcel size"
              onPress={() => openSheet('parcel')}
              isLast
            />
          </View>

          {errors.price?.message ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: 12,
                color: theme.danger ?? '#EF4444',
                paddingHorizontal: 4,
                paddingTop: 4,
                fontFamily: typography.family.sansMedium,
              }}
            >
              {errors.price.message}
            </Text>
          ) : null}

          <Text style={{ fontSize: 12, color: theme.mute, paddingHorizontal: 4, paddingTop: 6 }}>
            The buyer pays for shipping automatically at checkout.
          </Text>

          {/* Safety Banner */}
          <SafetyBanner context="sell" style={{ marginTop: 20 }} />

          {/* Submit CTA */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              }
              handleSubmit(onValidSubmit, onInvalidSubmit)();
            }}
            disabled={publishing || !canPublish}
            accessibilityRole="button"
            accessibilityLabel={
              publishing
                ? (isEditing ? 'Saving changes' : 'Uploading listing')
                : (isEditing ? 'Save changes' : 'Upload listing')
            }
            accessibilityState={{ disabled: publishing || !canPublish, busy: publishing }}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: radii.xl,
              backgroundColor: canPublish ? theme.primary : theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 22,
              opacity: publishing ? 0.85 : 1,
              transform: [{ scale: pressed && canPublish ? 0.985 : 1 }],
            })}
          >
            {publishing ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: DISPLAY_BOLD,
                  color: canPublish ? theme.background : theme.mute,
                  letterSpacing: -0.1,
                }}
              >
                {isEditing ? 'Save changes' : 'Upload item'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoider>

      {/* Sheets */}
      <CategorySheet
        visible={activeSheet === 'category'}
        category={category}
        subcategory={subcategory ?? null}
        selectedBrand={brand}
        onChange={(c, s) => {
          setValue('category', c, { shouldValidate: true });
          setValue('subcategory', s, { shouldValidate: true });
        }}
        onClose={closeSheet}
      />
      <BrandSheet
        visible={activeSheet === 'brand'}
        value={brand}
        categoryCode={category || undefined}
        subcategoryId={subcategory}
        onSelectBrand={(bName, isCustom) => {
          setValue('brand', bName, { shouldValidate: true });
          setIsCustomBrand(!!isCustom);
          if (
            bName.toLowerCase() === 'no brand' ||
            bName === UNBRANDED_LOCAL_TAILOR
          ) {
            setValue('authenticity', null, { shouldValidate: true });
          } else if (isCustom) {
            setValue('authenticity', 'not_sure', { shouldValidate: true });
          }
        }}
        onClose={closeSheet}
      />
      <AuthenticitySheet
        visible={activeSheet === 'authenticity'}
        brandName={brand}
        value={authenticity}
        onChange={(auth) => setValue('authenticity', auth, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <SizeSheet
        visible={activeSheet === 'size'}
        categoryCode={category || undefined}
        value={size}
        onChange={(s) => setValue('size', s, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <SingleSelectSheet
        visible={activeSheet === 'condition'}
        title="Condition"
        options={CONDITIONS}
        value={condition}
        onChange={(c) => setValue('condition', c, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <ColorSheet
        visible={activeSheet === 'colors'}
        value={color ?? null}
        onChange={(cl) => setValue('color', cl, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <SingleSelectSheet
        visible={activeSheet === 'gender'}
        title="Gender"
        options={GENDERS}
        value={gender}
        onChange={(g) => setValue('gender', g, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <TagsSheet
        visible={activeSheet === 'tags'}
        value={tags}
        onChange={(t) => setValue('tags', t, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <PriceSheet
        visible={activeSheet === 'price'}
        value={price}
        onChange={(p) => setValue('price', p, { shouldValidate: true })}
        onClose={closeSheet}
      />
      <SingleSelectSheet<ParcelSize>
        visible={activeSheet === 'parcel'}
        title="Parcel size"
        options={PARCEL_SIZES}
        value={parcelSize ?? null}
        onChange={(ps) => setValue('parcelSize', ps, { shouldValidate: true })}
        onClose={closeSheet}
      />
    </SafeAreaView>
  );
}


