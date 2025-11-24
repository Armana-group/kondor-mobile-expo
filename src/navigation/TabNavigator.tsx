import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

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

// Icon name type for Ionicons
type IoniconsName = keyof typeof Ionicons.glyphMap;

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
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Collectibles"
        component={CollectiblesScreen}
        options={{
          tabBarLabel: 'Collectibles',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Swap"
        component={SwapScreen}
        options={{
          tabBarLabel: 'Swap',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'swap-horizontal' : 'swap-horizontal-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{
          tabBarLabel: 'Activity',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Browser"
        component={BrowserScreen}
        options={{
          tabBarLabel: 'Browser',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'globe' : 'globe-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 0.5,
    height: 85,
    paddingTop: 8,
    paddingBottom: 28,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
});
