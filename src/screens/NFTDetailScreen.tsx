import React from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../components/Screen';
import { getContractExplorerUrl } from '../lib/explorer';
import {
  decodeTokenId,
  getNFTDescription,
  getNFTImageUrl,
  getNFTName,
  type NFT,
} from '../lib/nftService';
import { truncateAddress } from '../lib/utils';
import colors from '../theme/colors';
import type { CollectiblesStackParamList } from '../navigation/TabNavigator';

type NFTDetailRoute = RouteProp<CollectiblesStackParamList, 'NFTDetail'>;

function DetailRow({
  label,
  value,
  onPress,
  icon = 'copy-outline',
}: {
  label: string;
  value: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.8 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={styles.detailRow}
    >
      <View style={styles.detailLabelColumn}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
      {onPress ? <Ionicons name={icon} size={18} color={colors.textTertiary} /> : null}
    </TouchableOpacity>
  );
}

function NFTImage({ nft }: { nft: NFT }) {
  const imageUrl = getNFTImageUrl(nft);
  const displayName = getNFTName(nft);

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />;
  }

  return (
    <View style={styles.imageFallback}>
      <Text style={styles.imageFallbackText}>{displayName.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export const NFTDetailScreen = () => {
  const route = useRoute<NFTDetailRoute>();
  const { nft } = route.params;
  const displayName = getNFTName(nft);
  const description = getNFTDescription(nft);
  const decodedTokenId = decodeTokenId(nft.token_id);

  const handleCopy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const handleOpenExplorer = () => {
    Linking.openURL(getContractExplorerUrl(nft.contract_id));
  };

  return (
    <Screen scroll={false}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <NFTImage nft={nft} />

        <View style={styles.header}>
          <Text style={styles.collectionName}>{nft.collection_name || 'Collection'}</Text>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>

        <View style={styles.section}>
          <DetailRow label="Token ID" value={decodedTokenId} onPress={() => handleCopy('Token ID', nft.token_id)} />
          <DetailRow label="Contract" value={truncateAddress(nft.contract_id, 8)} onPress={() => handleCopy('Contract', nft.contract_id)} />
          <DetailRow label="Owner" value={truncateAddress(nft.owner, 8)} onPress={() => handleCopy('Owner', nft.owner)} />
        </View>

        {nft.metadata?.attributes?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Traits</Text>
            <View style={styles.traitsGrid}>
              {nft.metadata.attributes.map((attribute) => (
                <View key={`${attribute.trait_type}:${attribute.value}`} style={styles.traitCard}>
                  <Text style={styles.traitLabel}>{attribute.trait_type}</Text>
                  <Text style={styles.traitValue}>{String(attribute.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <TouchableOpacity style={styles.explorerButton} onPress={handleOpenExplorer}>
          <Ionicons name="open-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.explorerButtonText}>View Contract on Explorer</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: colors.elevated,
  },
  imageFallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: '700',
  },
  header: {
    gap: 8,
  },
  collectionName: {
    color: colors.purple,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabelColumn: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  traitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  traitCard: {
    width: '47%',
    backgroundColor: colors.elevated,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  traitLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  traitValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  explorerButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  explorerButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
