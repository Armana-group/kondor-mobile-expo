import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

// Screens
import { HomeScreen } from '../screens/HomeScreen';
import { SendScreen } from '../screens/SendScreen';
import { ReceiveScreen } from '../screens/ReceiveScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TokenManagementScreen } from '../screens/TokenManagementScreen';
import { ConnectedSitesScreen } from '../screens/ConnectedSitesScreen';
import { CollectiblesScreen } from '../screens/CollectiblesScreen';
import { NFTDetailScreen } from '../screens/NFTDetailScreen';
import { SwapScreen } from '../screens/SwapScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { BrowserScreen } from '../screens/BrowserScreen';
import { TokenDetailScreen } from '../screens/TokenDetailScreen';
import { DAppWebViewScreen } from '../screens/DAppWebViewScreen';

// Theme
import colors from '../theme/colors';

// Stores
import { Token } from '../stores/tokenStore';
import { DApp } from '../constants/dapps';
import type { NFT } from '../lib/nftService';

// Types
export type HomeStackParamList = {
  HomeMain: undefined;
  Send: { token?: Token } | undefined;
  Receive: { token?: Token } | undefined;
  Activity: undefined;
  Contacts: undefined;
  Settings: undefined;
  TokenManagement: undefined;
  ConnectedSites: undefined;
  TokenDetail: { token: Token };
};

export type AppsStackParamList = {
  AppsMain: undefined;
  DAppWebView: { app: DApp };
};

export type CollectiblesStackParamList = {
  CollectiblesMain: undefined;
  NFTDetail: { nft: NFT };
};

export type TabParamList = {
  HomeTab: undefined;
  Collectibles: undefined;
  Swap: undefined;
  Apps: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const AppsStack = createNativeStackNavigator<AppsStackParamList>();
const CollectiblesStack = createNativeStackNavigator<CollectiblesStackParamList>();

// Icon name type for Ionicons
type IoniconsName = keyof typeof Ionicons.glyphMap;

// Home stack navigator (Home + Send modal + Receive modal + Activity + Contacts + Settings + TokenDetail)
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
      name="Receive"
      component={ReceiveScreen}
      options={{
        presentation: 'modal',
      }}
    />
    <HomeStack.Screen
      name="Activity"
      component={ActivityScreen}
    />
    <HomeStack.Screen
      name="Contacts"
      component={ContactsScreen}
      options={{
        presentation: 'modal',
      }}
    />
    <HomeStack.Screen
      name="Settings"
      component={SettingsScreen}
    />
    <HomeStack.Screen
      name="TokenManagement"
      component={TokenManagementScreen}
    />
    <HomeStack.Screen
      name="ConnectedSites"
      component={ConnectedSitesScreen}
    />
    <HomeStack.Screen
      name="TokenDetail"
      component={TokenDetailScreen}
    />
  </HomeStack.Navigator>
);

// Apps stack navigator (Apps gallery + WebView)
const AppsStackNavigator = () => (
  <AppsStack.Navigator screenOptions={{ headerShown: false }}>
    <AppsStack.Screen name="AppsMain" component={BrowserScreen} />
    <AppsStack.Screen
      name="DAppWebView"
      component={DAppWebViewScreen}
      options={{
        presentation: 'fullScreenModal',
        animation: 'slide_from_bottom',
      }}
    />
  </AppsStack.Navigator>
);

const CollectiblesStackNavigator = () => (
  <CollectiblesStack.Navigator screenOptions={{ headerShown: false }}>
    <CollectiblesStack.Screen name="CollectiblesMain" component={CollectiblesScreen} />
    <CollectiblesStack.Screen name="NFTDetail" component={NFTDetailScreen} />
  </CollectiblesStack.Navigator>
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
        component={CollectiblesStackNavigator}
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
        name="Apps"
        component={AppsStackNavigator}
        options={{
          tabBarLabel: 'Apps',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'apps' : 'apps-outline'} size={24} color={color} />
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
