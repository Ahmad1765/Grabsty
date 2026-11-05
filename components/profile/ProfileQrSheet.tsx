import { useState, useRef, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import QRCode from 'react-native-qrcode-svg';
import { SheetModal } from '@/components/settings/Sheet';
import { useTheme } from '@/context/ThemeContext';
import { getProfileInviteUrl, shareInviteLink, copyInviteLink } from '@/lib/friends';
import { useToast } from '@/lib/toast';
import { tap } from '@/lib/haptics';
import { radii } from '@/lib/theme';
import { BRAND } from '@/lib/brand';

export function ProfileQrSheet({
  visible,
  onClose,
  username,
  fullName,
}: {
  visible: boolean;
  onClose: () => void;
  username?: string | null;
  fullName?: string | null;
}) {
  const { theme, isDark } = useTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const inviteUrl = getProfileInviteUrl(username);
  const handle = username ? `@${username.replace(/^@+/, '')}` : BRAND;

  const handleCopy = async () => {
    tap('light');
    const ok = await copyInviteLink(username);
    if (ok) {
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2500);
    }
  };

  const handleShare = async () => {
    tap('light');
    const res = await shareInviteLink(username, fullName);
    if (res.action === 'copied') {
      setCopied(true);
    }
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Share Profile">
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        {/* Username Header */}
        <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text, letterSpacing: -0.3 }}>
          {fullName || handle}
        </Text>
        <Text style={{ fontSize: 13, color: theme.mute, marginTop: 2, marginBottom: 20 }}>
          {handle}
        </Text>

        {/* QR Code Container */}
        <View
          style={{
            padding: 18,
            borderRadius: radii['2xl'],
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.08,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <QRCode
            value={inviteUrl}
            size={180}
            color={isDark ? '#FFFFFF' : '#0F0F0F'}
            backgroundColor={isDark ? '#1C1C1E' : '#FFFFFF'}
          />
        </View>

        <Text
          style={{
            fontSize: 12,
            color: theme.muteSoft,
            marginTop: 16,
            marginBottom: 24,
            textAlign: 'center',
            paddingHorizontal: 20,
          }}
        >
          Scan with any camera to instantly view and follow this closet
        </Text>

        {/* Action Buttons */}
        <View style={{ width: '100%', gap: 10 }}>
          {/* Share Button (Ghost Dark) */}
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => ({
              width: '100%',
              height: 48,
              borderRadius: radii.pill,
              backgroundColor: theme.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="share-2" size={16} color={theme.background} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.background }}>
              Share Profile Link
            </Text>
          </Pressable>

          {/* Copy Link Button (Paper White Outline) */}
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => ({
              width: '100%',
              height: 48,
              borderRadius: radii.pill,
              backgroundColor: theme.panel,
              borderWidth: 1,
              borderColor: theme.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name={copied ? 'check' : 'copy'} size={16} color={theme.text} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
              {copied ? 'Copied!' : 'Copy Link'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SheetModal>
  );
}
