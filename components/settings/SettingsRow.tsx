import { View, Pressable, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';

export function SectionCard({
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const { theme, isDark } = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.panel,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: expanded ? theme.text : theme.border,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: expanded ? theme.accent : theme.panel,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
          }}
        >
          <Feather
            name={icon}
            size={18}
            color={expanded ? (theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF') : theme.text}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text, letterSpacing: -0.2 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: theme.panel,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={expanded ? 'minus' : 'plus'} size={14} color={theme.text} />
        </View>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 4,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

export function Row({
  label,
  desc,
  onPress,
  chevron,
  destructive,
  disabled,
  loading,
  badge,
}: {
  label: string;
  desc?: string;
  onPress?: () => void;
  chevron?: boolean;
  /** Irreversible actions only — paints the row in theme.danger. */
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
}) {
  const { theme } = useTheme();
  const tone = destructive ? theme.danger : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: tone }}>{label}</Text>
          {badge && (
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: theme.accent,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF',
                  letterSpacing: 0.4,
                }}
              >
                {badge.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {desc && <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{desc}</Text>}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={destructive ? theme.danger : theme.textMuted} />
      ) : chevron ? (
        <Feather name="chevron-right" size={16} color={destructive ? theme.danger : theme.textMuted} />
      ) : null}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  desc,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{label}</Text>
        {desc && <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap('light');
          onValueChange(v);
        }}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={theme.accent?.toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF'}
        ios_backgroundColor={theme.border}
      />
    </View>
  );
}

export function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHATGPT-INSPIRED SETTINGS PRIMITIVES (CLEAN, LAPTOP-FRIENDLY, MINIMALIST)
// ─────────────────────────────────────────────────────────────────────────────

export function ChatGPTRow({
  label,
  desc,
  children,
  destructive,
  disabled,
}: {
  label: string;
  desc?: string;
  children?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: destructive ? theme.danger : theme.text,
            letterSpacing: -0.1,
          }}
        >
          {label}
        </Text>
        {desc && (
          <Text
            style={{
              fontSize: 12,
              color: theme.textMuted,
              marginTop: 2,
              lineHeight: 17,
            }}
          >
            {desc}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>{children}</View>
    </View>
  );
}

export function ChatGPTButton({
  label,
  onPress,
  icon,
  destructive,
  disabled,
  loading,
  variant = 'default',
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Feather.glyphMap;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'ghost' | 'outline';
}) {
  const { theme, isDark } = useTheme();

  const textColor = destructive
    ? theme.danger
    : theme.text;
  const borderColor = destructive
    ? 'rgba(239, 68, 68, 0.4)'
    : theme.border;
  const bg = destructive
    ? (isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.05)')
    : variant === 'ghost'
      ? 'transparent'
      : theme.panel;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 34,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: variant === 'ghost' ? 0 : 1,
        borderColor,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && !disabled && !loading ? 0.96 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon && <Feather name={icon} size={14} color={textColor} />}
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: textColor,
              letterSpacing: -0.1,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function ChatGPTSwitchRow({
  label,
  desc,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <ChatGPTRow label={label} desc={desc} disabled={disabled}>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap('light');
          onValueChange(v);
        }}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={theme.accent?.toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF'}
        ios_backgroundColor={theme.border}
      />
    </ChatGPTRow>
  );
}

export function ChatGPTTabItem({
  icon,
  label,
  active,
  onPress,
  badge,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: string;
}) {
  const { theme, isDark } = useTheme();

  const activeBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const activeColor = theme.text;
  const inactiveColor = theme.textMuted;

  return (
    <Pressable
      onPress={() => {
        tap('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        height: 38,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: active ? activeBg : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        opacity: pressed ? 0.8 : 1,
        marginBottom: 2,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Feather name={icon} size={16} color={active ? activeColor : inactiveColor} />
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: active ? '600' : '500',
          color: active ? activeColor : inactiveColor,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      {badge && (
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 6,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: active ? activeColor : inactiveColor,
              letterSpacing: 0.3,
            }}
          >
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHATGPT MOBILE GROUPED CARD & ROW PRIMITIVES (MATCHING CHATGPT APP)
// ─────────────────────────────────────────────────────────────────────────────

export function ChatGPTGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { theme, isDark } = useTheme();

  return (
    <View style={{ marginBottom: 20 }}>
      {title && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: theme.textMuted,
            letterSpacing: 0.2,
            marginLeft: 12,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
      )}
      <View
        style={{
          backgroundColor: theme.panel,
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? '#262626' : 'rgba(0,0,0,0.08)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.04,
          shadowRadius: 3,
          elevation: 1,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function ChatGPTItem({
  icon,
  label,
  value,
  chevron = false,
  onPress,
  destructive = false,
  disabled = false,
  rightElement,
  isLast = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
}) {
  const { theme, isDark } = useTheme();
  const tone = destructive ? theme.danger : theme.text;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 50,
      }}
    >
      <View style={{ width: 28, alignItems: 'flex-start', marginRight: 10 }}>
        <Feather name={icon} size={18} color={tone} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: '500',
          color: tone,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>

      {value && (
        <Text
          style={{
            fontSize: 14,
            color: theme.textMuted,
            // Gap so a label that just fits ("Identity verification") wraps
            // instead of running into the value.
            marginLeft: 12,
            marginRight: chevron ? 6 : 0,
            maxWidth: 160,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}

      {rightElement}

      {chevron && (
        <Feather
          name="chevron-right"
          size={16}
          color={isDark ? '#555555' : '#C7C7CC'}
          style={{ marginLeft: 2 }}
        />
      )}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={() => {
            tap('light');
            onPress();
          }}
          disabled={disabled}
          accessibilityRole="button"
          style={({ pressed }) => ({
            opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
            backgroundColor: pressed
              ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)')
              : 'transparent',
          })}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}

      {!isLast && (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: isDark ? '#262626' : '#F0F0F0',
            marginLeft: 54,
          }}
        />
      )}
    </View>
  );
}
