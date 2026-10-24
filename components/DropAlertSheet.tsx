import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { shadow } from '@/lib/theme';
import { createSavedSearch } from '@/lib/savedSearches';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';

const POPULAR_BRANDS = [
  'Nike',
  'Zara',
  'Adidas',
  'H&M',
  "Levi's",
  'Ralph Lauren',
  'Brandy Melville',
  'Stüssy',
  'Carhartt',
  'Supreme',
  'Vintage',
];

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Simple, elegant Drop Alert modal matching the clean Plick/resale design.
 * Features a direct search input with "Apply" button and popular brand suggestions.
 */
export function DropAlertSheet({ visible, userId, onClose, onCreated }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const reset = useCallback(() => {
    setQuery('');
  }, []);

  const handleClose = useCallback(() => {
    if (savingRef.current || saving) return;
    reset();
    onClose();
  }, [reset, onClose, saving]);

  const saveAlertFor = useCallback(
    async (brandOrQuery: string) => {
      const q = brandOrQuery.trim();
      if (!q) {
        toast.show('Type a brand or keyword', { variant: 'info', icon: 'alert-circle' });
        return;
      }
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        const row = await createSavedSearch({
          userId,
          query: q,
          category: null,
          gender: null,
          notify: true,
        });
        if (!row) {
          toast.show("Couldn't create the alert", { variant: 'default', icon: 'alert-triangle' });
          return;
        }
        toast.show(`Alert created for "${q}"`, {
          variant: 'success',
          icon: 'bell',
        });
        reset();
        onCreated();
        onClose();
      } catch (e: any) {
        captureError(e, { fn: 'dropAlert.create' });
        toast.show("Couldn't create the alert", { variant: 'default', icon: 'alert-triangle' });
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [userId, toast, reset, onCreated, onClose],
  );

  const handleApply = useCallback(() => {
    saveAlertFor(query);
  }, [query, saveAlertFor]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POPULAR_BRANDS;
    return POPULAR_BRANDS.filter((b) => b.toLowerCase().includes(q));
  }, [query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 18,
          }}
        >
          <KeyboardAvoider
            style={{ width: '100%', maxWidth: 390 }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={{
                  width: '100%',
                  backgroundColor: theme.surface,
                  borderRadius: 24,
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 22,
                  maxHeight: 520,
                  ...shadow.lg,
                }}
              >
                {/* Header Row: Title & Close 'x' Button */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '800',
                      color: theme.ink,
                      letterSpacing: -0.3,
                    }}
                  >
                    Drop alert
                  </Text>
                  <Pressable
                    onPress={handleClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    hitSlop={8}
                    style={({ pressed }) => ({
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: theme.panel,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Feather name="x" size={16} color={theme.ink} />
                  </Pressable>
                </View>

                {/* Search Input Row with Apply Button */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      height: 46,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.hairline,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Feather name="search" size={17} color={theme.mute} style={{ marginRight: 8 }} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Type a brand name..."
                      placeholderTextColor={theme.muteSoft}
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleApply}
                      style={{
                        flex: 1,
                        fontSize: 14.5,
                        color: theme.ink,
                        padding: 0,
                        outlineStyle: 'none',
                      } as any}
                    />
                  </View>

                  <Pressable
                    onPress={handleApply}
                    disabled={saving || !query.trim()}
                    style={({ pressed }) => ({
                      height: 46,
                      paddingHorizontal: 20,
                      borderRadius: 12,
                      backgroundColor: '#6C47FF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: saving || !query.trim() ? 0.45 : pressed ? 0.85 : 1,
                    })}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '700',
                          color: '#FFFFFF',
                          letterSpacing: -0.2,
                        }}
                      >
                        Apply
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/* Vertical Brand Suggestions List */}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 4 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredBrands.map((brand) => (
                    <Pressable
                      key={brand}
                      onPress={() => {
                        setQuery(brand);
                        saveAlertFor(brand);
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 12,
                        paddingHorizontal: 4,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '500',
                          color: theme.ink,
                          letterSpacing: -0.1,
                        }}
                      >
                        {brand}
                      </Text>
                    </Pressable>
                  ))}

                  {query.trim().length > 0 &&
                    !POPULAR_BRANDS.some(
                      (b) => b.toLowerCase() === query.trim().toLowerCase(),
                    ) && (
                      <Pressable
                        onPress={handleApply}
                        style={({ pressed }) => ({
                          paddingVertical: 12,
                          paddingHorizontal: 4,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <Feather name="plus" size={15} color="#6C47FF" />
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: '600',
                            color: '#6C47FF',
                          }}
                        >
                          {`Alert for "${query.trim()}"`}
                        </Text>
                      </Pressable>
                    )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoider>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
