import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { type SFSymbol } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';

type IconName = 'home' | 'plus' | 'trends' | 'person';

const ICONS: Record<IconName, { ios: SFSymbol; iosFilled: SFSymbol; android: keyof typeof Ionicons.glyphMap; androidFilled: keyof typeof Ionicons.glyphMap }> = {
  home:   { ios: 'house',        iosFilled: 'house.fill',        android: 'home-outline',         androidFilled: 'home' },
  plus:   { ios: 'plus.circle',  iosFilled: 'plus.circle.fill',  android: 'add-circle-outline',   androidFilled: 'add-circle' },
  trends: { ios: 'chart.line.uptrend.xyaxis', iosFilled: 'chart.line.uptrend.xyaxis', android: 'stats-chart-outline', androidFilled: 'stats-chart' },
  person: { ios: 'person.crop.circle', iosFilled: 'person.crop.circle.fill', android: 'person-circle-outline', androidFilled: 'person-circle' },
};

function TabIcon({ focused, icon }: { focused: boolean; icon: IconName }) {
  const color = focused ? THEME_COLORS.primary : THEME_COLORS.textTertiary;
  const set = ICONS[icon];

  return (
    <View style={[tabStyles.wrap, focused && tabStyles.wrapActive]}>
      <Icon
        ios={focused ? set.iosFilled : set.ios}
        android={focused ? set.androidFilled : set.android}
        size={22}
        color={color}
      />
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrap:       { alignItems: 'center', justifyContent: 'center', minWidth: 48, minHeight: 32, paddingHorizontal: 12, borderRadius: THEME_RADIUS.pill },
  wrapActive: { backgroundColor: THEME_COLORS.primaryTint },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   THEME_COLORS.primary,
        tabBarInactiveTintColor: THEME_COLORS.textTertiary,
        tabBarStyle: {
          backgroundColor: THEME_COLORS.surface,
          borderTopColor:  THEME_COLORS.border,
          borderTopWidth:  StyleSheet.hairlineWidth,
          paddingBottom:   6,
          paddingTop:      8,
          height:          84,
        },
        tabBarLabelStyle: {
          fontSize:   10,
          fontWeight: '500',
          marginTop:  2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="home" /> }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: 'Log', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="plus" /> }}
      />
      <Tabs.Screen
        name="trends"
        options={{ title: 'Trends', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="trends" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="person" /> }}
      />
    </Tabs>
  );
}
