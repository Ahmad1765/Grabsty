// "Report an issue" on an order: what went wrong, a description, optional
// photos. Submitting files a support case for the team (report_order_issue)
// and then shows the confirmation.

import { useEffect, useState } from 'react';
import { View, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { CONTENT_MAX_WIDTH, HIT_SLOP_8 } from '@/lib/responsive';
import { tap } from '@/lib/haptics';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { deleteListingImages, uploadListingImages, type LocalImage } from '@/lib/upload';
import {
  BUYER_ISSUES,
  SELLER_ISSUES,
  MAX_ISSUE_PHOTOS,
  orderReference,
  reportOrderIssue,
  type IssueCategory,
  type IssueReportResult,
} from '@/lib/orderTracking';

export function ReportIssueSheet({
  visible,
  orderId,
  userId,
  isSeller,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  orderId: string;
  userId: string;
  isSeller: boolean;
  onClose: () => void;
  onSubmitted?: (result: IssueReportResult) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const options = isSeller ? SELLER_ISSUES : BUYER_ISSUES;

  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<LocalImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IssueReportResult | null>(null);

  // Fresh form each time it opens.
  useEffect(() => {
    if (!visible) return;
    setCategory(null);
    setDescription('');
    setPhotos([]);
    setError(null);
    setResult(null);
  }, [visible]);

  const close = () => {
    if (!submitting) onClose();
  };

  const addPhotos = async () => {
    if (submitting || photos.length >= MAX_ISSUE_PHOTOS) return;
    tap('light');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_ISSUE_PHOTOS - photos.length,
        quality: 0.8,
        base64: true,
      });
      if (picked.canceled) return;
      const next = picked.assets.map((a) => ({ uri: a.uri, base64: a.base64 ?? null }));
      setPhotos((prev) => [...prev, ...next].slice(0, MAX_ISSUE_PHOTOS));
    } catch {
      setError("Couldn't open your photos. Try again.");
    }
  };

  const ready = !!category && description.trim().length >= 10;

  const submit = async () => {
    if (!category || submitting) return;
    if (description.trim().length < 10) {
      setError('Tell us a little more (at least 10 characters).');
      return;
    }
    tap('medium');
    setSubmitting(true);
    setError(null);
    let uploadedUrls: string[] = [];
    try {
      const uploaded = photos.length ? await uploadListingImages(photos, userId) : [];
      uploadedUrls = uploaded.map((u) => u.url);
      const res = await reportOrderIssue({ orderId, category, description, imageUrls: uploadedUrls });
      setResult(res);
      onSubmitted?.(res);
    } catch (e: any) {
      // The report wasn't filed: the photos would be orphaned (a retry uploads again).
      if (uploadedUrls.length) deleteListingImages(uploadedUrls).catch(() => {});
      setError(e?.message || "Couldn't send your report. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const label = { fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginBottom: 8 } as const;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <KeyboardAvoider style={{ width: '100%', maxHeight: '92%' }}>
          <View
            style={{
              backgroundColor: theme.panel,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 20) + 8,
              maxHeight: '100%',
              maxWidth: CONTENT_MAX_WIDTH,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontFamily: typography.family.sansBold, color: theme.ink, letterSpacing: -0.3 }}>
                  {result ? 'Report sent' : 'Report an issue'}
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 2 }}>Order #{orderReference(orderId)}</Text>
              </View>
              <Pressable
                onPress={close}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="x" size={18} color={theme.ink} />
              </Pressable>
            </View>

            {result ? (
              <View testID="report-issue-done" style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 6 }}>
                <Feather name="check-circle" size={34} color={theme.ink} />
                <Text style={{ fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 14, textAlign: 'center' }}>
                  Our team will contact you shortly.
                </Text>
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: theme.mute, marginTop: 8, textAlign: 'center' }}>
                  Your report is with Grabsty support as case {result.case_label}. We&apos;ll reply in Activity → Support.
                  {result.payment_on_hold ? ' The payment for this order is on hold until it is resolved.' : ''}
                </Text>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    marginTop: 22,
                    height: 48,
                    alignSelf: 'stretch',
                    borderRadius: 24,
                    backgroundColor: theme.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.background }}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
                <Text style={label}>What went wrong?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {options.map((o) => {
                    const active = category === o.id;
                    return (
                      <Pressable
                        key={o.id}
                        testID={`issue-category-${o.id}`}
                        onPress={() => {
                          tap('light');
                          setCategory(o.id);
                          setError(null);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => ({
                          height: 30,
                          borderRadius: 15,
                          paddingHorizontal: 14,
                          justifyContent: 'center',
                          backgroundColor: active ? theme.ink : theme.panel,
                          borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                          borderColor: theme.border,
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: active ? theme.background : theme.ink }}>
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[label, { marginTop: 20 }]}>Tell us what happened</Text>
                <TextInput
                  testID="issue-description"
                  value={description}
                  onChangeText={(t) => {
                    setDescription(t);
                    setError(null);
                  }}
                  multiline
                  maxLength={1500}
                  placeholder={isSeller ? 'What happened, and when?' : 'What is wrong with the item or delivery? When did you notice?'}
                  placeholderTextColor={theme.muteSoft}
                  accessibilityLabel="Describe the issue"
                  style={{
                    minHeight: 104,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.panel,
                    padding: 12,
                    fontSize: 15,
                    lineHeight: 21,
                    color: theme.ink,
                    textAlignVertical: 'top',
                    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
                  }}
                />

                <Text style={[label, { marginTop: 20 }]}>
                  Photos <Text style={{ color: theme.mute, fontFamily: typography.family.sans }}>(optional, up to {MAX_ISSUE_PHOTOS})</Text>
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {photos.map((p, i) => (
                    <View key={`${p.uri}-${i}`} style={{ width: 68, height: 68 }}>
                      <Image source={{ uri: p.uri }} style={{ width: 68, height: 68, borderRadius: 8, backgroundColor: theme.surface }} contentFit="cover" />
                      <Pressable
                        onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        disabled={submitting}
                        hitSlop={HIT_SLOP_8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove photo ${i + 1}`}
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.ink,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="x" size={12} color={theme.background} />
                      </Pressable>
                    </View>
                  ))}
                  {photos.length < MAX_ISSUE_PHOTOS ? (
                    <Pressable
                      testID="issue-add-photo"
                      onPress={addPhotos}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Add photos"
                      style={({ pressed }) => ({
                        width: 68,
                        height: 68,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Feather name="camera" size={18} color={theme.ink} />
                      <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4 }}>Add</Text>
                    </Pressable>
                  ) : null}
                </View>

                {error ? (
                  <Text style={{ fontSize: 13, color: theme.danger, marginTop: 14, fontFamily: typography.family.sansSemibold }}>{error}</Text>
                ) : null}

                <Pressable
                  testID="issue-submit"
                  onPress={submit}
                  disabled={!ready || submitting}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !ready || submitting }}
                  style={({ pressed }) => ({
                    marginTop: 20,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !ready || submitting ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.background} />
                  ) : (
                    <Text style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.background }}>Send report</Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoider>
      </View>
    </Modal>
  );
}
