import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { CURATED_DAPPS, DApp } from '../constants/dapps';
import { AppsStackParamList } from '../navigation/TabNavigator';
import colors from '../theme/colors';

type NavigationProp = NativeStackNavigationProp<AppsStackParamList, 'AppsMain'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 20;
const GRID_GAP = 16;
const NUM_COLUMNS = 3;
const CARD_SIZE = (SCREEN_WIDTH - (GRID_PADDING * 2) - (GRID_GAP * (NUM_COLUMNS - 1))) / NUM_COLUMNS;

export const BrowserScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter apps based on search
  const filteredApps = CURATED_DAPPS.filter(app => {
    if (searchQuery === '') return true;
    return app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAppPress = (app: DApp) => {
    navigation.navigate('DAppWebView', { app });
  };

  const handleAddApp = () => {
    Alert.alert(
      'Add Custom App',
      'Custom app support coming soon!',
      [{ text: 'OK' }]
    );
  };

  const renderAppCard = (app: DApp) => (
    <TouchableOpacity
      key={app.id}
      style={styles.appCard}
      onPress={() => handleAppPress(app)}
      activeOpacity={0.7}
    >
      <View style={styles.appIconContainer}>
        <Image
          source={{ uri: app.icon }}
          style={styles.appIcon}
          defaultSource={require('../../assets/icon.png')}
        />
      </View>
      <Text style={styles.appName} numberOfLines={1}>
        {app.name}
      </Text>
    </TouchableOpacity>
  );

  const renderAddAppCard = () => (
    <TouchableOpacity
      style={[styles.appCard, styles.addAppCard]}
      onPress={handleAddApp}
      activeOpacity={0.7}
    >
      <View style={styles.addAppIconContainer}>
        <Ionicons name="add" size={32} color={colors.textTertiary} />
      </View>
      <Text style={styles.addAppText}>Add App</Text>
    </TouchableOpacity>
  );

  return (
    <Screen scroll={false}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Applications</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search applications"
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Apps Grid */}
        <View style={styles.gridContainer}>
          {filteredApps.map(app => renderAppCard(app))}
          {!searchQuery && renderAddAppCard()}
        </View>

        {filteredApps.length === 0 && searchQuery && (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No apps found</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: GRID_PADDING,
    marginVertical: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
    paddingBottom: 40,
  },
  appCard: {
    width: CARD_SIZE,
    height: CARD_SIZE + 24,
    backgroundColor: colors.card,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  addAppCard: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.elevated,
    borderStyle: 'dashed',
  },
  appIconContainer: {
    width: CARD_SIZE - 32,
    height: CARD_SIZE - 32,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  appIcon: {
    width: CARD_SIZE - 32,
    height: CARD_SIZE - 32,
    borderRadius: 16,
  },
  appName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  addAppIconContainer: {
    width: CARD_SIZE - 32,
    height: CARD_SIZE - 32,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAppText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textTertiary,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
});
