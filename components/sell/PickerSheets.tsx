import { useEffect, useState, useMemo, useRef } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

import { ITEM_COLORS } from '@/lib/itemColors';
import { ColorSwatch } from '@/components/ColorSwatch';
import { CURRENCY_SYMBOL, CURRENCY_CODE } from '@/lib/currency';


import { BottomSheet } from './BottomSheet';
import * as Haptics from 'expo-haptics';

const DISPLAY_BOLD = type.family.sansBold;

function SaveButton({ onPress, label = 'Save' }: { onPress: () => void; label?: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 28,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        backgroundColor: theme.surface,
      }}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onPress();
        }}
        accessibilityRole="button"
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderRadius: radii.md,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        <Text style={{ fontSize: 15, fontFamily: DISPLAY_BOLD, color: theme.background, letterSpacing: -0.1 }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Single-select list (Condition, Gender, Parcel size) ─────────────────────
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function SingleSelectSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const selectingRef = useRef(false);

  useEffect(() => {
    if (visible) selectingRef.current = false;
  }, [visible]);

  const handleSelect = (val: T) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onChange(val);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <View style={{ gap: 10 }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => handleSelect(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: active ? theme.ink : theme.border,
                backgroundColor: active ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : theme.panel,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: active ? DISPLAY_BOLD : type.family.sansSemibold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                  }}
                >
                  {o.label}
                </Text>
                {o.hint ? (
                  <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 3, lineHeight: 17 }}>
                    {o.hint}
                  </Text>
                ) : null}
              </View>
              {active ? (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: theme.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="check" size={15} color={theme.background} />
                </View>
              ) : (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

// ── Free-text field (Brand, Size) ──────────────────────────────────────────
export function TextFieldSheet({
  visible,
  title,
  placeholder,
  value,
  onChange,
  onClose,
  multiline,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  multiline?: boolean;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const save = () => {
    onChange(draft.trim());
    onClose();
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} footer={<SaveButton onPress={save} />}>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.md,
          backgroundColor: theme.panel,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          autoFocus
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={
            {
              fontSize: 16,
              color: theme.ink,
              minHeight: multiline ? 90 : 28,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any
          }
        />
      </View>
    </BottomSheet>
  );
}

// ── Size (full-page category-aware size selector) ───────────────────────────
export function SizeSheet({
  visible,
  categoryCode,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  categoryCode?: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value);
  const savingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      savingRef.current = false;
    }
  }, [visible, value]);

  const save = (valToSave?: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    const finalVal = (valToSave ?? draft).trim();
    onChange(finalVal);
    onClose();
  };

  const quickSizes = useMemo(() => {
    if (categoryCode === 'CAT-04' || categoryCode === 'shoes') {
      return [
        'US 6', 'US 6.5', 'US 7', 'US 7.5', 'US 8', 'US 8.5',
        'US 9', 'US 9.5', 'US 10', 'US 10.5', 'US 11', 'US 12',
        'EU 38', 'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44', 'EU 45',
      ];
    }
    if (categoryCode === 'CAT-05' || categoryCode === 'bags') {
      return ['Small', 'Medium', 'Large', 'Mini', 'Oversized', 'One Size'];
    }
    if (categoryCode === 'CAT-06' || categoryCode === 'accessories' || categoryCode === 'CAT-07' || categoryCode === 'beauty') {
      return ['One Size', 'Small', 'Medium', 'Large'];
    }
    return ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One Size'];
  }, [categoryCode]);

  return (
    <BottomSheet
      visible={visible}
      title="Size"
      onClose={onClose}
      footer={<SaveButton onPress={() => save()} label="Save Size" />}
    >
      <Text style={{ fontSize: 13, color: theme.mute, marginBottom: 16 }}>
        Select a standard size or enter custom dimensions below.
      </Text>

      {/* Quick Pick */}
      <View style={{ marginBottom: 20 }}>
        <Text
          style={{
            fontSize: 12,
            fontFamily: DISPLAY_BOLD,
            color: theme.ink,
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Quick Select
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {quickSizes.map((qs) => {
            const active = draft.trim().toLowerCase() === qs.toLowerCase();
            return (
              <Pressable
                key={qs}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }
                  setDraft(qs);
                  save(qs);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.border,
                  backgroundColor: active ? theme.ink : theme.panel,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
                    color: active ? theme.background : theme.ink,
                  }}
                >
                  {qs}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Custom Size */}
      <View style={{ marginTop: 4 }}>
        <Text
          style={{
            fontSize: 12,
            fontFamily: DISPLAY_BOLD,
            color: theme.ink,
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Custom Size
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radii.xl,
            backgroundColor: theme.panel,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. 32/30, 38R, 75B, 8.5 Wide"
            placeholderTextColor={theme.muteSoft ?? theme.mute}
            style={
              {
                fontSize: 16,
                color: theme.ink,
                padding: 0,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />
        </View>
      </View>
    </BottomSheet>
  );
}

// ── Price (hero numeric input) ──────────────────────────────────────────────
export function PriceSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value);
  const savingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      savingRef.current = false;
    }
  }, [visible, value]);

  const save = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    onChange(draft);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Set Price" onClose={onClose} footer={<SaveButton onPress={save} label="Set Price" />}>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.xl,
          backgroundColor: theme.panel,
          paddingHorizontal: 18,
          paddingVertical: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Text
            style={{
              fontSize: 22,
              fontFamily: DISPLAY_BOLD,
              color: theme.mute,
              marginRight: 8,
            }}
          >
            {CURRENCY_SYMBOL}
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="0"
            placeholderTextColor={theme.muteSoft ?? theme.mute}
            keyboardType="decimal-pad"
            autoFocus
            style={
              {
                fontSize: 32,
                fontFamily: DISPLAY_BOLD,
                color: theme.ink,
                flex: 1,
                minWidth: 0,
                padding: 0,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.sm,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: DISPLAY_BOLD, color: theme.ink }}>
            {CURRENCY_CODE}
          </Text>
        </View>
      </View>
      {Number(draft) > 0 ? (
        <View
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: radii.lg,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="pocket" size={14} color={theme.purple} />
            <Text style={{ fontSize: 13, fontFamily: type.family.sansSemibold, color: theme.ink }}>
              Estimated payout (0% fee)
            </Text>
          </View>
          <Text style={{ fontSize: 14, fontFamily: DISPLAY_BOLD, color: theme.purple }}>
            {CURRENCY_SYMBOL} {Number(draft).toLocaleString()}
          </Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 8, paddingHorizontal: 4 }}>
        Set a fair price based on condition and brand to sell quickly.
      </Text>

      {/* Quick Price Increment Pills */}
      <View style={{ marginTop: 20, marginBottom: 18 }}>
        <Text
          style={{
            fontSize: 12,
            fontFamily: DISPLAY_BOLD,
            color: theme.ink,
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Common Price Presets
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[500, 1000, 1500, 2000, 2500, 3000, 5000, 10000].map((pVal) => {
            const active = draft === String(pVal);
            return (
              <Pressable
                key={pVal}
                onPress={() => setDraft(String(pVal))}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.border,
                  backgroundColor: active ? theme.ink : theme.panel,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
                    color: active ? theme.background : theme.ink,
                  }}
                >
                  {CURRENCY_SYMBOL} {pVal.toLocaleString()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

// ── Colors (swatch grid) ─────────────────────────────────────────────────────
export function ColorSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string | null;
  onChange: (v: string | null) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const selectingRef = useRef(false);

  useEffect(() => {
    if (visible) selectingRef.current = false;
  }, [visible]);

  const handleSelect = (val: string | null) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onChange(val);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Color" onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ITEM_COLORS.map((c) => {
          const active = value === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => handleSelect(active ? null : c.id)}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                alignItems: 'center',
                width: 68,
                paddingVertical: 8,
                borderRadius: radii.md,
                backgroundColor: active ? (theme.primarySoft ?? 'rgba(0,0,0,0.06)') : 'transparent',
                borderWidth: active ? 1 : 1,
                borderColor: active ? theme.ink : 'transparent',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? theme.ink : theme.border,
                  marginBottom: 6,
                }}
              >
                <ColorSwatch colorId={c.id} size={active ? 26 : 32} />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  fontSize: 12,
                  fontFamily: active ? DISPLAY_BOLD : type.family.sansMedium,
                  color: theme.ink,
                  textAlign: 'center',
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

// ── Category (dedicated Vinted-style multi-level page picker) ────────────────
export { CategorySheet } from './CategorySheet';


export function parseTagInput(
  candidate: string,
  existingTags: string[] = [],
  maxTags = 10,
): string[] {
  const parts = candidate.split(',');
  const next = [...existingTags];
  for (const part of parts) {
    const raw = part.trim().replace(/#/g, '').toLowerCase();
    if (raw && !next.includes(raw) && next.length < maxTags) {
      next.push(raw);
    }
  }
  return next;
}

// ── Tags (chip input) ────────────────────────────────────────────────────────
export function TagsSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [tags, setTags] = useState<string[]>(value);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (visible) {
      setTags(value);
      setDraft('');
    }
  }, [visible, value]);

  const addFromDraft = (candidate?: string) => {
    const textToUse = typeof candidate === 'string' ? candidate : draft;
    setTags((prev) => parseTagInput(textToUse, prev, 10));
    setDraft('');
  };

  const save = () => {
    onChange(tags);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Tags" onClose={onClose} footer={<SaveButton onPress={save} label="Done" />}>
      <Text style={{ fontSize: 13, color: theme.mute, marginBottom: 12 }}>
        Add keywords like style, aesthetics, or fit to help buyers discover your item (up to 10).
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.md,
          backgroundColor: theme.panel,
          padding: 12,
          minHeight: 52,
        }}
      >
        {tags.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTags((prev) => prev.filter((x) => x !== t))}
            style={({ pressed }) => ({
              backgroundColor: theme.ink,
              borderRadius: radii.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 12.5, fontFamily: DISPLAY_BOLD, color: theme.background }}>
              #{t}
            </Text>
            <Feather name="x" size={12} color={theme.background} />
          </Pressable>
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => {
            if (text.includes(',') || /[ ]$/.test(text)) {
              addFromDraft(text);
            } else {
              setDraft(text);
            }
          }}
          onSubmitEditing={() => addFromDraft()}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
              setTags((prev) => prev.slice(0, -1));
            }
          }}
          placeholder={tags.length === 0 ? 'e.g. vintage, y2k, oversized' : 'add tag…'}
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={
            {
              flexGrow: 1,
              minWidth: 90,
              fontSize: 14,
              color: theme.ink,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any
          }
        />
      </View>

      {/* Suggested Popular Tags */}
      <View style={{ marginTop: 20 }}>
        <Text
          style={{
            fontSize: 12,
            fontFamily: DISPLAY_BOLD,
            color: theme.ink,
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Suggested Tags
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['vintage', 'y2k', 'streetwear', 'casual', 'formal', 'summer', 'minimalist', 'oversized', 'classic', 'aesthetic']
            .filter((st) => !tags.includes(st))
            .slice(0, 8)
            .map((st) => (
              <Pressable
                key={st}
                onPress={() => addFromDraft(st)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.panel,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: type.family.sansMedium }}>
                  + #{st}
                </Text>
              </Pressable>
            ))}
        </View>
      </View>
    </BottomSheet>
  );
}

