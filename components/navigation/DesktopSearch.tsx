import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router, usePathname, useGlobalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Text, TextInput } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { getSearchSuggestions, type SuggestionHighlightPart } from '@/lib/searchSuggestions';
import { CATEGORIES } from '@/lib/categories';
import { type as typography } from '@/lib/theme';

// Desktop header search. On a phone, search is a full-screen view with its
// own field (components/home/HomeSearchView). On desktop you type here, in
// place: a panel drops down with recent searches, live suggestions and the
// category index, and Enter opens results on home (HomeSearchView, which
// then shows no second field). Keyboard: "/" focuses, arrows move, Enter
// picks, Escape closes.

// Same list the phone search landing shows.
const POPULAR = ['Vintage', 'Sneakers', 'Jackets', 'Dresses', 'Hoodies', 'Jewelry', 'Bags', 'Denim'];

let activeInput: { focus: () => void } | null = null;
/** Focus the header search (used for "/" and bare `?searchOpen=1` links). */
export function focusDesktopSearch() {
  activeInput?.focus();
}

type Action =
  | {
      kind: 'term';
      term: string;
      parts?: SuggestionHighlightPart[];
      recent?: boolean;
    }
  | { kind: 'members'; term: string }
  | {
      kind: 'category';
      id: string;
      label: string;
      detail: string;
      query?: string;
    };

type HoverState = { pressed: boolean; hovered?: boolean };

export function runSearch(term: string, tab: 'listings' | 'seller' = 'listings') {
  const q = encodeURIComponent(term.trim());
  router.navigate(`/?searchOpen=1&searchQuery=${q}${tab === 'seller' ? '&searchTab=seller' : ''}` as any);
}

function openCategory(id: string, query?: string) {
  router.navigate(
    `/?searchOpen=1&searchCategory=${id}${query ? `&searchQuery=${encodeURIComponent(query)}` : ''}` as any,
  );
}

