import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import type { PayoutKind, PayoutMethod } from '@/types';
import {
  WALLET_PROVIDERS,
  accountNumberError,
  accountTitleError,
  normalizeAccountNumber,
} from '@/lib/payoutDetails';
import {
  SheetModal,
  SheetField,
  SheetLabel,
  SheetChoice,
  SheetPrimary,
  SheetDestructive,
} from './Sheet';

export type PayoutForm = {
  kind: PayoutKind;
  provider: string;
  account_title: string;
  account_number: string;
};

const KINDS = ['bank', 'wallet'] as const satisfies readonly PayoutKind[];

export function PayoutSheet({
  visible,
  initial,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  initial: PayoutMethod | null;
  onClose: () => void;
  onSave: (form: PayoutForm) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const { theme } = useTheme();
  const [form, setForm] = useState<PayoutForm>({ kind: 'bank', provider: '', account_title: '', account_number: '' });
  const [saving, setSaving] = useState(false);
  // Settings loads the saved payout in the background; if it lands after the
  // sheet opened, fill the form from it, but never over what the user typed.
  const dirty = useRef(false);
  const edit = (patch: Partial<PayoutForm>) => {
    dirty.current = true;
    setForm((s) => ({ ...s, ...patch }));
  };

  useEffect(() => {
    if (!visible) dirty.current = false;
  }, [visible]);

  useEffect(() => {
    if (visible && !dirty.current) {
      setForm({
        kind: initial?.kind ?? 'bank',
        provider: initial?.provider ?? initial?.label ?? '',
        account_title: initial?.account_title ?? '',
        // Legacy rows only kept the last 4 digits: ask for the full number again.
        account_number: initial?.account_number ?? '',
      });
      setSaving(false);
    }
  }, [visible, initial]);

  const isBank = form.kind === 'bank';
  const providerOk = form.provider.trim().length >= 2;
  const titleErr = accountTitleError(form.account_title);
  const numberErr = accountNumberError(form.kind, form.account_number);
  const canSave = providerOk && !titleErr && !numberErr;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Payout method">
      <Text style={{ fontSize: 13, color: theme.textMuted, lineHeight: 19, marginBottom: 16 }}>
        Where we send your earnings after a buyer confirms delivery. The name must match the account,
        or the transfer can bounce. Only you and the Grabsty payouts team can see these details.
      </Text>

      <View style={{ marginBottom: 14 }}>
        <SheetLabel style={{ marginBottom: 8, marginLeft: 4 }}>Type</SheetLabel>
        <SheetChoice
          options={KINDS}
          value={form.kind}
          onChange={(kind) =>
            edit({ kind, provider: kind === 'wallet' ? WALLET_PROVIDERS[0] : '', account_number: '' })
          }
          renderLabel={(k) => (k === 'bank' ? 'Bank account' : 'Mobile wallet')}
          shape="block"
        />
      </View>

      {isBank ? (
        <SheetField
          label="Bank name"
          value={form.provider}
          placeholder="e.g. HBL, Meezan Bank, UBL"
          onChangeText={(t) => edit({ provider: t.slice(0, 60) })}
          error={!providerOk && form.provider.length > 0 ? 'Enter your bank name' : undefined}
        />
      ) : (
        <View style={{ marginBottom: 14 }}>
          <SheetLabel style={{ marginBottom: 8, marginLeft: 4 }}>Wallet</SheetLabel>
          <SheetChoice
            options={WALLET_PROVIDERS}
            value={(WALLET_PROVIDERS as readonly string[]).includes(form.provider) ? (form.provider as (typeof WALLET_PROVIDERS)[number]) : WALLET_PROVIDERS[0]}
            onChange={(provider) => edit({ provider })}
            renderLabel={(p) => p}
          />
        </View>
      )}

      <SheetField
        label="Account holder name"
        value={form.account_title}
        placeholder="As it appears on the account"
        onChangeText={(t) => edit({ account_title: t.slice(0, 80) })}
        error={titleErr && form.account_title.length > 0 ? titleErr : undefined}
      />
      <SheetField
        label={isBank ? 'IBAN or account number' : 'Wallet mobile number'}
        value={form.account_number}
        placeholder={isBank ? 'PK36SCBL0000001123456702' : '03XXXXXXXXX'}
        keyboardType={isBank ? 'default' : 'phone-pad'}
        onChangeText={(t) => edit({ account_number: t.slice(0, 34) })}
        error={numberErr && form.account_number.length > 0 ? numberErr : undefined}
      />

      <SheetPrimary
        label={saving ? 'Saving…' : initial ? 'Update payout' : 'Save payout'}
        loading={saving}
        disabled={!canSave || saving}
        onPress={async () => {
          if (!canSave) return;
          setSaving(true);
          try {
            await onSave({
              ...form,
              provider: form.provider.trim(),
              account_title: form.account_title.trim(),
              account_number: normalizeAccountNumber(form.account_number),
            });
          } finally {
            setSaving(false);
          }
        }}
      />
      {onRemove && (
        <SheetDestructive
          label="Remove payout method"
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await onRemove();
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </SheetModal>
  );
}
