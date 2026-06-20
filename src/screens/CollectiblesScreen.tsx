import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useNFTs } from '../hooks/useNFTs';
import { getNFTImageUrl, getNFTName, type NFT, type NFTCollection } from '../lib/nftService';
import colors from '../theme/colors';
import type { CollectiblesStackParamList } from '../navigation/TabNavigator';

const GRID_COLUMNS = 2;

function chunkNFTs(nfts: NFT[], size: number): NFT[][] {
  const rows: NFT[][] = [];
  for (let index = 0; index < nfts.length; index += size) {
    rows.push(nfts.slice(index, index + size));
  }
  return rows;
}

function getRowKey(collectionAddress: string, row: NFT[]): string {
  return `${collectionAddress}:${row.map((nft) => nft.id).join('|')}`;
}

function StateView({
  icon,
  iconColor,
  title,
  description,
  actionLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.stateContainer}>
      <View style={styles.stateIconContainer}>
        <Ionicons name={icon} size={36} color={iconColor} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onPress ? (
        <Pressable style={styles.retryButton} onPress={onPress}>
          <Text style={styles.retryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function NFTTile({
  nft,
  onPress,
}: {
  nft: NFT;
  onPress: (nft: NFT) => void;
}) {
  const imageUrl = getNFTImageUrl(nft);
  const displayName = getNFTName(nft);

  return (
    <Pressable style={styles.tile} onPress={() => onPress(nft)}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.tileImage} resizeMode="cover" />
      ) : (
        <View style={styles.tileFallback}>
          <Text style={styles.tileFallbackText}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.tileName} numberOfLines={1}>
        {displayName}
      </Text>
      <Text style={styles.tileCollection} numberOfLines={1}>
        {nft.collection_name || 'Collection'}
      </Text>
    </Pressable>
  );
}

export const CollectiblesScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CollectiblesStackParamList>>();
  const { collections, loading, error, refetch, isTestnet, nfts } = useNFTs();
  const groupedRows = useMemo(
    () =>
      collections.map((collection) => ({
        ...collection,
        rows: chunkNFTs(collection.nfts, GRID_COLUMNS),
      })),
    [collections]
  );

  const handleNFTPress = (nft: NFT) => {
    navigation.navigate('NFTDetail', { nft });
  };

  const renderCollection = ({ item }: { item: NFTCollection & { rows: NFT[][] } }) => (
    <View style={styles.collectionSection}>
      <View style={styles.collectionHeader}>
        <Text style={styles.collectionTitle}>{item.name}</Text>
        <Text style={styles.collectionCount}>
          {item.nfts.length} item{item.nfts.length === 1 ? '' : 's'}
        </Text>
      </View>
      {item.rows.map((row) => (
        <View key={getRowKey(item.address, row)} style={styles.gridRow}>
          {row.map((nft) => (
            <NFTTile key={nft.id} nft={nft} onPress={handleNFTPress} />
          ))}
          {row.length < GRID_COLUMNS ? <View style={styles.tileSpacer} /> : null}
        </View>
      ))}
    </View>
  );

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Collectibles</Text>
          <Text style={styles.subtitle}>
            {isTestnet ? 'Harbinger unsupported' : `${nfts.length} item${nfts.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        {isTestnet ? (
          <StateView
            icon="alert-circle-outline"
            iconColor={colors.warning}
            title="NFTs Not Available"
            description="Collectibles are mainnet-only right now. Switch from Harbinger to view your NFTs."
          />
        ) : loading && collections.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Loading collectibles...</Text>
          </View>
        ) : error ? (
          <StateView
            icon="cloud-offline-outline"
            iconColor={colors.error}
            title="Failed to Load Collectibles"
            description={error || 'Try again in a moment.'}
            actionLabel="Retry"
            onPress={() => void refetch()}
          />
        ) : (
          <FlatList
            data={groupedRows}
            keyExtractor={(item) => item.address}
            renderItem={renderCollection}
            ListEmptyComponent={
              <StateView
                icon="images-outline"
                iconColor={colors.textTertiary}
                title="No Collectibles Yet"
                description="NFTs from known Koinos collections will appear here when this account owns them."
              />
            }
            contentContainerStyle={groupedRows.length === 0 ? styles.listEmptyContent : styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.collectionSeparator} />}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void refetch()}
                tintColor={colors.purple}
              />
            }
          />
        )}
      </View>
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
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listEmptyContent: {
    flexGrow: 1,
  },
  collectionSeparator: {
    height: 20,
  },
  collectionSection: {
    gap: 12,
  },
  collectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  collectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  collectionCount: {
    color: colors.textTertiary,
    fontSize: 13,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  tileSpacer: {
    flex: 1,
  },
  tileImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: colors.elevated,
  },
  tileFallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileFallbackText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  tileName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  tileCollection: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  stateIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  stateDescription: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  retryButton: {
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