export function DesktopSearch() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ searchQuery?: string }>();
  const { historyItems, addSearch, removeSearch, clearAll } = useSearchHistory();

  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<any>(null);
  const rootRef = useRef<View>(null);

  // The field mirrors the query of the results on screen, and empties when
  // those results close.
  const shownQuery = pathname === '/' ? (params.searchQuery ?? '') : '';
  useEffect(() => {
    setValue(shownQuery);
  }, [shownQuery]);

  useEffect(() => {
    const handle = { focus: () => inputRef.current?.focus?.() };
    activeInput = handle;
    return () => {
      if (activeInput === handle) activeInput = null;
    };
  }, []);

  // "/" from anywhere that isn't already a text field.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close when a click or focus lands outside the field and its panel.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onOutside = (e: Event) => {
      const root = rootRef.current as unknown as HTMLElement | null;
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [open]);

  const q = value.trim();
  const recent = historyItems.slice(0, 5);

  const actions = useMemo<Action[]>(() => {
    if (!q)
      return recent.map((r) => ({
        kind: 'term' as const,
        term: r.term,
        recent: true,
      }));
    const lower = q.toLowerCase();
    const terms: Action[] = getSearchSuggestions(q, {
      recentSearches: historyItems.map((h) => h.term),
      limit: 6,
    }).map((s) => ({
      kind: 'term' as const,
      term: s.text,
      parts: s.parts,
      recent: s.isRecent,
    }));
    if (!terms.some((t) => t.kind === 'term' && t.term.toLowerCase() === lower)) {
      terms.unshift({ kind: 'term', term: q });
    }
    const cats: Action[] = [];
    for (const c of CATEGORIES) {
      if (c.label.toLowerCase().includes(lower)) {
        cats.push({
          kind: 'category',
          id: c.id,
          label: c.label,
          detail: 'Category',
        });
      }
      for (const sub of c.subs) {
        if (sub.label.toLowerCase().includes(lower) || sub.kw?.some((k) => k.startsWith(lower))) {
          cats.push({
            kind: 'category',
            id: c.id,
            label: sub.label,
            detail: `in ${c.label}`,
            query: sub.kw?.[0] ?? sub.label,
          });
        }
      }
    }
    return [...terms, ...cats.slice(0, 4), { kind: 'members', term: q }];
  }, [q, recent, historyItems]);

  useEffect(() => setHighlight(-1), [q, open]);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur?.();
  };

  const run = (a: Action) => {
    close();
    if (a.kind === 'category') return openCategory(a.id, a.query);
    addSearch(a.term, a.kind === 'members' ? 'seller' : 'listings');
    setValue(a.term);
    runSearch(a.term, a.kind === 'members' ? 'seller' : 'listings');
  };

  const submit = () => {
    if (highlight >= 0 && actions[highlight]) return run(actions[highlight]);
    if (q) run({ kind: 'term', term: q });
  };

  const onKeyPress = (e: any) => {
    const key = e?.nativeEvent?.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault?.();
      if (!open) setOpen(true);
      const n = actions.length;
      if (!n) return;
      setHighlight((h) => (key === 'ArrowDown' ? (h + 1) % n : h <= 0 ? n - 1 : h - 1));
    } else if (key === 'Escape') {
      close();
    }
  };

  return (
    <View ref={rootRef} style={{ flex: 1, maxWidth: 640, zIndex: 50 }}>
      <View
        style={{
          height: 40,
          borderRadius: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 16,
          paddingRight: 8,
          backgroundColor: open ? theme.background : theme.surface,
          borderWidth: 1,
          borderColor: open ? theme.ink : 'transparent',
        }}
      >
        <Feather name="search" size={16} color={theme.mute} />
        <TextInput
          ref={inputRef}
          testID="topnav-search"
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyPress={onKeyPress}
          onSubmitEditing={submit}
          placeholder="Search for items, brands or members"
          placeholderTextColor={theme.mute}
          accessibilityLabel="Search for items"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={
            {
              flex: 1,
              minWidth: 0,
              height: 38,
              fontFamily: typography.family.sans,
              fontSize: 14,
              color: theme.ink,
              outlineStyle: 'none',
            } as any
          }
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => {
              setValue('');
              inputRef.current?.focus?.();
            }}
            style={(s: HoverState) => ({
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: s.hovered ? theme.surface : 'transparent',
            })}
          >
            <Feather name="x" size={15} color={theme.mute} />
          </Pressable>
        ) : !open ? (
          // Keyboard hint, the way desktop tools advertise their search key.
          <View
            style={{
              minWidth: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 4,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.mute }}>/</Text>
          </View>
        ) : null}
      </View>

      {open && (
        <View
          style={
            {
              position: 'absolute',
              top: 46,
              left: 0,
              right: 0,
              minWidth: 520,
              backgroundColor: theme.background,
              borderRadius: 16,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingVertical: 8,
              boxShadow: '0 12px 32px rgba(15, 15, 15, 0.12)',
            } as any
          }
        >
          {q ? (
            actions.map((a, i) => (
              <ActionRow
                key={`${a.kind}-${i}`}
                action={a}
                highlighted={i === highlight}
                onPress={() => run(a)}
                onHover={() => setHighlight(i)}
              />
            ))
          ) : (
            <>
              {recent.length > 0 && (
                <>
                  <PanelHeading title="Recent searches" action={{ label: 'Clear', onPress: clearAll }} />
                  {actions.map((a, i) => (
                    <ActionRow
                      key={`recent-${i}`}
                      action={a}
                      highlighted={i === highlight}
                      onPress={() => run(a)}
                      onHover={() => setHighlight(i)}
                      onRemove={a.kind === 'term' ? () => removeSearch(a.term) : undefined}
                    />
                  ))}
                </>
              )}

              <PanelHeading title="Browse categories" />
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: 8,
                }}
              >
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${c.label}`}
                    onPress={() => {
                      close();
                      openCategory(c.id);
                    }}
                    style={(s: HoverState) => ({
                      width: '50%',
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      borderRadius: 10,
                      backgroundColor: s.hovered ? theme.surface : 'transparent',
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: theme.ink,
                      }}
                    >
                      {c.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        color: theme.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {c.subs
                        .slice(0, 3)
                        .map((sub) => sub.label)
                        .join(', ')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <PanelHeading title="Popular" />
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  paddingHorizontal: 18,
                  paddingBottom: 8,
                }}
              >
                {POPULAR.map((term) => (
                  <Pressable
                    key={term}
                    accessibilityRole="button"
                    onPress={() => run({ kind: 'term', term })}
                    style={(s: HoverState) => ({
                      height: 30,
                      paddingHorizontal: 14,
                      borderRadius: 15,
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: s.hovered ? theme.ink : theme.border,
                      backgroundColor: theme.panel,
                    })}
                  >
                    <Text style={{ fontSize: 13, color: theme.ink }}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function PanelHeading({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 6,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: theme.textMuted,
        }}
      >
        {title}
      </Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress}>
          {(s: HoverState) => (
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: theme.ink,
                textDecorationLine: s.hovered ? 'underline' : 'none',
              }}
            >
              {action.label}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function ActionRow({
  action,
  highlighted,
  onPress,
  onHover,
  onRemove,
}: {
  action: Action;
  highlighted: boolean;
  onPress: () => void;
  onHover: () => void;
  onRemove?: () => void;
}) {
  const { theme } = useTheme();
  const icon =
    action.kind === 'members'
      ? 'user'
      : action.kind === 'category'
        ? 'grid'
        : action.recent
          ? 'clock'
          : 'search';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onHoverIn={onHover}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: 40,
        marginHorizontal: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: highlighted ? theme.surface : 'transparent',
      }}
    >
      <Feather name={icon} size={15} color={theme.mute} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: theme.ink }}>
        {action.kind === 'members' ? (
          <>
            Search members for <Text style={{ fontWeight: '700' }}>{action.term}</Text>
          </>
        ) : action.kind === 'category' ? (
          <>
            <Text style={{ fontWeight: '600' }}>{action.label}</Text>
            <Text style={{ color: theme.textMuted }}>{`  ${action.detail}`}</Text>
          </>
        ) : action.parts ? (
          // Typed text regular, the completion bold.
          action.parts.map((p, i) => (
            <Text key={i} style={{ fontWeight: p.isMatch ? '400' : '700' }}>
              {p.text}
            </Text>
          ))
        ) : (
          action.term
        )}
      </Text>
      {onRemove && highlighted && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${action.kind === 'term' ? action.term : ''} from recent searches`}
          onPress={onRemove}
          hitSlop={6}
        >
          <Feather name="x" size={14} color={theme.mute} />
        </Pressable>
      )}
    </Pressable>
  );
}
