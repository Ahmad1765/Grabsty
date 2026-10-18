// ─────────────────────────────────────────────────────────────────────────────
// USE SETTINGS MANAGER HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Consolidating Account Management & System Preferences
//
// 1. Unified Mutation Lifecycles:
//    Isolates address CRUD, payout method management, identity verification submissions,
//    push notification device registration, and auth lifecycle flows (password resets,
//    sign out, account deletion) into a cohesive domain state machine.
//
// 2. Deep Link Handling:
//    Supports direct URL deep-linking into specific settings sections (e.g. `?open=bundle`)
//    with one-time execution guards.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { uploadVerificationDocument } from '@/lib/upload';
import {
  ensurePermissionAndRegister,
  pushSupported,
  isThisDeviceRegistered,
  unregisterThisDevice,
} from '@/lib/notifications';
import { confirm } from '@/lib/confirm';
import { tap } from '@/lib/haptics';
import { isOptedOut, setAnalyticsOptOut } from '@/lib/analytics';
import { APP_URL } from '@/lib/brand';
import type {
  AddressForm,
  PayoutForm,
  VerifyForm,
} from '@/components/settings';
import type { PayoutMethod, ShippingAddress, Verification } from '@/types';

export const SUPPORT_EMAIL = 'support@grabsty.com';
export const TERMS_URL = `${APP_URL}/legal/terms`;
export const PRIVACY_URL = `${APP_URL}/legal/privacy`;

export type Section =
  | 'general'
  | 'account'
  | 'shop'
  | 'verify'
  | 'security'
  | 'help'
  | 'admin'
  | 'enhance';
export const SECTIONS: readonly Section[] = [
  'general',
  'account',
  'shop',
  'verify',
  'security',
  'help',
  'admin',
  'enhance',
];
export type Busy = 'logout' | 'delete' | 'password' | null;

