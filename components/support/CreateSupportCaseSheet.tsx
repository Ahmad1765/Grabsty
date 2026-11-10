// "Create support chat": the user describes the issue first; the server opens
// a numbered case (GS-1001...) and posts it into their support thread, where
// the support team replies. No bot.

import { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { tap } from '@/lib/haptics';
import { useToast } from '@/lib/toast';
import { createSupportCase, caseLabel, type SupportCase } from '@/lib/support';

const TOPICS = [
  { id: 'orders', label: 'An order' },
  { id: 'payments', label: 'Payment or payout' },
  { id: 'selling', label: 'Selling' },
  { id: 'account', label: 'My account' },
  { id: 'report', label: 'Report someone' },
  { id: 'other', label: 'Something else' },
] as const;

const MIN = 10;

export function CreateSupportCaseSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (c: SupportCase) => void;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const [topic, setTopic] = useState<string>('orders');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTopic('orders');
      setDescription('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const ok = description.trim().length >= MIN && !submitting;

  const submit = async () => {
    if (!ok) return;
    tap('medium');
    setSubmitting(true);
    setError(null);
    try {
      const c = await createSupportCase(description, topic);
      onCreated?.(c);
      onClose();
      toast.done(`Case ${caseLabel(c.case_number)} created`);
      router.push(`/conversation/${c.conversation_id}` as any);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create the support chat. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={() => (submitting ? undefined : onClose())}
      title="Create support chat"
      subtitle="Tell us what's wrong. You'll get a case number and our team will reply in the chat."
      autoHeight
      disableDrag={submitting}
    >
      <View style={{ paddingBottom: 8 }}>
        <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginBottom: 8 }}>
          What is it about?
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TOPICS.map((t) => {
            const active = topic === t.id;
            return (
              <Pressable
                key={t.id}
                testID={`support-topic-${t.id}`}
                onPress={() => {
                  tap('light');
                  setTopic(t.id);
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
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: typography.family.sansSemibold,
                    color: active ? theme.background : theme.ink,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginTop: 18, marginBottom: 8 }}>
          Describe the issue
        </Text>
        <TextInput
          testID="support-description"
          value={description}
          onChangeText={(t) => {
            setDescription(t.slice(0, 2000));
            if (error) setError(null);
          }}
          placeholder="e.g. My order #3271924 was marked delivered but I haven't received it."
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          accessibilityLabel="Describe the issue"
          multiline
          style={{
            minHeight: 110,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: error ? theme.danger : theme.border,
            backgroundColor: theme.panel,
            padding: 12,
            fontSize: 14.5,
            lineHeight: 20,
            color: theme.ink,
            fontFamily: typography.family.sans,
            textAlignVertical: 'top',
          }}
        />
        <Text style={{ fontSize: 12, color: error ? theme.danger : theme.mute, marginTop: 6, fontFamily: typography.family.sans }}>
          {error ?? (description.trim().length < MIN ? `At least ${MIN} characters` : 'Add order numbers or screenshots in the chat after.')}
        </Text>

        <Pressable
          testID="support-submit"
          onPress={submit}
          disabled={!ok}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 16,
            height: 48,
            borderRadius: 10,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !ok ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {submitting ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.background }}>
              Start support chat
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}
