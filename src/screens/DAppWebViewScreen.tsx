import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Provider } from 'koilib';
import { DApp } from '../constants/dapps';
import colors from '../theme/colors';
import { useWalletStore } from '../stores/walletStore';
import { DEFAULT_NETWORK } from '../lib/constants';
import {
  KONDOR_PROVIDER_SCRIPT,
  KondorMessage,
  KondorResponse,
  BACKGROUND_COMMANDS,
  APPROVAL_COMMANDS,
} from '../lib/kondorProvider';

type DAppWebViewRouteParams = {
  DAppWebView: {
    app: DApp;
  };
};

export const DAppWebViewScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<DAppWebViewRouteParams, 'DAppWebView'>>();
  const { app } = route.params;

  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(app.url);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Wallet state
  const { accounts, address, getActiveAccount } = useWalletStore();

  // Provider for blockchain queries
  const providerRef = useRef<Provider>(new Provider(DEFAULT_NETWORK.rpcNodes));

  // Send response back to WebView
  const sendResponse = useCallback((response: KondorResponse) => {
    if (webViewRef.current) {
      console.log('[Kondor] Sending response:', response.id, response.error ? 'error' : 'success');
      // Use both the direct callback AND postMessage for maximum compatibility
      const script = `
        (function() {
          console.log('[Kondor Mobile] Injecting response for:', '${response.id}');
          if (window.__kondorMobileResponse) {
            window.__kondorMobileResponse(${JSON.stringify(response)});
          }
          // Also post message for kondor-js compatibility
          window.postMessage(${JSON.stringify(response)}, '*');
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, []);

  // Handle provider commands (no user approval needed)
  const handleProviderCommand = useCallback(async (command: string, args: Record<string, unknown>): Promise<unknown> => {
    const provider = providerRef.current;

    switch (command) {
      case 'provider:call':
        return provider.call(args.method as string, args.params);

      case 'provider:getNonce':
        return provider.getNonce(args.account as string);

      case 'provider:getNextNonce':
        return provider.getNextNonce(args.account as string);

      case 'provider:getAccountRc':
        return provider.getAccountRc(args.account as string);

      case 'provider:getTransactionsById':
        return provider.getTransactionsById(args.transactionIds as string[]);

      case 'provider:getBlocksById':
        return provider.getBlocksById(args.blockIds as string[]);

      case 'provider:getHeadInfo':
        return provider.getHeadInfo();

      case 'provider:getChainId':
        return provider.getChainId();

      case 'provider:getBlocks':
        return provider.getBlocks(
          args.height as number,
          args.numBlocks as number,
          args.idRef as string,
          args.opts as any
        );

      case 'provider:getBlock':
        return provider.getBlock(args.height as number, args.opts as any);

      case 'provider:wait':
        return provider.wait(
          args.txId as string,
          args.type as 'byTransactionId' | 'byBlock' | undefined,
          args.timeout as number
        );

      case 'provider:sendTransaction':
        return provider.sendTransaction(args.transaction as any, args.broadcast as boolean);

      case 'provider:submitBlock':
        return provider.submitBlock(args.block as any);

      case 'provider:readContract':
        return provider.readContract(args.operation as any);

      case 'provider:getForkHeads':
        return provider.getForkHeads();

      case 'provider:getResourceLimits':
        return provider.getResourceLimits();

      case 'provider:invokeGetContractMetadata':
        return provider.invokeGetContractMetadata(args.contractId as string);

      default:
        throw new Error(`Unknown provider command: ${command}`);
    }
  }, []);

  // Handle signer commands (require user approval)
  const handleSignerCommand = useCallback(async (command: string, args: Record<string, unknown>): Promise<unknown> => {
    // For now, return a placeholder that signing is not yet implemented
    // Full implementation will require an approval modal
    throw new Error('Transaction signing coming soon. Please use the Kondor browser extension for now.');
  }, []);

  // Handle getAccounts command
  const handleGetAccounts = useCallback(async (): Promise<unknown> => {
    // Ask user for permission to connect
    return new Promise((resolve, reject) => {
      Alert.alert(
        'Connect Wallet',
        `${app.name} wants to connect to your wallet and view your account address.`,
        [
          {
            text: 'Deny',
            style: 'cancel',
            onPress: () => reject(new Error('User denied account access')),
          },
          {
            text: 'Connect',
            onPress: () => {
              setIsConnected(true);
              const activeAccount = getActiveAccount();
              resolve([
                {
                  name: activeAccount?.name || 'Account 1',
                  address: address,
                  signers: [address], // In Koinos, the address can be a signer
                },
              ]);
            },
          },
        ],
        { cancelable: false }
      );
    });
  }, [app.name, address, getActiveAccount]);

  // Handle messages from WebView
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Only handle kondor messages
      if (data.type !== 'kondor') {
        return;
      }

      const message = data as KondorMessage;
      const { id, command, args } = message;

      console.log('[Kondor] Received command:', command, args);

      try {
        let result: unknown;

        if (command === 'getAccounts') {
          result = await handleGetAccounts();
        } else if (BACKGROUND_COMMANDS.includes(command)) {
          result = await handleProviderCommand(command, args);
        } else if (APPROVAL_COMMANDS.includes(command)) {
          result = await handleSignerCommand(command, args);
        } else {
          throw new Error(`Unknown command: ${command}`);
        }

        sendResponse({ type: 'kondor-response', id, result });
      } catch (err: any) {
        console.error('[Kondor] Command error:', err);
        sendResponse({ type: 'kondor-response', id, error: err.message });
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, [handleGetAccounts, handleProviderCommand, handleSignerCommand, sendResponse]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
  }, []);

  const handleGoBack = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webViewRef.current && canGoForward) {
      webViewRef.current.goForward();
    }
  };

  const handleRefresh = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    setError(nativeEvent.description || 'Failed to load page');
    setIsLoading(false);
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.urlBar}>
          {isConnected ? (
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
            </View>
          ) : (
            <Ionicons name="lock-closed" size={12} color={colors.success} style={styles.lockIcon} />
          )}
          <Text style={styles.urlText} numberOfLines={1}>
            {getDomain(currentUrl)}
          </Text>
        </View>

        <TouchableOpacity style={styles.menuButton} onPress={handleRefresh}>
          <Ionicons name="refresh" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* App Info Bar */}
      <View style={styles.appInfoBar}>
        <Text style={styles.appName}>{app.name}</Text>
        {isConnected && (
          <View style={styles.connectedIndicator}>
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        )}
        {isLoading && (
          <ActivityIndicator size="small" color={colors.purple} style={styles.loadingIndicator} />
        )}
      </View>

      {/* WebView or Error */}
      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: app.url }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onError={handleError}
          onHttpError={handleError}
          onMessage={handleMessage}
          injectedJavaScriptBeforeContentLoaded={KONDOR_PROVIDER_SCRIPT}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.purple} />
              <Text style={styles.loadingText}>Loading {app.name}...</Text>
            </View>
          )}
          // Security settings
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={true}
        />
      )}

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={handleGoBack}
          disabled={!canGoBack}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={canGoBack ? colors.textPrimary : colors.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={handleGoForward}
          disabled={!canGoForward}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={canGoForward ? colors.textPrimary : colors.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={handleRefresh}>
          <Ionicons name="refresh" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={() => {}}>
          <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
    gap: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lockIcon: {
    marginRight: 6,
  },
  connectedBadge: {
    marginRight: 6,
  },
  urlText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  menuButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  connectedIndicator: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.success + '20',
    borderRadius: 4,
  },
  connectedText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.success,
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: colors.purple,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
});
