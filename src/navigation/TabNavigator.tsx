import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens
import { HomeScreen } from '../screens/HomeScreen';
import { SendScreen } from '../screens/SendScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { CollectiblesScreen } from '../screens/CollectiblesScreen';
import { SwapScreen } from '../screens/SwapScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { BrowserScreen } from '../screens/BrowserScreen';

// Theme
import colors from '../theme/colors';

// Types
export type HomeStackParamList = {
  HomeMain: undefined;
  Send: undefined;
  Contacts: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  Collectibles: undefined;
  Swap: undefined;
  Activity: undefined;
  Browser: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

// Tab icon component
interface TabIconProps {
  icon: string;
  focused: boolean;
}

const TabIcon = ({ icon, focused }: TabIconProps) => (
  <View style={styles.iconContainer}>
    <Text style={[styles.icon, focused && styles.iconActive]}>{icon}</Text>
  </View>
);

// Home stack navigator (Home + Send modal + Contacts)
const HomeStackNavigator = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="HomeMain" component={HomeScreen} />
    <HomeStack.Screen
      name="Send"
      component={SendScreen}
      options={{
        presentation: 'modal',
      }}
    />
    <HomeStack.Screen
      name="Contacts"
      component={ContactsScreen}
      options={{
        presentation: 'modal',
      }}
    />
  </HomeStack.Navigator>
);

export const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Collectibles"
        component={CollectiblesScreen}
        options={{
          tabBarLabel: 'Collectibles',
          tabBarIcon: ({ focused }) => <TabIcon icon="⊞" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Swap"
        component={SwapScreen}
        options={{
          tabBarLabel: 'Swap',
          tabBarIcon: ({ focused }) => <TabIcon icon="🔄" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{
          tabBarLabel: 'Activity',
          tabBarIcon: ({ focused }) => <TabIcon icon="🕐" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Browser"
        component={BrowserScreen}
        options={{
          tabBarLabel: 'Browser',
          tabBarIcon: ({ focused }) => <TabIcon icon="🌐" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 85,
    paddingTop: 8,
    paddingBottom: 28,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  tabBarIcon: {
    marginTop: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    opacity: 0.6,
  },
  iconActive: {
    opacity: 1,
  },
});
