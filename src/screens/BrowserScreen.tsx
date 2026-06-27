import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { CURATED_DAPPS, DApp } from '../constants/dapps';
import { AppsStackParamList } from '../navigation/TabNavigator';
import { WalletConnectQRModal } from '../components/WalletConnectQRModal';
import { useWalletStore } from '../stores/walletStore';
import { useWalletConnectStore, WCSession } from '../stores/walletConnectStore';
import { useCustomDappStore } from '../stores/customDappStore';
import { HapticFeedback } from '../lib/haptics';
import { validateDAppUrl } from '../lib/urlValidation';
import { browserLogger, sanitizeErrorForUser } from '../lib/logger';
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
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [showWCScanner, setShowWCScanner] = useState(false);
  const urlInputRef = useRef<TextInput>(null);
  const {
    customDapps,
    addCustomDapp,
    removeCustomDapp,
  } = useCustomDappStore();

  // Wallet and WalletConnect state
  const { address, isWalletCreated } = useWalletStore();
  const {
    initialized,
    initialize,
    pair,
    sessions,
    disconnectSession
  } = useWalletConnectStore();

  // Initialize WalletConnect on mount
  useEffect(() => {
    if (isWalletCreated && address && !initialized) {
      initialize(address).catch((error) => {
        browserLogger.error('WC init error:', error);
      });
    }
  }, [isWalletCreated, address, initialized, initialize]);

  // Handle WalletConnect QR scan
  const handleWCScan = useCallback(async (wcUri: string) => {
    try {
      browserLogger.debug('Pairing with URI:', wcUri.slice(0, 50) + '...');
      await pair(wcUri);
      HapticFeedback.success();
    } catch (error: any) {
      browserLogger.error('Pairing error:', error);
      HapticFeedback.error();
      Alert.alert('Connection Failed', sanitizeErrorForUser(error, 'Failed to connect. Please try again.'));
    }
  }, [pair]);

  // Handle session disconnect
  const handleDisconnectSession = useCallback((session: WCSession) => {
    Alert.alert(
      'Disconnect',
      `Disconnect from ${session.peerMeta.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectSession(session.topic);
              HapticFeedback.success();
            } catch (error) {
              browserLogger.error('Disconnect error:', error);
            }
          },
        },
      ]
    );
  }, [disconnectSession]);

  // Filter apps based on search
  const allApps = [...CURATED_DAPPS, ...customDapps];
  const filteredApps = allApps.filter(app => {
    if (searchQuery === '') return true;
    return app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAppPress = (app: DApp) => {
    // Show WalletConnect info for apps that require it (like KoinDX)
    if (app.requiresWalletConnect) {
      Alert.alert(
        'Connect with WalletConnect',
        `To use ${app.name}:\n\n` +
        '1. Open the app on your desktop browser\n' +
        '2. Click "Connect Wallet"\n' +
        '3. Select "WalletConnect"\n' +
        '4. Scan the QR code with Kondor Mobile\n\n' +
        'Direct integration coming soon!',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Scan QR',
            onPress: () => setShowWCScanner(true),
          },
        ]
      );
      return;
    }
    navigation.navigate('DAppWebView', { app });
  };

  const handleCustomAppLongPress = (app: DApp) => {
    if (app.isCurated) {
      return;
    }

    Alert.alert(
      app.name,
      'Remove this saved app?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeCustomDapp(app.id),
        },
      ]
    );
  };

  const handleAddApp = () => {
    setCustomUrl('https://');
    setShowUrlModal(true);
    setTimeout(() => urlInputRef.current?.focus(), 100);
  };

  const handleSaveCustomUrl = () => {
    const result = validateDAppUrl(customUrl);

    if (!result) {
      Alert.alert('Invalid URL', 'Please enter a valid URL');
      return;
    }

    if (result.error) {
      Alert.alert('Insecure Connection', result.error);
      return;
    }

    const url = result.url;

    // Extract domain for app name
    let name = 'Custom App';
    try {
      const urlObj = new URL(url);
      name = urlObj.hostname.replace('www.', '');
    } catch {}

    const saveResult = addCustomDapp({
      name: name,
      url: url,
      category: 'other',
    });

    if (!saveResult.ok) {
      Alert.alert('Could Not Save App', saveResult.error);
      return;
    }

    setShowUrlModal(false);
    setCustomUrl('');
    navigation.navigate('DAppWebView', { app: saveResult.dapp });
  };

  const renderAppCard = (app: DApp) => (
    <TouchableOpacity
      key={app.id}
      style={styles.appCard}
      onPress={() => handleAppPress(app)}
      onLongPress={() => handleCustomAppLongPress(app)}
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

  // Render WalletConnect session card
  const renderWCSessionCard = (session: WCSession) => (
    <TouchableOpacity
      key={session.topic}
      style={styles.wcSessionCard}
      onPress={() => handleDisconnectSession(session)}
      activeOpacity={0.7}
    >
      <View style={styles.wcSessionIcon}>
        {session.peerMeta.icons?.[0] ? (
          <Image
            source={{ uri: session.peerMeta.icons[0] }}
            style={styles.wcSessionImage}
          />
        ) : (
          <Ionicons name="globe-outline" size={24} color={colors.textSecondary} />
        )}
      </View>
      <View style={styles.wcSessionInfo}>
        <Text style={styles.wcSessionName} numberOfLines={1}>
          {session.peerMeta.name}
        </Text>
        <Text style={styles.wcSessionUrl} numberOfLines={1}>
          {session.peerMeta.url.replace(/^https?:\/\//, '')}
        </Text>
      </View>
      <View style={styles.wcSessionStatus}>
        <View style={styles.wcStatusDot} />
        <Text style={styles.wcStatusText}>Connected</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Screen scroll={false}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Applications</Text>
        </View>

        {/* WalletConnect Section */}
        <View style={styles.wcSection}>
          <View style={styles.wcHeader}>
            <View style={styles.wcTitleRow}>
              <Ionicons name="link" size={18} color="#3B99FC" />
              <Text style={styles.wcTitle}>WalletConnect</Text>
            </View>
            <TouchableOpacity
              style={styles.wcScanButton}
              onPress={() => setShowWCScanner(true)}
            >
              <Ionicons name="qr-code-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.wcScanButtonText}>Scan</Text>
            </TouchableOpacity>
          </View>

          {sessions.length > 0 ? (
            <View style={styles.wcSessionsList}>
              {sessions.map(session => renderWCSessionCard(session))}
            </View>
          ) : (
            <View style={styles.wcEmptyState}>
              <Text style={styles.wcEmptyText}>
                No active connections
              </Text>
              <Text style={styles.wcEmptySubtext}>
                Scan a QR code to connect to a desktop dApp
              </Text>
            </View>
          )}
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

      {/* WalletConnect QR Scanner */}
      <WalletConnectQRModal
        visible={showWCScanner}
        onClose={() => setShowWCScanner(false)}
        onScan={handleWCScan}
      />

      {/* Custom URL Modal */}
      <Modal
        visible={showUrlModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowUrlModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowUrlModal(false)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter URL</Text>
            <Text style={styles.modalSubtitle}>
              Open any website with wallet integration
            </Text>

            <View style={styles.urlInputContainer}>
              <Ionicons name="globe-outline" size={20} color={colors.textTertiary} />
              <TextInput
                ref={urlInputRef}
                style={styles.urlInput}
                placeholder="https://example.com"
                placeholderTextColor={colors.textTertiary}
                value={customUrl}
                onChangeText={setCustomUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleSaveCustomUrl}
                selectTextOnFocus
              />
              {customUrl.length > 0 && (
                <TouchableOpacity onPress={() => setCustomUrl('')}>
                  <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowUrlModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.openButton}
                onPress={handleSaveCustomUrl}
              >
                <Text style={styles.openButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 12,
  },
  urlInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.elevated,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  openButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.purple,
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // WalletConnect styles
  wcSection: {
    marginHorizontal: GRID_PADDING,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
  },
  wcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  wcTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wcTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  wcComingSoonBadge: {
    backgroundColor: colors.elevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  wcComingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  wcScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B99FC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  wcScanButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  wcSessionsList: {
    gap: 8,
  },
  wcSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  wcSessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  wcSessionImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  wcSessionInfo: {
    flex: 1,
  },
  wcSessionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  wcSessionUrl: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  wcSessionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wcStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  wcStatusText: {
    fontSize: 11,
    color: colors.success,
  },
  wcEmptyState: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  wcEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  wcEmptySubtext: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
});