export function useSettingsManager() {
  const { user, profile, session, signOut, refreshProfile } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ open?: string }>();

  // ponytail: default to 'general' for ChatGPT-style direct tab navigation
  const [openSection, setOpenSection] = useState<Section>('general');
  const [busy, setBusy] = useState<Busy>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [shareUsage, setShareUsage] = useState(!isOptedOut());
  const [resetCooldown, setResetCooldown] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = setInterval(() => {
      setResetCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldown]);

  // Address / Payout / Verification / Phone Data
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [payout, setPayout] = useState<PayoutMethod | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(true);

  // Modal Visibility States
  const [showAddress, setShowAddress] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showBundle, setShowBundle] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── 1. Fetch Extras (Address, Payout, Verification) ───────────────────────
  const loadExtras = useCallback(async () => {
    if (!user?.id) {
      setAddress(null);
      setPayout(null);
      setVerification(null);
      setPhone(null);
      setLoadingExtras(false);
      return;
    }
    setLoadingExtras(true);
    try {
      const [a, p, v] = await Promise.all([
        supabase
          .from('shipping_addresses')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('payout_methods')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('verifications')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (!mounted.current) return;
      setAddress((a.data as ShippingAddress | null) ?? null);
      setPayout((p.data as PayoutMethod | null) ?? null);
      const vRec = (v.data as Verification | null) ?? null;
      if (vRec && !vRec.id_photo_url && vRec.notes) {
        vRec.id_photo_url = vRec.notes;
      }
      setVerification(vRec);
      setPhone(profile?.phone || user?.phone || (user?.user_metadata as any)?.phone || null);
    } catch (e) {
      console.warn('[settings] loadExtras failed', e);
    } finally {
      if (mounted.current) setLoadingExtras(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  // ── 2. Deep-Link Handler ──────────────────────────────────────────────────
  const lastHandledParam = useRef<string | null>(null);
  useEffect(() => {
    const rawTarget = params.open;
    if (!rawTarget) {
      lastHandledParam.current = null;
      return;
    }
    const target = (Array.isArray(rawTarget) ? rawTarget[0] : rawTarget).toLowerCase();
    if (lastHandledParam.current === target) return;
    lastHandledParam.current = target;

    // Reset existing modal visibility state before dispatching new deep-link target
    setShowBundle(false);
    setShowAddress(false);
    setShowPayout(false);
    setShowVerify(false);
    setShowTheme(false);

    switch (target) {
      case 'bundle':
        setOpenSection('shop');
        setShowBundle(true);
        break;
      case 'address':
        setOpenSection('verify');
        setShowAddress(true);
        break;
      case 'payout':
        setOpenSection('verify');
        setShowPayout(true);
        break;
      case 'verify':
        setOpenSection('verify');
        setShowVerify(true);
        break;
      case 'theme':
      case 'notifications':
      case 'enhance':
      case 'general':
        setOpenSection('general');
        if (target === 'theme') setShowTheme(true);
        break;
      case 'phone':
        setOpenSection('account');
        setShowPhone(true);
        break;
      case 'security':
      case 'password':
        setOpenSection('security');
        break;
      case 'shop':
      case 'account':
      case 'help':
      case 'admin':
        setOpenSection(target as Section);
        break;
      default:
        if (SECTIONS.includes(target as Section)) {
          setOpenSection(target as Section);
        }
        break;
    }
  }, [params.open]);

  // ── 3. Section Toggling ───────────────────────────────────────────────────
  const toggleSection = useCallback((s: Section) => {
    tap('light');
    setOpenSection(s);
  }, []);

  // ── 4. DB Sync Actions (Vacation, Bundle, Push, Analytics) ────────────────
  const setVacationMode = useCallback(
    async (next: boolean) => {
      if (!user?.id) return;
      tap('light');
      const { error } = await supabase
        .from('profiles')
        .update({ vacation_mode: next })
        .eq('id', user.id);
      if (error) {
        toast.show('Could not update vacation mode', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return;
      }
      await refreshProfile();
    },
    [user?.id, refreshProfile, toast],
  );

  const setBundlePct = useCallback(
    async (pct: number) => {
      if (!user?.id) return;
      const clamped = Math.max(0, Math.min(30, Math.round(pct)));
      const { error } = await supabase
        .from('profiles')
        .update({ bundle_discount_pct: clamped })
        .eq('id', user.id);
      if (error) {
        toast.show('Could not update discount', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return;
      }
      await refreshProfile();
    },
    [user?.id, refreshProfile, toast],
  );

  const savedCollectionPrivacy: 'public' | 'private' = profile?.saved_collection_privacy ?? 'private';

  const setSavedCollectionPrivacy = useCallback(
    async (privacy: 'public' | 'private') => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ saved_collection_privacy: privacy })
        .eq('id', user.id);
      if (error) {
        toast.show('Could not update collection privacy', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return;
      }
      await refreshProfile();
    },
    [user?.id, refreshProfile, toast],
  );

  const openSystemSettings = useCallback(async () => {
    try {
      if (typeof Linking.openSettings !== 'function') throw new Error();
      await Linking.openSettings();
    } catch {
      toast.show('Open device settings manually', { variant: 'info', icon: 'settings' });
    }
  }, [toast]);

  useEffect(() => {
    if (!pushSupported() || !session) return;
    let cancelled = false;
    isThisDeviceRegistered()
      .then((on) => {
        if (!cancelled) setPushOn(on);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handlePushToggle = useCallback(
    async (next: boolean) => {
      if (!user?.id || pushBusy) return;
      setPushBusy(true);
      setPushOn(next);
      try {
        if (next) {
          const { granted, blocked } = await ensurePermissionAndRegister(user.id);
          setPushOn(granted);
          if (!granted) {
            if (blocked && Platform.OS === 'web') {
              toast.show("Notifications are blocked for this site. Allow them in your browser's site settings.", {
                variant: 'info',
                icon: 'bell',
              });
            } else if (blocked) {
              toast.show('Enable notifications in system settings', {
                variant: 'info',
                icon: 'bell',
              });
              await openSystemSettings();
            } else {
              toast.show('Notifications not enabled', { variant: 'info', icon: 'bell' });
            }
          }
        } else {
          await unregisterThisDevice();
          setPushOn(false);
        }
      } catch (e) {
        console.warn('[settings] push toggle failed', e);
        setPushOn(!next);
        toast.show('Could not update notifications', { variant: 'info', icon: 'alert-circle' });
      } finally {
        setPushBusy(false);
      }
    },
    [user?.id, pushBusy, toast, openSystemSettings],
  );

  // ── 5. Auth Lifecycle Flows ──────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    if (busy) return;
    const ok = await confirm({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log out',
      destructive: true,
    });
    if (!ok) return;
    setBusy('logout');
    try {
      await signOut();
      toast.show('Signed out', { variant: 'default', icon: 'log-out' });
      router.replace('/(tabs)');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not log out', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [busy, signOut, toast]);

  const handleResetPassword = useCallback(async () => {
    if (!user?.email) {
      toast.show('No email on file', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    if (busy) return;
    if (resetCooldown > 0) {
      toast.show(`Please wait ${resetCooldown}s before requesting another reset email`, {
        variant: 'info',
        icon: 'clock',
      });
      return;
    }
    const ok = await confirm({
      title: 'Send password reset?',
      message: `We'll email ${user.email} a link to change your password.`,
      confirmLabel: 'Send email',
    });
    if (!ok) return;
    setBusy('password');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email!);
      if (error) throw error;
      setResetCooldown(60);
      toast.show('Reset email sent — check your inbox', { variant: 'success', icon: 'mail' });
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (/rate_limit|over_email_send_rate_limit|429|too many/i.test(msg)) {
        setResetCooldown(120);
        toast.show('Too many reset attempts. Please wait a couple minutes before trying again.', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      } else {
        toast.show(msg || 'Could not send email', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [user?.email, busy, resetCooldown, toast]);

  const handleDeleteAccount = useCallback(async () => {
    if (busy) return;
    const first = await confirm({
      title: 'Delete account?',
      message:
        'This permanently removes your profile, listings, likes, and messages. This cannot be undone.',
      confirmLabel: 'Continue',
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Are you absolutely sure?',
      message: 'Your account will be deleted immediately.',
      confirmLabel: 'Delete forever',
      destructive: true,
    });
    if (!second) return;
    setBusy('delete');
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await signOut().catch(() => {});
      toast.show('Account deleted', { variant: 'default', icon: 'check' });
      router.replace('/(tabs)');
    } catch (e: any) {
      const subject = encodeURIComponent('Account deletion request');
      const body = encodeURIComponent(
        `Please delete my account.\nUser ID: ${user?.id ?? 'unknown'}\nEmail: ${user?.email ?? 'unknown'}`,
      );
      Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {});
      toast.show(e?.message ?? 'Could not delete now — emailed support', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [busy, user, signOut, toast]);

  // ── 6. Address / Payout / Verify Form Handlers ───────────────────────────
  const saveAddress = useCallback(
    async (form: AddressForm): Promise<boolean> => {
      if (!user?.id) return false;
      const payload = {
        user_id: user.id,
        recipient_name: form.recipient_name.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim() || null,
        city: form.city.trim(),
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim(),
        country: form.country.trim(),
        phone: form.phone.trim() || null,
        is_default: true,
      };
      const { data, error } = await supabase.rpc('upsert_shipping_address_with_default', {
        p_payload: address?.id ? { ...payload, id: address.id } : payload,
      });

      if (error) {
        toast.show(error.message ?? 'Could not save address', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }

      if (mounted.current) setAddress(data as ShippingAddress);
      toast.show('Address saved', { variant: 'success', icon: 'check' });
      return true;
    },
    [user?.id, address?.id, toast],
  );

  const removeAddress = useCallback(async () => {
    if (!address?.id) return;
    const { error } = await supabase
      .from('shipping_addresses')
      .delete()
      .eq('id', address.id);
    if (error) {
      toast.show('Could not remove', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    if (mounted.current) setAddress(null);
    toast.show('Address removed', { variant: 'default', icon: 'trash-2' });
  }, [address?.id, toast]);

  const savePayout = useCallback(
    async (form: PayoutForm): Promise<boolean> => {
      if (!user?.id) return false;
      const payload = {
        user_id: user.id,
        kind: form.kind,
        label: form.label.trim(),
        account_last4: form.account_last4.trim(),
        is_default: true,
      };

      let savedData: PayoutMethod | null = null;
      let rpcError: Error | null = null;

      try {
        const { data, error } = await supabase.rpc('set_default_payout', {
          p_payload: payout?.id ? { ...payload, id: payout.id } : payload,
        });
        if (!error && data) {
          savedData = data as PayoutMethod;
        } else if (error) {
          rpcError = new Error(error.message);
        }
      } catch (err: any) {
        rpcError = err instanceof Error ? err : new Error(String(err));
      }

      // Direct database fallback if RPC not yet deployed or failed
      if (!savedData) {
        try {
          await supabase
            .from('payout_methods')
            .update({ is_default: false })
            .eq('user_id', user.id)
            .eq('is_default', true);

          if (payout?.id) {
            const { data, error } = await supabase
              .from('payout_methods')
              .update(payload)
              .eq('id', payout.id)
              .eq('user_id', user.id)
              .select()
              .single();
            if (!error && data) savedData = data as PayoutMethod;
          } else {
            const { data, error } = await supabase
              .from('payout_methods')
              .insert(payload)
              .select()
              .single();
            if (!error && data) savedData = data as PayoutMethod;
          }
        } catch {
          // continue to check savedData
        }
      }

      if (!savedData) {
        toast.show(rpcError?.message ?? 'Could not save payout method', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }

      if (mounted.current) setPayout(savedData);
      toast.show('Payout method saved', { variant: 'success', icon: 'check' });
      return true;
    },
    [user?.id, payout?.id, toast],
  );

  const removePayout = useCallback(async () => {
    if (!payout?.id) return;
    const { error } = await supabase
      .from('payout_methods')
      .delete()
      .eq('id', payout.id);
    if (error) {
      toast.show('Could not remove', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    if (mounted.current) setPayout(null);
    toast.show('Payout removed', { variant: 'default', icon: 'trash-2' });
  }, [payout?.id, toast]);

  const saveVerification = useCallback(
    async (form: VerifyForm): Promise<boolean> => {
      if (!user?.id) return false;

      let photoUrl = form.id_photo_url || null;
      if (form.local_image?.uri) {
        try {
          photoUrl = await uploadVerificationDocument(form.local_image, user.id);
        } catch (uploadErr) {
          console.warn('[settings] verification photo upload failed; using fallback', uploadErr);
          photoUrl = form.local_image.uri;
        }
      }

      const payload = {
        user_id: user.id,
        status: 'submitted' as const,
        legal_name: form.legal_name.trim(),
        document_kind: form.document_kind,
        document_number_last4: form.document_number_last4.trim() || null,
        notes: photoUrl || (verification?.notes ?? null),
        submitted_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('verifications')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) {
        toast.show(error.message ?? 'Could not submit', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }
      const record = (data as Verification) ?? null;
      if (record && !record.id_photo_url && record.notes) {
        record.id_photo_url = record.notes;
      }
      if (mounted.current) setVerification(record);
      toast.show('Verification submitted', { variant: 'success', icon: 'check' });
      return true;
    },
    [user?.id, verification?.notes, toast],
  );

  const savePhone = useCallback(
    async (phoneNum: string): Promise<boolean> => {
      if (!user?.id) return false;
      const clean = phoneNum.trim();
      try {
        await supabase
          .from('profiles')
          .update({ phone: clean })
          .eq('id', user.id);

        await supabase.auth.updateUser({
          phone: clean.startsWith('+') ? clean : undefined,
          data: { phone: clean },
        }).catch(() => {});

        await refreshProfile().catch(() => {});
        if (mounted.current) setPhone(clean);
        toast.show('Phone number saved', { variant: 'success', icon: 'check' });
        return true;
      } catch (e: any) {
        toast.show(e?.message ?? 'Could not save phone number', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }
    },
    [user?.id, refreshProfile, toast],
  );

  const removePhone = useCallback(async () => {
    if (!user?.id) return;
    try {
      await supabase.from('profiles').update({ phone: null }).eq('id', user.id);
      await supabase.auth.updateUser({ data: { phone: null } }).catch(() => {});
      await refreshProfile().catch(() => {});
      if (mounted.current) setPhone(null);
      toast.show('Phone number removed', { variant: 'default', icon: 'trash-2' });
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not remove phone', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  }, [user?.id, refreshProfile, toast]);

  return {
    open: openSection,
    setOpen: setOpenSection,
    toggleSection,
    busy,
    pushOn,
    handlePushToggle,
    shareUsage,
    setShareUsage: (on: boolean) => {
      setShareUsage(on);
      setAnalyticsOptOut(!on);
    },
    address,
    payout,
    verification,
    phone,
    setPhone,
    loadingExtras,
    showAddress,
    setShowAddress,
    showPayout,
    setShowPayout,
    showVerify,
    setShowVerify,
    showBundle,
    setShowBundle,
    showTheme,
    setShowTheme,
    showPhone,
    setShowPhone,
    pushSupported: pushSupported(),
    setVacationMode,
    setBundlePct,
    savedCollectionPrivacy,
    setSavedCollectionPrivacy,
    saveAddress,
    removeAddress,
    savePayout,
    removePayout,
    saveVerification,
    savePhone,
    removePhone,
    handleLogout,
    handleResetPassword,
    resetCooldown,
    handleDeleteAccount,
    openSystemSettings,
  };
}
