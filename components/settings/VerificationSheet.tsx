// Certified Seller verification — CNIC only. The seller enters their name and
// 13-digit CNIC and photographs both sides; an admin reviews it in /admin and
// approval turns on the profile's verified badge. The server enforces the same
// rules (guard_verification_cnic), so this form can't be bypassed.

import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Platform, Alert } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { useVerificationPhotoUrl } from '@/lib/upload';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { tap } from '@/lib/haptics';
import { cnicDigits, cnicFrontPath, formatCnic, isValidCnic } from '@/lib/payoutDetails';
import type { Verification } from '@/types';
import { SheetModal, SheetField, SheetPrimary } from './Sheet';

export type LocalImage = { uri: string; base64?: string | null };

export type VerifyForm = {
  legal_name: string;
  /** Digits only. */
  cnic_number: string;
  /** Stored paths (already uploaded) — kept when the user doesn't retake. */
  front_path: string | null;
  back_path: string | null;
  front_local: LocalImage | null;
  back_local: LocalImage | null;
};

async function pickImage(side: string): Promise<LocalImage | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.85, base64: true };
  const toLocal = (r: ImagePicker.ImagePickerResult) =>
    !r.canceled && r.assets?.[0] ? { uri: r.assets[0].uri, base64: r.assets[0].base64 ?? null } : null;

  if (Platform.OS === 'web') return toLocal(await ImagePicker.launchImageLibraryAsync(opts));

  return new Promise((resolve) => {
    Alert.alert(`CNIC ${side}`, 'Photograph the card flat, with all four corners visible.', [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Camera permission needed', 'Allow camera access in Settings to photograph your CNIC.');
            return resolve(null);
          }
          resolve(toLocal(await ImagePicker.launchCameraAsync(opts)));
        },
      },
      {
        text: 'Choose from library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Photo permission needed', 'Allow photo access to choose your CNIC image.');
            return resolve(null);
          }
          resolve(toLocal(await ImagePicker.launchImageLibraryAsync(opts)));
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

function PhotoSlot({ label, value, onPick }: { label: string; value: string | null; onPick: () => void }) {
  const { theme } = useTheme();
  const uri = useVerificationPhotoUrl(value);
  return (
    <Pressable
      onPress={onPick}
      accessibilityRole="button"
      accessibilityLabel={value ? `Retake CNIC ${label}` : `Add CNIC ${label}`}
      testID={`cnic-${label}`}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1.58, // CNIC card proportions
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: value ? 'solid' : 'dashed',
        borderColor: value ? theme.ink : theme.border,
        backgroundColor: theme.surface,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {value && uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <>
          <Feather name="camera" size={20} color={theme.mute} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: 6 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

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
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [cnic, setCnic] = useState('');
  const [front, setFront] = useState<{ path: string | null; local: LocalImage | null }>({ path: null, local: null });
  const [back, setBack] = useState<{ path: string | null; local: LocalImage | null }>({ path: null, local: null });
  const [saving, setSaving] = useState(false);
  // The saved record can arrive after the sheet opened (Settings loads it in
  // the background): fill from it then, but never over the user's input.
  const dirty = useRef(false);
  const touch = () => {
    dirty.current = true;
  };

  useEffect(() => {
    if (!visible) dirty.current = false;
  }, [visible]);

  useEffect(() => {
    if (!visible || dirty.current) return;
    setName(initial?.legal_name ?? '');
    setCnic(formatCnic(initial?.cnic_number ?? ''));
    setFront({ path: cnicFrontPath(initial), local: null });
    setBack({ path: initial?.id_back_photo_path ?? null, local: null });
    setSaving(false);
  }, [visible, initial]);

  const approved = initial?.status === 'approved';
  const nameOk = name.trim().length >= 3;
  const cnicOk = isValidCnic(cnic);
  const hasFront = !!(front.local || front.path);
  const hasBack = !!(back.local || back.path);
  const canSave = nameOk && cnicOk && hasFront && hasBack && !approved;

  const status =
    initial?.status === 'submitted'
      ? 'Under review. We usually reply within a day.'
      : initial?.status === 'rejected'
        ? `Not approved${initial.notes && !cnicFrontPath(initial) ? `: ${initial.notes}` : ''}. Check the details and resubmit.`
        : null;

  return (
    <SheetModal visible={visible} onClose={onClose} title={approved ? 'Certified Seller' : 'Become a Certified Seller'}>
      {approved ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <ShieldCheckIcon size={52} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 14 }}>You&apos;re certified</Text>
          <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
            Your CNIC was verified on {initial?.reviewed_at?.slice(0, 10) ?? '—'}. Buyers see the verified badge on
            your profile and listings.
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: theme.textMuted, lineHeight: 19, marginBottom: 14 }}>
            Certified Sellers get a verified badge buyers trust. Verification is by CNIC only. Your CNIC is private:
            only the Grabsty team reviewing it can see it.
          </Text>
          {status ? (
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
                padding: 12,
                borderRadius: 10,
                backgroundColor: theme.surface,
                marginBottom: 14,
              }}
            >
              <Feather
                name={initial?.status === 'rejected' ? 'alert-circle' : 'clock'}
                size={15}
                color={initial?.status === 'rejected' ? theme.danger : theme.purple}
              />
              <Text style={{ flex: 1, fontSize: 13, color: theme.text }}>{status}</Text>
            </View>
          ) : null}

          <SheetField
            label="Full name (as on CNIC)"
            value={name}
            onChangeText={(t) => {
              touch();
              setName(t.slice(0, 100));
            }}
            error={!nameOk && name.length > 0 ? 'Enter your full name' : undefined}
          />
          <SheetField
            label="CNIC number"
            value={cnic}
            placeholder="35201-1234567-1"
            keyboardType="number-pad"
            onChangeText={(t) => {
              touch();
              setCnic(formatCnic(t));
            }}
            error={!cnicOk && cnic.length > 0 ? '13 digits' : undefined}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            <PhotoSlot
              label="Front"
              value={front.local?.uri ?? front.path}
              onPick={async () => {
                tap('light');
                const img = await pickImage('front');
                if (img) {
                  touch();
                  setFront({ path: null, local: img });
                }
              }}
            />
            <PhotoSlot
              label="Back"
              value={back.local?.uri ?? back.path}
              onPick={async () => {
                tap('light');
                const img = await pickImage('back');
                if (img) {
                  touch();
                  setBack({ path: null, local: img });
                }
              }}
            />
          </View>

          <SheetPrimary
            label={saving ? 'Submitting…' : initial ? 'Resubmit for review' : 'Submit for review'}
            loading={saving}
            disabled={!canSave || saving}
            onPress={async () => {
              if (!canSave) return;
              setSaving(true);
              try {
                await onSave({
                  legal_name: name.trim(),
                  cnic_number: cnicDigits(cnic),
                  front_path: front.path,
                  back_path: back.path,
                  front_local: front.local,
                  back_local: back.local,
                });
              } finally {
                setSaving(false);
              }
            }}
          />
        </>
      )}
    </SheetModal>
  );
}
