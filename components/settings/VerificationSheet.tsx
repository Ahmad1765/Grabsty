import { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  Alert,
  } from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { tap } from '@/lib/haptics';
import type { DocumentKind, Verification } from '@/types';
import { SheetField, SheetLabel, SheetChoice, SheetPrimary } from './Sheet';

export type VerifyForm = {
  legal_name: string;
  document_kind: DocumentKind;
  document_number_last4: string;
  id_photo_url?: string | null;
  local_image?: { uri: string; base64?: string | null } | null;
};

const KIND_LABELS: Record<DocumentKind, string> = {
  national_id: 'CNIC / National ID',
  passport: 'Passport',
  drivers_license: "Driver's license",
};

const KINDS: DocumentKind[] = ['national_id', 'passport', 'drivers_license'];

export function VerificationSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: Verification | null;
  onClose: () => void;
  onSave: (form: VerifyForm) => Promise<void>;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<VerifyForm>({
    legal_name: '',
    document_kind: 'national_id',
    document_number_last4: '',
    id_photo_url: null,
  });
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [localImage, setLocalImage] = useState<{ uri: string; base64?: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const existingPhoto = initial?.id_photo_url ?? initial?.notes ?? null;
      setForm({
        legal_name: initial?.legal_name ?? '',
        document_kind: (initial?.document_kind as DocumentKind) ?? 'national_id',
        document_number_last4: initial?.document_number_last4 ?? '',
        id_photo_url: existingPhoto,
      });
      setPreviewUri(existingPhoto);
      setLocalImage(null);
      setSaving(false);
    }
  }, [visible, initial]);

  const nameValid = form.legal_name.trim().length >= 2;
  const last4Valid =
    form.document_number_last4.length === 0 || /^[A-Za-z0-9]{2,6}$/.test(form.document_number_last4);
  const canSave = nameValid && last4Valid && initial?.status !== 'approved';

  const pickIdPhoto = async () => {
    tap('light');
    if (Platform.OS === 'web') {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.85,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          setLocalImage({ uri: asset.uri, base64: asset.base64 ?? null });
          setPreviewUri(asset.uri);
        }
      } catch (err) {
        console.warn('[Verification] photo pick failed', err);
      }
      return;
    }

    Alert.alert('Upload CNIC / ID Photo', 'Choose how you want to upload your ID card photo', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Camera permission needed', 'Please allow camera access in Settings to photograph your ID.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.85,
            base64: true,
          });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            setLocalImage({ uri: asset.uri, base64: asset.base64 ?? null });
            setPreviewUri(asset.uri);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Photo permission needed', 'Please allow photo library access to choose your ID image.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.85,
            base64: true,
          });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            setLocalImage({ uri: asset.uri, base64: asset.base64 ?? null });
            setPreviewUri(asset.uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRemovePhoto = () => {
    tap('light');
    setPreviewUri(null);
    setLocalImage(null);
    setForm((s) => ({ ...s, id_photo_url: null }));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.overlay,
          justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
          alignItems: 'center',
          paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
        }}
      >
        <Pressable
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          onPress={onClose}
          accessibilityLabel="Close"
        />

        <KeyboardAvoider
          style={{ width: '100%', maxWidth: 520, maxHeight: '92%' }}
        >
          <View
            style={{
              backgroundColor: isDark ? '#141414' : theme.panel,
              borderRadius: Platform.OS === 'web' ? 24 : 0,
              ...(Platform.OS !== 'web' && {
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
              }),
              borderWidth: isDark ? 1 : 0,
              borderColor: theme.border,
              overflow: 'hidden',
              maxHeight: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            {/* Top Bar with Back Arrow matching Image 1 */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <Pressable
                onPress={() => {
                  tap('light');
                  onClose();
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: pressed
                    ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                    : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Feather name="chevron-left" size={24} color={theme.text} />
              </Pressable>

              {/* Status Pill if already submitted */}
              {initial?.status === 'submitted' && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: 'rgba(108,71,255,0.12)',
                  }}
                >
                  <Feather name="clock" size={12} color={theme.purple} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.purple }}>
                    Under review
                  </Text>
                </View>
              )}

              <View style={{ width: 38 }} />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === 'ios' ? 36 : Math.max(insets.bottom + 8, 24),
              }}
            >
              {initial?.status === 'approved' ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <View style={{ marginBottom: 16 }}>
                    <ShieldCheckIcon size={56} />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>
                    You&apos;re a verified member
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.textMuted,
                      marginTop: 8,
                      textAlign: 'center',
                      lineHeight: 19,
                      maxWidth: 320,
                    }}
                  >
                    Your government ID has been reviewed and verified. You have full access to live bidding, buyer protection, and automatic seller payouts.
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 14 }}>
                    Approved on {initial.reviewed_at?.slice(0, 10) ?? '—'}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Hero Verified Buyer Badge & Title matching Image 1 */}
                  <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 18 }}>
                    <View style={{ marginBottom: 14 }}>
                      <ShieldCheckIcon size={52} />
                    </View>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: '800',
                        color: theme.text,
                        textAlign: 'center',
                        letterSpacing: -0.4,
                      }}
                    >
                      Become a verified buyer
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.textMuted,
                        textAlign: 'center',
                        marginTop: 6,
                        lineHeight: 19,
                        paddingHorizontal: 12,
                      }}
                    >
                      Once verified you will be able to bid in any stream.
                    </Text>
                  </View>

                  {/* ID / CNIC Photo Upload Card matching Image 1 */}
                  <Pressable
                    onPress={pickIdPhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Submit photo of your ID"
                    style={({ pressed }) => ({
                      backgroundColor: isDark ? '#1F1F23' : '#F2F2F7',
                      borderRadius: 16,
                      paddingVertical: previewUri ? 14 : 24,
                      paddingHorizontal: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: previewUri
                        ? theme.purple
                        : (isDark ? '#2E2E33' : '#E5E5EA'),
                      borderStyle: previewUri ? 'solid' : 'dashed',
                      opacity: pressed ? 0.85 : 1,
                      marginBottom: 20,
                    })}
                  >
                    {previewUri ? (
                      <View style={{ width: '100%', alignItems: 'center' }}>
                        <Image
                          source={{ uri: previewUri }}
                          style={{
                            width: '100%',
                            height: 180,
                            borderRadius: 10,
                            backgroundColor: isDark ? '#111111' : '#E5E5EA',
                          }}
                          contentFit="cover"
                        />
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            marginTop: 12,
                            paddingHorizontal: 4,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name="check-circle" size={15} color="#10B981" />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
                              CNIC / ID photo attached
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                pickIdPhoto();
                              }}
                              style={({ pressed }) => ({
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 6,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                                opacity: pressed ? 0.7 : 1,
                              })}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>
                                Change
                              </Text>
                            </Pressable>

                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                handleRemovePhoto();
                              }}
                              style={({ pressed }) => ({
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 6,
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                opacity: pressed ? 0.7 : 1,
                              })}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.danger }}>
                                Remove
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <>
                        <View
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 12,
                          }}
                        >
                          <Feather name="image" size={24} color={theme.text} />
                        </View>

                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '700',
                            color: theme.text,
                            textAlign: 'center',
                          }}
                        >
                          Submit Photo of your ID
                        </Text>

                        <Text
                          style={{
                            fontSize: 13,
                            color: theme.textMuted,
                            textAlign: 'center',
                            marginTop: 4,
                            lineHeight: 18,
                            maxWidth: 290,
                          }}
                        >
                          ID verification can typically take 1 to 3 minutes to complete.
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {/* Document Type Selector */}
                  <SheetLabel style={{ marginBottom: 8, marginLeft: 2 }}>Document type</SheetLabel>
                  <SheetChoice
                    options={KINDS}
                    value={form.document_kind}
                    onChange={(document_kind) => setForm((s) => ({ ...s, document_kind }))}
                    renderLabel={(k) => KIND_LABELS[k]}
                    style={{ marginBottom: 14 }}
                  />

                  {/* Form Inputs */}
                  <SheetField
                    label="Legal name (as on document / CNIC)"
                    value={form.legal_name}
                    onChangeText={(t) => setForm((s) => ({ ...s, legal_name: t.slice(0, 100) }))}
                    error={!nameValid && form.legal_name.length > 0 ? 'At least 2 characters' : undefined}
                  />

                  <SheetField
                    label="Last 4 characters of CNIC / ID (optional)"
                    value={form.document_number_last4}
                    onChangeText={(t) =>
                      setForm((s) => ({
                        ...s,
                        document_number_last4: t.replace(/[^A-Za-z0-9]/g, '').slice(0, 6),
                      }))
                    }
                    error={
                      !last4Valid && form.document_number_last4.length > 0
                        ? '2–6 characters'
                        : undefined
                    }
                  />

                  {/* Submit CTA */}
                  <SheetPrimary
                    label={saving ? 'Submitting…' : initial ? 'Resubmit Verification' : 'Submit Photo for Verification'}
                    loading={saving}
                    disabled={!canSave || saving}
                    onPress={async () => {
                      if (!canSave) return;
                      setSaving(true);
                      try {
                        await onSave({
                          ...form,
                          id_photo_url: previewUri,
                          local_image: localImage,
                        });
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoider>
      </View>
    </Modal>
  );
}
