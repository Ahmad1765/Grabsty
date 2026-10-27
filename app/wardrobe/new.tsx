// app/wardrobe/new.tsx — post an outfit photo to your wardrobe.
import { useState } from 'react';
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
import { uploadWardrobeImage, type LocalImage } from '@/lib/upload';
import { useCreateWardrobePost } from '@/lib/queries';

function NewWardrobeInner() {
  const { user } = useAuth();
  const toast = useToast();
  const createPost = useCreateWardrobePost(user?.id ?? null);

  const [preview, setPreview] = useState<LocalImage | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      base64: true,
    });
    if (res.canceled) return;
    setPreview({ uri: res.assets[0].uri, base64: res.assets[0].base64 ?? null });
  };

  const post = async () => {
    if (!user || !preview) return;
    setPosting(true);
    try {
      const url = await uploadWardrobeImage(preview, user.id);
      await createPost.mutateAsync({
        imageUrl: url,
        caption: caption.trim() || null,
        tags: [],
        faceHidden: false,
        bgRemoved: false,
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
          <Image source={{ uri: preview.uri }} style={{ width: '100%', height: 360, borderRadius: 18 }} contentFit="contain" />
        )}

        {preview && (
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Say something about this fit… (optional)"
            placeholderTextColor="rgba(15,15,15,0.35)"
            style={{ marginTop: 16, borderWidth: 1, borderColor: 'rgba(15,15,15,0.12)', borderRadius: 14, padding: 14, fontSize: 15, minHeight: 60 }}
            multiline
          />
        )}
      </ScrollView>

        <View className="bg-white border-t border-ink-hair" style={{ padding: 20 }}>
          <Pressable
            onPress={post}
            disabled={!preview || posting}
            style={{ height: 54, borderRadius: 14, backgroundColor: !preview || posting ? 'rgba(15,15,15,0.12)' : '#0F0F0F', alignItems: 'center', justifyContent: 'center' }}
          >
            {posting ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: !preview ? 'rgba(15,15,15,0.55)' : '#fff', fontWeight: '800', fontSize: 16 }}>Post outfit</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

export default function NewWardrobeScreen() {
  return (
    <RequireAuth>
      <NewWardrobeInner />
    </RequireAuth>
  );
}
