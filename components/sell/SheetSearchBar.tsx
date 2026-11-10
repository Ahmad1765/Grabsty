// The one search bar used by the Sell picker sheets (Category, Brand), so both
// look and behave the same: Paper White pill with a hairline border, search
// icon, clear button, no autocorrect, keyboard "search" key. Never autofocuses:
// opening a sheet shows the list first, and the keyboard only when tapped.

import { forwardRef } from 'react';
import { View, Pressable, StyleSheet, type TextInput as RNTextInput } from 'react-native';
import { TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { radii } from '@/lib/theme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  testID?: string;
};

export const SheetSearchBar = forwardRef<RNTextInput, Props>(function SheetSearchBar(
  { value, onChangeText, placeholder, testID },
  ref,
) {
  const { theme } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 44,
          paddingHorizontal: 14,
          borderRadius: radii.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          backgroundColor: theme.panel,
        }}
      >
        <Feather name="search" size={16} color={theme.mute} />
        <TextInput
          ref={ref as any}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.muteSoft ?? theme.mute}
          accessibilityLabel={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          style={
            {
              flex: 1,
              minWidth: 0,
              fontSize: 14.5,
              color: theme.ink,
              padding: 0,
              outlineStyle: 'none',
            } as any
          }
        />
        {value.length > 0 ? (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Feather name="x" size={16} color={theme.mute} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
