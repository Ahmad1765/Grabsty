// Admin → Sellers & Users. Studio-style table: server-side search, filter,
// sortable columns and paging via admin_users_page
// (supabase/migrations/20261031030000_admin_users_page.sql).
import { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text, TextInput } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { getOptimizedImageUrl } from '@/lib/images';
import { timeAgo } from '@/components/product/shared';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';

type Sort = 'newest' | 'oldest' | 'active' | 'listings' | 'sales' | 'purchases' | 'offers';
type Filter = 'all' | 'sellers' | 'buyers' | 'verified' | 'admins';
type Row = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  last_active: string | null;
  is_verified: boolean | null;
  is_admin: boolean | null;
  listings: number;
  live_listings: number;
  sales: number;
  purchases: number;
  offers: number;
};

const PAGE = 50;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'buyers', label: 'Buyers' },
  { key: 'verified', label: 'Verified' },
  { key: 'admins', label: 'Admins' },
];
// Numeric columns: header click sorts high → low. "Joined" toggles newest/oldest.
const COLS: { key: Sort; label: string; width: number }[] = [
  { key: 'newest', label: 'Joined', width: 110 },
  { key: 'active', label: 'Last active', width: 120 },
  { key: 'listings', label: 'Listings', width: 90 },
  { key: 'sales', label: 'Sales', width: 80 },
  { key: 'purchases', label: 'Purchases', width: 95 },
  { key: 'offers', label: 'Offers made', width: 100 },
];
const USER_COL = 320;

