import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  Platform,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { tap } from '@/lib/haptics';
import { getCurrentLocationAddress } from '@/lib/location';
import type { ShippingAddress } from '@/types';
import { HIT_SLOP_8 } from '@/lib/responsive';

export type AddressForm = {
  recipient_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
};

const EMPTY: AddressForm = {
  recipient_name: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'Pakistan',
  phone: '',
};

export function AddressSheet({
  visible,
  initial,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  initial: ShippingAddress | null;
  onClose: () => void;
  onSave: (form: AddressForm) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { profile } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState<AddressForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const prevVisibleRef = useRef(visible);

  useEffect(() => {
    if (!prevVisibleRef.current && visible) {
      const defaultName =
        initial?.recipient_name ||
        profile?.full_name ||
        (profile?.username ? `@${profile.username}` : '');

      let initCity = initial?.city ?? '';
      let initCountry = initial?.country ?? 'Pakistan';
      if (initCity.includes(',')) {
        const parts = initCity.split(',').map((p) => p.trim());
        initCity = parts[0];
        if (parts[1]) initCountry = parts[1];
      }

      let initLine2 = initial?.line2 ?? '';
      if (initLine2.trim() === (initial?.line1 ?? '').trim()) {
        initLine2 = '';
      }

      setForm({
        recipient_name: defaultName,
        line1: initial?.line1 ?? '',
        line2: initLine2,
        city: initCity,
        state: initial?.state ?? '',
        postal_code: initial?.postal_code ?? '',
        country: initCountry,
        phone: initial?.phone ?? '',
      });
      setSaving(false);
      setLocating(false);
      setFocusedField(null);
      setAttemptedSubmit(false);
    }
    prevVisibleRef.current = visible;
  }, [visible, initial, profile]);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof AddressForm, string>> = {};
    if (!form.recipient_name.trim()) e.recipient_name = 'Full name is required';
    if (!form.line1.trim()) e.line1 = 'Street address is required';
    if (!form.city.trim()) e.city = 'City is required';
    const cleanPhone = form.phone.replace(/[\s\-()]/g, '');
    if (!cleanPhone) {
      e.phone = 'Phone number is required for courier delivery';
    } else if (cleanPhone.length < 10) {
      e.phone = 'Phone number must be at least 10 digits';
    } else if (cleanPhone.length > 15) {
      e.phone = 'Phone number must not exceed 15 digits';
    } else if (!/^(\+?92|0)?[3-9][0-9]{8,11}$/.test(cleanPhone)) {
      e.phone = 'Please enter a valid phone number (e.g. 0300 1234567)';
    }
    return e;
  }, [form]);

  const canSave = Object.keys(errors).length === 0;

  const set = (patch: Partial<AddressForm>) => {
    setForm((s) => ({ ...s, ...patch }));
  };

  const handleUseCurrentLocation = async () => {
    if (locating) return;
    tap('medium');
    setLocating(true);

    try {
      const loc = await getCurrentLocationAddress();
      setForm((s) => ({
        ...s,
        line1: loc.line1 || s.line1,
        city: loc.city || s.city,
        state: loc.state || s.state,
        postal_code: loc.postal_code || s.postal_code,
        country: loc.country || s.country || 'Pakistan',
      }));

      toast.show('Address updated from your location', {
        variant: 'default',
        icon: 'check',
      });
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not detect location', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    if (!canSave) {
      toast.show('Please fill in the required address fields', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (e: any) {
      toast.show(e?.message ?? 'Failed to save address', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setSaving(true);
    try {
      await onRemove();
    } catch (e: any) {
      toast.show(e?.message ?? 'Failed to remove address', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />

        <KeyboardAvoider
          style={[
            styles.keyboardContainer,
            {
              paddingTop: Platform.OS === 'ios' ? insets.top : 12,
            },
          ]}
        >
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: theme.surface || '#FFFFFF',
                borderColor: theme.border || '#E5E7EB',
              },
            ]}
          >
            {/* Top Drag Notch (mobile only) */}
            {Platform.OS !== 'web' && <View style={[styles.notch, { backgroundColor: theme.border }]} />}

            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>Delivery address</Text>
              <Pressable
                onPress={onClose}
                hitSlop={HIT_SLOP_8}
                style={({ pressed }) => [
                  styles.closeBtn,
                  { backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            {/* Scrollable Form Content */}
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* Quick Auto-Fill Action */}
              <Pressable
                onPress={handleUseCurrentLocation}
                disabled={locating}
                style={({ pressed }) => [
                  styles.autoFillBtn,
                  { backgroundColor: isDark ? 'rgba(108, 71, 255, 0.18)' : '#EDE9FE' },
                  pressed && { opacity: 0.75 },
                ]}
              >
                {locating ? (
                  <>
                    <ActivityIndicator size="small" color={theme.purple} style={{ marginRight: 6 }} />
                    <Text style={[styles.autoFillText, { color: theme.purple }]}>Locating your address…</Text>
                  </>
                ) : (
                  <>
                    <Feather name="crosshair" size={14} color={theme.purple} style={{ marginRight: 6 }} />
                    <Text style={[styles.autoFillText, { color: theme.purple }]}>Use current location</Text>
                  </>
                )}
              </Pressable>

              {/* Recipient Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Full name</Text>
                <TextInput
                  value={form.recipient_name}
                  onChangeText={(t) => set({ recipient_name: t })}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Sam Lee"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.panel,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                    focusedField === 'name' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                    attemptedSubmit && Boolean(errors.recipient_name) && styles.inputError,
                  ]}
                />
                {attemptedSubmit && Boolean(errors.recipient_name) && (
                  <Text style={styles.errorText}>{errors.recipient_name}</Text>
                )}
              </View>

              {/* Street Address */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Street address</Text>
                <TextInput
                  value={form.line1}
                  onChangeText={(t) => set({ line1: t })}
                  onFocus={() => setFocusedField('line1')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="House / Apartment, Street, Area"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.panel,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                    focusedField === 'line1' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                    attemptedSubmit && Boolean(errors.line1) && styles.inputError,
                  ]}
                />
                {attemptedSubmit && Boolean(errors.line1) && (
                  <Text style={styles.errorText}>{errors.line1}</Text>
                )}
              </View>

              {/* Landmark / Suite (Optional) */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Apartment, suite, landmark (optional)</Text>
                <TextInput
                  value={form.line2}
                  onChangeText={(t) => set({ line2: t })}
                  onFocus={() => setFocusedField('line2')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Near Central Park, Floor 3"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.panel,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                    focusedField === 'line2' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                  ]}
                />
              </View>

              {/* City & State / Region */}
              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1, marginRight: 6 }]}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>City</Text>
                  <TextInput
                    value={form.city}
                    onChangeText={(t) => set({ city: t })}
                    onFocus={() => setFocusedField('city')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. Lahore"
                    placeholderTextColor={theme.textMuted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                      focusedField === 'city' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                      attemptedSubmit && Boolean(errors.city) && styles.inputError,
                    ]}
                  />
                  {attemptedSubmit && Boolean(errors.city) && (
                    <Text style={styles.errorText}>{errors.city}</Text>
                  )}
                </View>

                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 6 }]}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>State / Province</Text>
                  <TextInput
                    value={form.state}
                    onChangeText={(t) => set({ state: t })}
                    onFocus={() => setFocusedField('state')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. Punjab"
                    placeholderTextColor={theme.textMuted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                      focusedField === 'state' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                    ]}
                  />
                </View>
              </View>

              {/* Postal Code & Country */}
              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1, marginRight: 6 }]}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Postal code</Text>
                  <TextInput
                    value={form.postal_code}
                    onChangeText={(t) => set({ postal_code: t })}
                    onFocus={() => setFocusedField('postal')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. 54000"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                      focusedField === 'postal' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                    ]}
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 6 }]}>
                  <Text style={[styles.label, { color: theme.textMuted }]}>Country</Text>
                  <TextInput
                    value={form.country}
                    onChangeText={(t) => set({ country: t })}
                    onFocus={() => setFocusedField('country')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. Pakistan"
                    placeholderTextColor={theme.textMuted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                      focusedField === 'country' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                    ]}
                  />
                </View>
              </View>

              {/* Phone Number */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Phone number (for delivery courier)</Text>
                <TextInput
                  value={form.phone}
                  onChangeText={(t) => set({ phone: t })}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. 0300 1234567"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  maxLength={15}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.panel,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                    focusedField === 'phone' && [styles.inputFocused, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }],
                    attemptedSubmit && Boolean(errors.phone) && styles.inputError,
                  ]}
                />
                {attemptedSubmit && Boolean(errors.phone) && (
                  <Text style={styles.errorText}>{errors.phone}</Text>
                )}
              </View>
            </ScrollView>

            {/* ── Fixed Footer Action Bar (Always Visible at Bottom) ── */}
            <View
              style={[
                styles.footer,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <Pressable
                disabled={saving}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.saveBtn,
                  { backgroundColor: theme.accent },
                  pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={theme.background} size="small" />
                ) : (
                  <Text style={[styles.saveBtnText, { color: theme.background }]}>
                    {initial ? 'Save address' : 'Add delivery address'}
                  </Text>
                )}
              </Pressable>

              {/* Optional Remove */}
              {onRemove && (
                <Pressable
                  onPress={handleRemove}
                  disabled={saving}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeBtnText}>Remove address</Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoider>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
  } as ViewStyle,
  keyboardContainer: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    height: Platform.OS === 'web' ? 620 : '92%',
  } as ViewStyle,
  sheetContainer: {
    flex: 1,
    maxHeight: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderRadius: Platform.OS === 'web' ? 24 : 0,
    borderWidth: 1,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  } as ViewStyle,
  notch: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
    paddingBottom: 4,
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  } as TextStyle,
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  scrollView: {
    flex: 1,
  } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  } as ViewStyle,
  autoFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E6F5F6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 14,
  } as ViewStyle,
  autoFillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6C47FF',
    fontFamily: 'Inter_700Bold',
  } as TextStyle,
  fieldGroup: {
    marginBottom: 12,
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4B5563',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 6,
    marginLeft: 2,
  } as TextStyle,
  input: {
    height: 46,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#111111',
    fontFamily: 'Inter_500Medium',
  } as TextStyle,
  inputFocused: {
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
  } as TextStyle,
  inputError: {
    borderColor: '#EF4444',
  } as TextStyle,
  errorText: {
    fontSize: 11.5,
    color: '#EF4444',
    marginTop: 4,
    marginLeft: 4,
    fontFamily: 'Inter_500Medium',
  } as TextStyle,
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  } as ViewStyle,
  saveBtn: {
    height: 48,
    backgroundColor: '#111111',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.1,
  } as TextStyle,
  removeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 2,
  } as ViewStyle,
  removeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
    fontFamily: 'Inter_600SemiBold',
  } as TextStyle,
});
