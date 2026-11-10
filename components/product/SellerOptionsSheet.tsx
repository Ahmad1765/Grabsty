import React, { useState, useEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator, Share, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { useTheme } from '@/context/ThemeContext';
import { BRAND, APP_URL } from '@/lib/brand';
import { reportUser, SELLER_REPORT_REASONS } from '@/lib/reports';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { User } from '@/types';

type SellerSummary = {
  id: string;
  username: string;
  avatar_url?: string | null;
  full_name?: string | null;
  location?: string | null;
  is_verified?: boolean;
};

interface SellerOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  seller: SellerSummary | User;
  listingId?: string | null;
}

export function SellerOptionsSheet({
  visible,
  onClose,
  seller,
  listingId,
}: SellerOptionsSheetProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'options' | 'report'>('options');
  const [submittingReport, setSubmittingReport] = useState(false);
  const isSubmittingReportRef = useRef(false);

  // Reset mode on reopen
  useEffect(() => {
    if (visible) {
      setMode('options');
      setSubmittingReport(false);
      isSubmittingReportRef.current = false;
    }
  }, [visible]);

  if (!seller) return null;

  const sellerUrl = `${APP_URL}/user/${seller.id}`;

  const handleShare = async () => {
    onClose();
    try {
      if (Platform.OS === 'web') {
        if (navigator?.share) {
          try {
            await navigator.share({
              title: `@${seller.username} on ${BRAND}`,
              text: `Check out @${seller.username}'s shop on ${BRAND}!`,
              url: sellerUrl,
            });
            return;
          } catch {
            // fallback to clipboard
          }
        }
        await Clipboard.setStringAsync(sellerUrl);
        toast.done('Profile link copied to clipboard!', 'copy');
      } else {
        await Share.share({
          message: `Check out @${seller.username}'s shop on ${BRAND}!\n${sellerUrl}`,
          url: sellerUrl,
        });
      }
    } catch {
      // User cancelled
    }
  };

  const handleViewProfile = () => {
    onClose();
    if (user?.id === seller.id) {
      router.push('/(tabs)/profile' as any);
    } else {
      router.push(`/user/${seller.id}` as any);
    }
  };

  const handleSelectReportReason = async (reasonId: string) => {
    if (isSubmittingReportRef.current) return;

    if (!user) {
      onClose();
      toast.show('Sign in to report a seller', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }

    if (user.id === seller.id) {
      onClose();
      toast.show("You can't report your own profile", { variant: 'default', icon: 'info' });
      return;
    }

    isSubmittingReportRef.current = true;
    setSubmittingReport(true);
    try {
      const ok = await reportUser({
        reporterId: user.id,
        reportedUserId: seller.id,
        reason: reasonId,
        listingId: listingId ?? null,
      });
      onClose();

      if (ok) {
        toast.done('Thanks — our team will take a look.', 'flag');
      } else {
        toast.show('Could not submit report. Please try again.', { variant: 'default', icon: 'alert-triangle' });
      }
    } catch {
      onClose();
      toast.show('Could not submit report. Please try again.', { variant: 'default', icon: 'alert-triangle' });
    } finally {
      isSubmittingReportRef.current = false;
      setSubmittingReport(false);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={mode === 'options' ? seller.full_name?.trim() || `@${seller.username}` : 'Report seller'}
      subtitle={
        mode === 'options'
          ? [seller.full_name?.trim() ? `@${seller.username}` : null, seller.location].filter(Boolean).join(' · ') || 'Seller'
          : 'Select a reason for review'
      }
      autoHeight={true}
    >
      {mode === 'options' ? (
        <View style={styles.container}>
          {[
            { key: 'share', icon: 'share-2', title: 'Share profile', desc: 'Send their shop to a friend', onPress: handleShare },
            { key: 'shop', icon: 'shopping-bag', title: 'View shop', desc: 'Listings, reviews and ratings', onPress: handleViewProfile },
            { key: 'report', icon: 'flag', title: 'Report seller', desc: 'Flag suspicious activity', onPress: () => setMode('report'), danger: true },
          ].map((a, i) => {
            const color = a.danger ? theme.danger : theme.ink;
            return (
              <Pressable
                key={a.key}
                testID={`seller-options-${a.key}`}
                onPress={a.onPress}
                accessibilityRole="button"
                accessibilityLabel={a.title}
                style={({ pressed }) => [
                  styles.actionRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name={a.icon as any} size={20} color={color} />
                <View style={styles.actionContent}>
                  <Text style={[styles.actionTitle, { color }]}>{a.title}</Text>
                  <Text style={[styles.actionDesc, { color: theme.mute }]}>{a.desc}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.mute} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        /* Reporting mode */
        <View style={styles.container}>
          {submittingReport ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.purple} />
              <Text style={[styles.loadingText, { color: theme.mute }]}>Submitting report...</Text>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => setMode('options')}
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
              >
                <Feather name="arrow-left" size={15} color={theme.ink} />
                <Text style={[styles.backBtnText, { color: theme.ink }]}>Back to options</Text>
              </Pressable>

              <View style={[styles.reportGroup, { backgroundColor: theme.panel }]}>
                {SELLER_REPORT_REASONS.map((r, idx) => (
                  <React.Fragment key={r.id}>
                    <Pressable
                      onPress={() => handleSelectReportReason(r.id)}
                      style={({ pressed }) => [
                        styles.reportReasonRow,
                        pressed && { backgroundColor: theme.primarySoft },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.reportReasonLabel, { color: theme.ink }]}>{r.label}</Text>
                        {r.description ? (
                          <Text style={[styles.reportReasonDesc, { color: theme.mute }]}>{r.description}</Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={16} color={theme.mute} />
                    </Pressable>
                    {idx < SELLER_REPORT_REASONS.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: theme.divider }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 12,
    gap: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  actionDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 64,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reportGroup: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  reportReasonLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  reportReasonDesc: {
    fontSize: 11.5,
    marginTop: 1,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