function joined(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function AdminUsers() {
  const { theme } = useTheme();
  const narrow = useWindowDimensions().width < 760;
  const HScroll: React.ElementType = narrow ? View : ScrollView;
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce typing so every keystroke doesn't hit the database.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('admin_users_page', {
        p_search: query || null,
        p_filter: filter,
        p_sort: sort,
        p_limit: PAGE,
        p_offset: page * PAGE,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else {
          setError(null);
          setRows((data?.rows ?? []) as Row[]);
          setTotal(data?.total ?? 0);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, filter, sort, page]);

  const onSort = (key: Sort) => {
    setPage(0);
    setSort(key === 'newest' && sort === 'newest' ? 'oldest' : key);
  };

  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const muted = { fontSize: 12, color: theme.textMuted } as const;
  const cell = (width: number) => ({
    width,
    textAlign: 'right' as const,
    fontSize: 14,
    color: theme.text,
  });

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: '800',
          color: theme.text,
          letterSpacing: -0.4,
          marginBottom: 14,
        }}
      >
        Sellers & users
      </Text>

      {/* Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.panel,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 10,
            minHeight: 38,
            width: 320,
            maxWidth: '100%',
          }}
        >
          <Feather name="search" size={14} color={theme.textMuted} />
          <TextInput
            testID="admin-users-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, username, email or ID"
            placeholderTextColor={theme.textMuted}
            style={{
              flex: 1,
              marginLeft: 8,
              fontSize: 13,
              color: theme.text,
              paddingVertical: 6,
            }}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x" size={14} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                testID={`admin-users-filter-${f.key}`}
                onPress={() => {
                  setFilter(f.key);
                  setPage(0);
                }}
                style={({ pressed }) => ({
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  backgroundColor: active ? theme.ink : theme.surface,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: active ? theme.background : theme.text,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {loading && <ActivityIndicator size="small" color={theme.textMuted} />}
      </View>

      {narrow && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 12 }}
          contentContainerStyle={{ gap: 8, alignItems: 'center' }}
        >
          <Text style={muted}>Sort</Text>
          {COLS.map((c) => {
            const active = sort === c.key || (c.key === 'newest' && sort === 'oldest');
            return (
              <Pressable
                key={c.key}
                onPress={() => onSort(c.key)}
                style={({ pressed }) => ({
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: active ? theme.ink : theme.surface,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: active ? theme.background : theme.text,
                  }}
                >
                  {c.key === 'newest' ? (sort === 'oldest' ? 'Oldest' : 'Newest') : c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {error && <Text style={{ color: '#EF4444', fontSize: 13, marginBottom: 10 }}>Couldn&apos;t load users: {error}</Text>}

      {/* Table — scrolls sideways on narrow screens */}
      <View
        style={{
          flex: 1,
          backgroundColor: theme.panel,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          overflow: 'hidden',
        }}
      >
        {/* Phones get a plain column (stats inline); wider screens scroll sideways. */}
        <HScroll
          {...(narrow ? { style: { flex: 1 } } : { horizontal: true, showsHorizontalScrollIndicator: true, contentContainerStyle: { flexGrow: 1 } })}
        >
          <View
            style={{
              flex: 1,
              minWidth: narrow ? undefined : USER_COL + COLS.reduce((s, c) => s + c.width, 0) + 70,
            }}
          >
            {!narrow && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  height: 44,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <Text style={[muted, { flex: 1, minWidth: USER_COL, fontWeight: '600' }]}>User</Text>
                {COLS.map((c) => {
                  const active = sort === c.key || (c.key === 'newest' && sort === 'oldest');
                  return (
                    <Pressable
                      key={c.key}
                      testID={`admin-users-sort-${c.key}`}
                      onPress={() => onSort(c.key)}
                      style={{
                        width: c.width,
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {active && <Feather name={sort === 'oldest' ? 'arrow-up' : 'arrow-down'} size={12} color={theme.text} />}
                      <Text
                        style={[
                          muted,
                          {
                            fontWeight: active ? '700' : '600',
                            color: active ? theme.text : theme.textMuted,
                          },
                        ]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <View style={{ width: 54 }} />
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator>
              {!loading && rows.length === 0 && <Text style={{ padding: 16, ...muted }}>No users match.</Text>}
              {rows.map((u) => {
                const name = u.full_name || u.username || 'Unnamed';
                return (
                  <View
                    key={u.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        minWidth: narrow ? 0 : USER_COL,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: theme.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {u.avatar_url ? (
                          <Image
                            source={{
                              uri: getOptimizedImageUrl(u.avatar_url, {
                                width: 80,
                              }),
                            }}
                            style={{ width: 40, height: 40 }}
                            contentFit="cover"
                          />
                        ) : (
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: '800',
                              color: theme.text,
                            }}
                          >
                            {name.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '700',
                              color: theme.text,
                              flexShrink: 1,
                            }}
                            numberOfLines={1}
                          >
                            {name}
                          </Text>
                          {u.is_verified && <ShieldCheckIcon size={14} />}
                          {u.is_admin && (
                            <View
                              style={{
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                                borderRadius: 4,
                                backgroundColor: theme.surface,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: '800',
                                  color: theme.text,
                                }}
                              >
                                ADMIN
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={muted} numberOfLines={1}>
                          @{u.username}
                        </Text>
                        {u.email ? (
                          <Text style={muted} numberOfLines={1} selectable>
                            {u.email}
                          </Text>
                        ) : null}
                        {narrow && (
                          <Text style={[muted, { marginTop: 4, color: theme.text }]}>
                            {`Joined ${joined(u.created_at)} · Active ${u.last_active ? timeAgo(u.last_active) : '—'}
${u.listings} listings (${u.live_listings} live) · ${u.sales} sales · ${u.purchases} bought · ${u.offers} offers`}
                          </Text>
                        )}
                      </View>
                    </View>
                    {!narrow && (
                      <>
                        <Text style={cell(110)}>{joined(u.created_at)}</Text>
                        <Text style={cell(120)}>{u.last_active ? timeAgo(u.last_active) : '—'}</Text>
                        <Text style={cell(90)}>
                          {u.listings}
                          {u.listings ? <Text style={muted}> ({u.live_listings} live)</Text> : null}
                        </Text>
                        <Text style={cell(80)}>{u.sales}</Text>
                        <Text style={cell(95)}>{u.purchases}</Text>
                        <Text style={cell(100)}>{u.offers}</Text>
                      </>
                    )}
                    <View style={{ width: 54, alignItems: 'flex-end' }}>
                      <Pressable
                        onPress={() => router.push(`/user/${u.id}` as any)}
                        style={({ pressed }) => ({
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: theme.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Feather name="external-link" size={14} color={theme.text} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </HScroll>

        {/* Pager */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            paddingHorizontal: 16,
            height: 48,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          <Text style={muted}>{`${from}–${to} of ${total}`}</Text>
          {[
            {
              icon: 'chevron-left' as const,
              disabled: page === 0,
              go: () => setPage((p) => p - 1),
              id: 'prev',
            },
            {
              icon: 'chevron-right' as const,
              disabled: to >= total,
              go: () => setPage((p) => p + 1),
              id: 'next',
            },
          ].map((b) => (
            <Pressable
              key={b.id}
              testID={`admin-users-page-${b.id}`}
              disabled={b.disabled}
              onPress={b.go}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: b.disabled ? 0.3 : pressed ? 0.7 : 1,
              })}
            >
              <Feather name={b.icon} size={18} color={theme.text} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
