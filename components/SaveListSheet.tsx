// Modal sheet for picking which save-list(s) a listing belongs to. Loads
// the user's lists, lets them toggle membership per-list with a checkmark,
// and create new lists inline.
//
// Mounting is cheap — the heavy fetch only runs when `visible` flips on.

import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Modal, StyleSheet, ActivityIndicator, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { BlurView } from 'expo-blur';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  addToList,
  createSaveList,
  ensureSaveLists,
  getListsContaining,
  listSaveLists,
  removeFromList,
  type SaveList,
} from '@/lib/saves';
import { useTheme } from '@/context/ThemeContext';

const IS_IOS = Platform.OS === 'ios';
const HAIRLINE = StyleSheet.hairlineWidth;

function tap(style: 'light' | 'medium' | 'selection' = 'selection') {
  if (!IS_IOS) return;
  if (style === 'selection') Haptics.selectionAsync();
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function SaveListSheet({
  visible,
  userId,
  listingId,
  onClose,
  onChanged,
}: {
  visible: boolean;
  userId: string;
  listingId: string;
  onClose: () => void;
  // Fires whenever membership changes so callers (cards, product page) can
  // refresh their "is saved" pill without round-tripping the network.
  onChanged?: (isSavedSomewhere: boolean) => void;
}) {
  const { theme, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const [autoSaved, setAutoSaved] = useState(false);
  const [lists, setLists] = useState<SaveList[]>([]);
  const [containedIn, setContainedIn] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyListId, setBusyListId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Seed the four starter lists for new users — idempotent so existing
      // users see no change.
      await ensureSaveLists(userId).catch(() => {});
      const [ls, contained] = await Promise.all([
        listSaveLists(userId),
        getListsContaining(userId, listingId).catch(() => new Set<string>()),
      ]);
      if (cancelled) return;
      // Tapping Save means "save it": if it isn't in any list yet, drop it into
      // the default Saved list right away. The sheet then just offers extra lists.
      const def = ls.find((l) => l.is_default);
      let saved = false;
      if (contained.size === 0 && def) {
        saved = await addToList(def.id, listingId, userId);
        if (cancelled) return;
        if (saved) {
          contained.add(def.id);
          def.item_count = (def.item_count ?? 0) + 1;
          onChanged?.(true);
          tap('light');
        }
      }
      setAutoSaved(saved);
      setLists(ls);
      setContainedIn(contained);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, userId, listingId]);

  // Reset the inline-create UI whenever the sheet closes so it opens clean
  // next time.
  useEffect(() => {
    if (!visible) {
      setCreating(false);
      setNewName('');
      setAutoSaved(false);
    }
  }, [visible]);

  const handleToggleList = async (list: SaveList) => {
    if (busyListId) return;
    const isIn = containedIn.has(list.id);
    setBusyListId(list.id);
    // Optimistic flip
    const nextContained = new Set(containedIn);
    if (isIn) nextContained.delete(list.id);
    else nextContained.add(list.id);
    setContainedIn(nextContained);
    if (isIn) setAutoSaved(false);
    setLists((prev) =>
      prev.map((l) =>
        l.id === list.id
          ? { ...l, item_count: Math.max(0, (l.item_count ?? 0) + (isIn ? -1 : 1)) }
          : l,
      ),
    );
    tap('selection');
    const ok = isIn
      ? await removeFromList(list.id, listingId, userId)
      : await addToList(list.id, listingId, userId);
    if (!ok) {
      // Rollback
      setContainedIn(containedIn);
      setLists((prev) =>
        prev.map((l) =>
          l.id === list.id
            ? { ...l, item_count: Math.max(0, (l.item_count ?? 0) + (isIn ? 1 : -1)) }
            : l,
        ),
      );
    } else {
      onChanged?.(nextContained.size > 0);
    }
    setBusyListId(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (name.length === 0) return;
    const created = await createSaveList(userId, name);
    if (!created) return;
    // New list starts empty; immediately add this listing to it — matches
    // the user's intent ("create a list to put this in").
    const ok = await addToList(created.id, listingId, userId);
    setLists((prev) => [
      ...prev,
      { ...created, item_count: ok ? 1 : 0 },
    ]);
    if (ok) {
      const next = new Set(containedIn);
      next.add(created.id);
      setContainedIn(next);
      onChanged?.(true);
    }
    setNewName('');
    setCreating(false);
    tap('light');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {IS_IOS ? (
          <BlurView intensity={28} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        )}
        <KeyboardAvoider
          style={{ width: width - 40, maxWidth: 380, alignItems: 'center', justifyContent: 'center' }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              // Pixel cap: a % maxHeight resolved against an auto-height parent
              // and let long list sets spill out of the card.
              maxHeight: height * 0.72,
              backgroundColor: isDark ? theme.panel : '#FFFFFF',
              borderRadius: 20,
              overflow: 'hidden',
              borderWidth: isDark ? 1 : 0,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.4 : 0.15,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 16 },
              elevation: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 10, paddingTop: 16, paddingBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.ink }}>Save to list</Text>
                {autoSaved ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={14} color={theme.purple} />
                    <Text testID="save-list-autosaved" style={{ fontSize: 13, fontWeight: '600', color: theme.purple }}>
                      Added to Saved
                    </Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="x" size={20} color={theme.ink} />
              </Pressable>
            </View>
            <View style={{ height: HAIRLINE, backgroundColor: theme.border }} />

            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color={theme.purple} />
              </View>
            ) : (
              <ScrollView style={{ flexShrink: 1 }} bounces={false} keyboardShouldPersistTaps="handled">
                {lists.map((list) => {
                  const isIn = containedIn.has(list.id);
                  const isBusy = busyListId === list.id;
                  return (
                    <Pressable
                      key={list.id}
                      onPress={() => handleToggleList(list)}
                      disabled={isBusy}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isIn }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        backgroundColor: pressed ? theme.purpleSoft : 'transparent',
                      })}
                    >
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isIn ? theme.purpleSoft : isDark ? theme.surface : 'rgba(15,15,15,0.04)',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{list.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: theme.ink }}>
                          {list.name}
                        </Text>
                        <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 2 }}>
                          {list.item_count ?? 0} {list.item_count === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                      {isBusy ? (
                        <ActivityIndicator color={theme.purple} size="small" />
                      ) : isIn ? (
                        <Ionicons name="checkmark-circle" size={24} color={theme.purple} />
                      ) : (
                        <View style={{ width: 22, height: 22, margin: 1, borderRadius: 11, borderWidth: 1.5, borderColor: theme.border }} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={{ height: HAIRLINE, backgroundColor: theme.border }} />

            {creating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 8 }}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="List name"
                  placeholderTextColor={theme.mute}
                  autoFocus
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: '600',
                    color: theme.ink,
                    height: 40,
                    paddingVertical: 0,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: isDark ? theme.surface : 'rgba(15,15,15,0.05)',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: theme.border,
                  }}
                />
                <Pressable
                  onPress={handleCreate}
                  disabled={newName.trim().length === 0}
                  style={({ pressed }) => ({
                    height: 40,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.purple,
                    opacity: newName.trim().length === 0 ? 0.4 : pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Add</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  tap('selection');
                  setCreating(true);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  backgroundColor: pressed ? theme.purpleSoft : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.purpleSoft,
                    marginRight: 12,
                  }}
                >
                  <Feather name="plus" size={20} color={theme.purple} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.purple }}>Create new list</Text>
              </Pressable>
            )}
          </Pressable>
        </KeyboardAvoider>
      </Pressable>
    </Modal>
  );
}
