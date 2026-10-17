// app/wardrobe/new.tsx — post an outfit to your wardrobe, optionally hiding
// your face and/or the background (web: real processing; native: no-op today).
import { useState, useRef } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cleanPhoto } from '@/lib/photoClean';
import { uploadWardrobeImage, type LocalImage } from '@/lib/upload';
import { useCreateWardrobePost } from '@/lib/queries';

function NewWardrobeInner() {
  const { user } = useAuth();
  const toast = useToast();
  const createPost = useCreateWardrobePost(user?.id ?? null);

  const [original, setOriginal] = useState<LocalImage | null>(null);
  const [preview, setPreview] = useState<LocalImage | null>(null); // processed (or original)
  const [blurFace, setBlurFace] = useState(false);
  const [removeBg, setRemoveBg] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const seqRef = useRef(0);
  // The flags that the CURRENT preview was actually produced with (so the DB
  // flags reflect reality, not just toggle intent).
  const [previewFlags, setPreviewFlags] = useState({ blurFace: false, removeBackground: false });

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      base64: true,
    });
    if (res.canceled) return;
    const img = { uri: res.assets[0].uri, base64: res.assets[0].base64 ?? null };
    setOriginal(img);
    setBlurFace(false);
    setRemoveBg(false);
    setPreview(img);
    setPreviewFlags({ blurFace: false, removeBackground: false });
  };

  // Re-run cleaning whenever a toggle changes. If both are off, show the original.
  const reprocess = async (nextBlur: boolean, nextBg: boolean) => {
    if (!original) return;
    const mySeq = ++seqRef.current; // token so a stale run's result is dropped
    if (!nextBlur && !nextBg) {
      setPreview(original);
      setPreviewFlags({ blurFace: false, removeBackground: false });
      return;
    }
    setProcessing(true);
    try {
      const r = await cleanPhoto(original, { blurFace: nextBlur, removeBackground: nextBg, faceMode: 'eyes' });
      if (mySeq !== seqRef.current) return; // superseded by a newer toggle
      if (r.ok) {
        setPreview({ uri: r.uri, base64: r.base64 });
        setPreviewFlags({ blurFace: nextBlur, removeBackground: nextBg });
      } else {
        setPreview(original);
        setPreviewFlags({ blurFace: false, removeBackground: false });
        toast.show('Could not hide on this device; posting original', { variant: 'info' });
      }
    } finally {
      if (mySeq === seqRef.current) setProcessing(false);
    }
  };

  const toggleBlur = () => { const n = !blurFace; setBlurFace(n); reprocess(n, removeBg); };
  const toggleBg = () => { const n = !removeBg; setRemoveBg(n); reprocess(blurFace, n); };

  const post = async () => {
    if (!user || !original || !preview) return;
    setPosting(true);
    try {
      const url = await uploadWardrobeImage(preview, user.id);
      await createPost.mutateAsync({
        imageUrl: url,
        caption: caption.trim() || null,
        tags: [],
        faceHidden: previewFlags.blurFace,
        bgRemoved: previewFlags.removeBackground,
      });
      toast.show('Posted to your wardrobe', { variant: 'success', icon: 'check' });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not post', e?.message ?? 'Unknown error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 pt-3 pb-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={24} color="#0F0F0F" />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800' }}>New outfit</Text>
        <View style={{ width: 24 }} />
      </View>
      <KeyboardAvoider style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        >
        {!preview ? (
          <Pressable
            onPress={pick}
            style={{ height: 360, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#6C47FF', backgroundColor: 'rgba(108,71,255,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="plus" size={28} color="#6C47FF" />
            <Text style={{ marginTop: 8, color: '#6C47FF', fontWeight: '700' }}>Add an outfit photo</Text>
          </Pressable>
        ) : (
          <View style={{ position: 'relative' }}>
            <Image source={{ uri: preview.uri }} style={{ width: '100%', height: 360, borderRadius: 18 }} contentFit="contain" />
            {processing && (
              <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 18 }}>
                <ActivityIndicator color="#6C47FF" />
              </View>
            )}
          </View>
        )}

        {preview && (
          <>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <ToggleChip label="Hide eyes" active={blurFace} onPress={toggleBlur} icon="eye-off" disabled={processing} />
              <ToggleChip label="Remove background" active={removeBg} onPress={toggleBg} icon="image" disabled={processing} />
            </View>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Say something about this fit… (optional)"
              placeholderTextColor="rgba(15,15,15,0.35)"
              style={{ marginTop: 16, borderWidth: 1, borderColor: 'rgba(15,15,15,0.12)', borderRadius: 14, padding: 14, fontSize: 15, minHeight: 60 }}
              multiline
            />
          </>
        )}
      </ScrollView>

        <View className="bg-white border-t border-ink-hair" style={{ padding: 20 }}>
          <Pressable
            onPress={post}
            disabled={!preview || processing || posting}
            style={{ height: 54, borderRadius: 14, backgroundColor: !preview || processing || posting ? 'rgba(15,15,15,0.12)' : '#0F0F0F', alignItems: 'center', justifyContent: 'center' }}
          >
            {posting ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: !preview || processing ? 'rgba(15,15,15,0.55)' : '#fff', fontWeight: '800', fontSize: 16 }}>Post outfit</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

function ToggleChip({ label, active, onPress, icon, disabled }: { label: string; active: boolean; onPress: () => void; icon: keyof typeof Feather.glyphMap; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      style={{
        height: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingHorizontal: 12,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: active ? '#6C47FF' : 'rgba(15,15,15,0.12)',
        backgroundColor: active ? 'rgba(108,71,255,0.08)' : '#fff',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Feather name={icon} size={12} color={active ? '#6C47FF' : 'rgba(15,15,15,0.55)'} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#6C47FF' : 'rgba(15,15,15,0.62)' }}>{label}</Text>
    </Pressable>
  );
}

export default function NewWardrobeScreen() {
  return (
    <RequireAuth>
      <NewWardrobeInner />
    </RequireAuth>
  );
}
