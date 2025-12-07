import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { CURATED_DAPPS, DAPP_CATEGORIES, DApp, getFeaturedDApps } from '../constants/dapps';
import colors from '../theme/colors';

export const BrowserScreen = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const featuredApps = getFeaturedDApps();

  // Filter apps based on search and category
  const filteredApps = CURATED_DAPPS.filter(app => {
    const matchesSearch = searchQuery === '' ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAppPress = (app: DApp) => {
    Alert.alert(
      app.name,
      `Open ${app.name} in browser?\n\nNote: In-app browser with wallet connection coming soon!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open in Browser',
          onPress: () => Linking.openURL(app.url)
        },
      ]
    );
  };

  const renderAppCard = (app: DApp, size: 'large' | 'small' = 'small') => (
    <TouchableOpacity
      key={app.id}
      style={[styles.appCard, size === 'large' && styles.appCardLarge]}
      onPress={() => handleAppPress(app)}
      activeOpacity={0.7}
    >
      <View style={[styles.appIconContainer, size === 'large' && styles.appIconContainerLarge]}>
        <Image
          source={{ uri: app.icon }}
          style={[styles.appIcon, size === 'large' && styles.appIconLarge]}
          defaultSource={require('../../assets/icon.png')}
        />
      </View>
      <View style={styles.appInfo}>
        <Text style={[styles.appName, size === 'large' && styles.appNameLarge]} numberOfLines={1}>
          {app.name}
        </Text>
        <Text style={styles.appDescription} numberOfLines={size === 'large' ? 2 : 1}>
          {app.description}
        </Text>
        <View style={styles.categoryBadge}>
          <Ionicons
            name={DAPP_CATEGORIES[app.category].icon as any}
            size={10}
            color={colors.textTertiary}
          />
          <Text style={styles.categoryText}>
            {DAPP_CATEGORIES[app.category].label}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  const categories = Object.entries(DAPP_CATEGORIES);

  return (
    <Screen scroll={false}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Apps</Text>
          <Text style={styles.subtitle}>Explore the Koinos ecosystem</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search apps..."
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

        {/* Category Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoriesContent}
        >
          <TouchableOpacity
            style={[
              styles.categoryChip,
              !selectedCategory && styles.categoryChipActive
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[
              styles.categoryChipText,
              !selectedCategory && styles.categoryChipTextActive
            ]}>
              All
            </Text>
          </TouchableOpacity>
          {categories.map(([key, { label, icon }]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.categoryChip,
                selectedCategory === key && styles.categoryChipActive
              ]}
              onPress={() => setSelectedCategory(selectedCategory === key ? null : key)}
            >
              <Ionicons
                name={icon as any}
                size={14}
                color={selectedCategory === key ? colors.textPrimary : colors.textSecondary}
              />
              <Text style={[
                styles.categoryChipText,
                selectedCategory === key && styles.categoryChipTextActive
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Featured Section (only when no search/filter) */}
        {!searchQuery && !selectedCategory && featuredApps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Featured</Text>
            {featuredApps.slice(0, 2).map(app => renderAppCard(app, 'large'))}
          </View>
        )}

        {/* All Apps Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {selectedCategory
              ? DAPP_CATEGORIES[selectedCategory as keyof typeof DAPP_CATEGORIES].label
              : searchQuery
                ? 'Search Results'
                : 'All Apps'}
          </Text>
          {filteredApps.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No apps found</Text>
            </View>
          ) : (
            filteredApps.map(app => renderAppCard(app))
          )}
        </View>

        {/* Coming Soon Note */}
        <View style={styles.comingSoonNote}>
          <Ionicons name="information-circle-outline" size={20} color={colors.purple} />
          <Text style={styles.comingSoonText}>
            In-app browser with wallet connection coming soon!
          </Text>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  categoriesContainer: {
    marginBottom: 8,
  },
  categoriesContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: colors.purple,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.textPrimary,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  appCardLarge: {
    padding: 20,
  },
  appIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  appIconContainerLarge: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  appIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  appInfo: {
    flex: 1,
    marginRight: 8,
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  appNameLarge: {
    fontSize: 18,
  },
  appDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    color: colors.textTertiary,
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
  comingSoonNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 40,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  comingSoonText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
