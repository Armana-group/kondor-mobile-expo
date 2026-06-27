import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  Switch,
  FlatList,
} from 'react-native';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Provider, Transaction, TransactionJson } from 'koilib';
import { DApp } from '../constants/dapps';
import colors from '../theme/colors';
import { Account, useWalletStore } from '../stores/walletStore';
import { useTokenStore } from '../stores/tokenStore';
import {
  buildPendingTransactionFromBroadcast,
  useTransactionStore,
} from '../stores/transactionStore';
import { browserLogger } from '../lib/logger';
import {
  KONDOR_PROVIDER_SCRIPT,
  KondorMessage,
  KondorResponse,
  BACKGROUND_COMMANDS,
  APPROVAL_COMMANDS,
} from '../lib/kondorProvider';
import {
  TransactionApprovalModal,
  TransactionRequest,
  SigningResult,
} from '../components/TransactionApprovalModal';
import {
  DAppMessageSigningModal,
  DAppMessageSigningRequest,
} from '../components/DAppMessageSigningModal';
import {
  getActiveNetworkConfig,
  getNetworkConfigForMode,
  type NetworkMode,
  useNetworkStore,
} from '../stores/networkStore';
import {
  handleWebViewProviderCall,
  handleWebViewProviderSendTransaction,
  handleWebViewProviderSubmitBlock,
} from './dappWebViewProviderGuards';
import { inspectDAppOrigin, type DAppOriginSecurity } from '../lib/dapp/originSecurity';
import { createGrant, resolveConnection } from '../lib/dapp/permissions';
import { getPermissionStoreSnapshot, useDAppPermissionStore } from '../stores/dappPermissionStore';

type DAppWebViewRouteParams = {
  DAppWebView: {
    app: DApp;
  };
};

// Pending request for transaction signing
interface PendingSignRequest {
  id: string;
  origin: string;
  request: TransactionRequest;
  isSend: boolean;
}

interface PendingConnectionRequest {
  id: string;
  origin: string;
  security: DAppOriginSecurity;
}

interface PendingMessageSigningRequest {
  id: string;
  origin: string;
  security: DAppOriginSecurity;
  request: DAppMessageSigningRequest;
}

interface KondorConnectedAccount {
  name: string;
  address: string;
  signers: Array<{ name: string; address: string }>;
}

function getOriginFromUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value || 'Unknown';
  }
}

function getOriginWarningText(security: DAppOriginSecurity): string {
  if (security.level === 'danger') {
    return 'Suspicious site origin — do not connect unless you verified the domain.';
  }
  if (security.level === 'warning') {
    return 'Unverified site — review requests carefully before approving.';
  }
  return 'Unknown site — connect only if you trust it.';
}

function truncateAddress(address: string): string {
  if (address.length <= 18) {
    return address;
  }
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function toConnectedAccount(account: Account): KondorConnectedAccount {
  return {
    name: account.name,
    address: account.address,
    signers: [],
  };
}

function getProviderNetworkToken(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = (value as Record<string, unknown>).tag
      ?? (value as Record<string, unknown>).network
      ?? (value as Record<string, unknown>).name;
    if (typeof candidate === 'string') {
      return candidate.trim().toLowerCase();
    }
  }

  return null;
}

function resolveProviderNetworkMode(value: unknown): NetworkMode | null | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const token = getProviderNetworkToken(value);
  if (!token) {
    return null;
  }

  if (token === 'mainnet') {
    return 'mainnet';
  }

  if (token === 'harbinger' || token === 'testnet') {
    return 'harbinger';
  }

  return null;
}

function getUnsupportedNetworkLabel(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const DAppWebViewScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<DAppWebViewRouteParams, 'DAppWebView'>>();
  const { app } = route.params;
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const historyNetworkMode = hasHydrated ? networkMode : 'mainnet';
  const getTokenByContractId = useTokenStore((state) => state.getTokenByContractId);
  const activeNetwork = getActiveNetworkConfig();
  const rpcNodesKey = activeNetwork.rpcNodes.join(',');
  const rpcNodes = useMemo(() => rpcNodesKey.split(',').filter(Boolean), [rpcNodesKey]);

  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(app.url);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showOriginWarning, setShowOriginWarning] = useState(
    inspectDAppOrigin(getOriginFromUrl(app.url)).level !== 'trusted'
  );

  // Transaction approval modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingSignRequest | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [pendingConnectionRequest, setPendingConnectionRequest] = useState<PendingConnectionRequest | null>(null);
  const [pendingMessageSigningRequest, setPendingMessageSigningRequest] = useState<PendingMessageSigningRequest | null>(null);
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);
  const [rememberSite, setRememberSite] = useState(true);

  // Wallet state
  const { accounts, address, getActiveAccount } = useWalletStore();
  const permissionStoreHydrated = useDAppPermissionStore((state) => state.hasHydrated);
  const upsertGrant = useDAppPermissionStore((state) => state.upsertGrant);
  const touchGrantLastUsed = useDAppPermissionStore((state) => state.touchGrantLastUsed);

  // Provider for blockchain queries
  const providerRef = useRef<Provider | null>(null);
  const currentOriginRef = useRef<string | null>(null);
  const pendingTransactionRequestRef = useRef<PendingSignRequest | null>(null);
  const pendingConnectionRequestRef = useRef<PendingConnectionRequest | null>(null);
  const pendingMessageSigningRequestRef = useRef<PendingMessageSigningRequest | null>(null);
  const currentOriginSecurity = inspectDAppOrigin(getOriginFromUrl(currentUrl));

  if (!providerRef.current) {
    providerRef.current = new Provider(rpcNodes);
  }

  if (currentOriginRef.current === null) {
    currentOriginRef.current = getOriginFromUrl(app.url);
  }

  useEffect(() => {
    providerRef.current = new Provider(rpcNodes);
  }, [hasHydrated, networkMode, rpcNodes]);

  // Send response back to WebView
  const sendResponse = useCallback((response: KondorResponse) => {
    if (webViewRef.current) {
      browserLogger.debug('Sending response:', response.id, response.error ? 'error' : 'success');
      // Use direct callback for responses - avoids wildcard postMessage security risk
      // The injected provider script also listens for postMessage with origin check
      const responsePayload = response.result instanceof Uint8Array
        ? {
            ...response,
            result: Array.from(response.result),
            __kondorUint8ArrayResult: true,
          }
        : response;
      const responseJson = JSON.stringify(responsePayload);
      const script = `
        (function() {
          var resp = ${responseJson};
          if (resp.__kondorUint8ArrayResult) {
            resp.result = new Uint8Array(resp.result);
            delete resp.__kondorUint8ArrayResult;
          }
          if (window.__kondorMobileResponse) {
            window.__kondorMobileResponse(resp);
          }
          // Post to self with origin check (for kondor-js compatibility)
          window.postMessage(resp, window.location.origin);
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, []);

  const getProviderForCommand = useCallback((args: Record<string, unknown>): Provider => {
    const requestedNetworkMode = resolveProviderNetworkMode(args.network);
    if (requestedNetworkMode === null) {
      throw new Error(`Unsupported network: ${getUnsupportedNetworkLabel(args.network)}`);
    }

    if (!requestedNetworkMode) {
      return providerRef.current!;
    }

    return new Provider(getNetworkConfigForMode(requestedNetworkMode).rpcNodes);
  }, []);

  // Handle provider commands (no user approval needed)
  const handleProviderCommand = useCallback(async (command: string, args: Record<string, unknown>): Promise<unknown> => {
    const provider = getProviderForCommand(args);

    switch (command) {
      case 'provider:call':
        return handleWebViewProviderCall(provider, args);

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
        return handleWebViewProviderSendTransaction(provider, args);

      case 'provider:submitBlock':
        return handleWebViewProviderSubmitBlock(provider, args);

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
  }, [getProviderForCommand]);

  // Handle signer:prepareTransaction command
  const handlePrepareTransaction = useCallback(async (args: Record<string, unknown>): Promise<TransactionJson> => {
    const { signerAddress, transaction } = args as { signerAddress: string; transaction: TransactionJson };
    const provider = providerRef.current!;

    // Prepare transaction
    let tx = { ...transaction };

    if (!tx.header) {
      tx.header = { payer: signerAddress };
    }
    if (!tx.header.payer) {
      tx.header.payer = signerAddress;
    }
    if (!tx.header.chain_id) {
      tx.header.chain_id = activeNetwork.chainId;
    }

    const txObj = new Transaction({ provider });
    txObj.transaction = tx;
    await txObj.prepare();

    return txObj.transaction;
  }, [activeNetwork.chainId]);

  // Handle signer commands (require user approval)
  const handleSignerCommand = useCallback(async (
    id: string,
    command: string,
    args: Record<string, unknown>
  ): Promise<unknown> => {
    // Handle prepareTransaction without approval (just prepares, no signing)
    if (command === 'signer:prepareTransaction') {
      return handlePrepareTransaction(args);
    }

    // Handle signHash and signMessage
    if (command === 'signer:signHash' || command === 'signer:signMessage') {
      const origin = getOriginFromUrl(currentUrl || app.url);
      const security = inspectDAppOrigin(origin, {
        highRiskRequest: command === 'signer:signHash' ? 'raw hash signing' : 'message signing',
      });

      if (security.denyApproval) {
        throw new Error(
          security.signals[0]?.detail || 'This site cannot be approved because its origin looks unsafe.'
        );
      }

      const pendingSigningRequest: PendingMessageSigningRequest = {
        id,
        origin,
        security,
        request: {
          signerAddress: (args.signerAddress as string) || '',
          kind: command === 'signer:signHash' ? 'hash' : 'message',
          message: args.message,
          hash: args.hash,
        },
      };

      pendingMessageSigningRequestRef.current = pendingSigningRequest;
      setPendingMessageSigningRequest(pendingSigningRequest);

      return new Promise(() => {
        // The modal handlers send the actual response.
      });
    }

    // For signTransaction and sendTransaction, show approval modal
    if (command === 'signer:signTransaction' || command === 'signer:sendTransaction') {
      const isSend = command === 'signer:sendTransaction';
      const { signerAddress, transaction, options, abis } = args as {
        signerAddress: string;
        transaction: TransactionJson;
        options?: { broadcast?: boolean };
        abis?: Record<string, unknown>;
      };

      // Create pending request and show modal
      const request: TransactionRequest = {
        signerAddress,
        transaction,
        options,
        abis,
      };

      const pendingApproval = {
        id,
        origin: getOriginFromUrl(currentUrl || app.url),
        request,
        isSend,
      };
      pendingTransactionRequestRef.current = pendingApproval;
      setPendingRequest(pendingApproval);
      setShowApprovalModal(true);

      // Return a promise that will be resolved when modal completes
      // The actual response is sent in handleApproveTransaction/handleRejectTransaction
      return new Promise(() => {
        // This promise never resolves here - response is sent via sendResponse
      });
    }

    throw new Error(`Unknown signer command: ${command}`);
  }, [app.url, currentUrl, handlePrepareTransaction]);

  // Handle transaction approval
  const handleApproveTransaction = useCallback((result: SigningResult) => {
    const livePendingRequest = pendingTransactionRequestRef.current;
    if (!pendingRequest || !livePendingRequest || livePendingRequest.id !== pendingRequest.id) {
      return;
    }

    if (currentOriginRef.current !== pendingRequest.origin) {
      sendResponse({
        type: 'kondor-response',
        id: pendingRequest.id,
        error: 'Navigation changed before transaction was approved',
      });
      pendingTransactionRequestRef.current = null;
      setShowApprovalModal(false);
      setPendingRequest(null);
      return;
    }

    if (pendingRequest) {
      browserLogger.debug('Transaction approved:', pendingRequest.id);
      if (pendingRequest.isSend) {
        useTransactionStore.getState().addPendingTransaction({
          address: pendingRequest.request.signerAddress || address || '',
          networkMode: historyNetworkMode,
          chainTransactionId: result.transaction.id,
          source: 'dapp',
          appOrigin: pendingRequest.origin,
          transaction: buildPendingTransactionFromBroadcast({
            address: pendingRequest.request.signerAddress || address || '',
            chainTransactionId: result.transaction.id,
            transaction: result.transaction,
            timestamp: Date.now(),
            receipt: result.receipt as { rc_used?: string | number | bigint | null } | null | undefined,
            getTokenByContractId,
          }),
        });
      }
      // Send the result back to the dApp
      if (pendingRequest.isSend) {
        sendResponse({
          type: 'kondor-response',
          id: pendingRequest.id,
          result: {
            receipt: result.receipt,
            transaction: result.transaction,
          },
        });
      } else {
        sendResponse({
          type: 'kondor-response',
          id: pendingRequest.id,
          result: result.transaction,
        });
      }
    }
    pendingTransactionRequestRef.current = null;
    setShowApprovalModal(false);
    setPendingRequest(null);
  }, [address, getTokenByContractId, historyNetworkMode, pendingRequest, sendResponse]);

  // Handle transaction rejection
  const handleRejectTransaction = useCallback((error: string) => {
    if (pendingRequest) {
      browserLogger.debug('Transaction rejected:', pendingRequest.id);
      sendResponse({
        type: 'kondor-response',
        id: pendingRequest.id,
        error,
      });
    }
    pendingTransactionRequestRef.current = null;
    setShowApprovalModal(false);
    setPendingRequest(null);
  }, [pendingRequest, sendResponse]);

  // Close approval modal
  const handleCloseApprovalModal = useCallback(() => {
    if (pendingRequest) {
      handleRejectTransaction('User cancelled');
    } else {
      setShowApprovalModal(false);
    }
  }, [pendingRequest, handleRejectTransaction]);

  const clearPendingMessageSigningRequest = useCallback(() => {
    pendingMessageSigningRequestRef.current = null;
    setPendingMessageSigningRequest(null);
  }, []);

  const handleApproveMessageSigning = useCallback((signature: string | Uint8Array) => {
    const livePendingRequest = pendingMessageSigningRequestRef.current;
    if (!pendingMessageSigningRequest || !livePendingRequest || livePendingRequest.id !== pendingMessageSigningRequest.id) {
      return;
    }

    if (currentOriginRef.current !== pendingMessageSigningRequest.origin) {
      sendResponse({
        type: 'kondor-response',
        id: pendingMessageSigningRequest.id,
        error: 'Navigation changed before signing was approved',
      });
      clearPendingMessageSigningRequest();
      return;
    }

    sendResponse({
      type: 'kondor-response',
      id: pendingMessageSigningRequest.id,
      result: signature,
    });
    clearPendingMessageSigningRequest();
  }, [clearPendingMessageSigningRequest, pendingMessageSigningRequest, sendResponse]);

  const handleRejectMessageSigning = useCallback((errorMessage = 'User rejected the signing request') => {
    if (pendingMessageSigningRequest) {
      sendResponse({
        type: 'kondor-response',
        id: pendingMessageSigningRequest.id,
        error: errorMessage,
      });
    }

    clearPendingMessageSigningRequest();
  }, [clearPendingMessageSigningRequest, pendingMessageSigningRequest, sendResponse]);

  const openConnectionApproval = useCallback((id: string, origin: string, security: DAppOriginSecurity) => {
    const activeAccount = getActiveAccount();
    const defaultSelection = activeAccount?.address
      ? [activeAccount.address]
      : address
        ? [address]
        : accounts[0]?.address
          ? [accounts[0].address]
          : [];

    setSelectedAddresses(defaultSelection);
    setRememberSite(true);
    const request = { id, origin, security };
    pendingConnectionRequestRef.current = request;
    setPendingConnectionRequest(request);
    setShowConnectionModal(true);
  }, [accounts, address, getActiveAccount]);

  const buildConnectedAccounts = useCallback((addresses: string[]): KondorConnectedAccount[] => {
    return addresses
      .map((selectedAddress) => accounts.find((account) => account.address === selectedAddress))
      .filter((account): account is Account => Boolean(account))
      .map(toConnectedAccount);
  }, [accounts]);

  const handleGetAccounts = useCallback(async (id: string): Promise<unknown> => {
    if (!permissionStoreHydrated) {
      await useDAppPermissionStore.persist.rehydrate();
    }

    const origin = getOriginFromUrl(currentUrl || app.url);
    const security = inspectDAppOrigin(origin);

    if (security.denyApproval) {
      throw new Error(
        security.signals[0]?.detail || 'This site cannot be approved because its origin looks unsafe.'
      );
    }

    const resolution = resolveConnection(
      origin,
      getPermissionStoreSnapshot(),
      accounts.map((account) => account.address),
      Date.now()
    );

    if (resolution.canAutoConnect) {
      touchGrantLastUsed(origin, Date.now());
      setIsConnected(true);
      return buildConnectedAccounts(resolution.accounts);
    }

    openConnectionApproval(id, origin, security);

    return new Promise(() => {
      // The modal handlers send the actual response.
    });
  }, [
    accounts,
    app.url,
    buildConnectedAccounts,
    currentUrl,
    openConnectionApproval,
    permissionStoreHydrated,
    touchGrantLastUsed,
  ]);

  const handleApproveConnection = useCallback(() => {
    if (!pendingConnectionRequest) {
      return;
    }

    const livePendingRequest = pendingConnectionRequestRef.current;
    if (!livePendingRequest || livePendingRequest.id !== pendingConnectionRequest.id) {
      return;
    }
    if (currentOriginRef.current !== pendingConnectionRequest.origin) {
      sendResponse({
        type: 'kondor-response',
        id: pendingConnectionRequest.id,
        error: 'Navigation changed before account access was approved',
      });
      pendingConnectionRequestRef.current = null;
      setShowConnectionModal(false);
      setPendingConnectionRequest(null);
      return;
    }

    const selectedAccounts = buildConnectedAccounts(selectedAddresses);
    if (selectedAccounts.length === 0) {
      return;
    }

    try {
      const grant = createGrant({
        origin: pendingConnectionRequest.origin,
        accounts: selectedAccounts.map((account) => account.address),
        lifetime: rememberSite ? 'persistent' : 'session',
        security: pendingConnectionRequest.security,
        now: Date.now(),
      });

      if (grant) {
        upsertGrant(grant);
      }
    } catch (grantError) {
      browserLogger.warn('Failed to save dApp connection grant', grantError);
    }

    setIsConnected(true);
    sendResponse({
      type: 'kondor-response',
      id: pendingConnectionRequest.id,
      result: selectedAccounts,
    });
    pendingConnectionRequestRef.current = null;
    setShowConnectionModal(false);
    setPendingConnectionRequest(null);
  }, [buildConnectedAccounts, pendingConnectionRequest, rememberSite, selectedAddresses, sendResponse, upsertGrant]);

  const handleRejectConnection = useCallback((errorMessage = 'User denied account access') => {
    if (pendingConnectionRequest) {
      sendResponse({
        type: 'kondor-response',
        id: pendingConnectionRequest.id,
        error: errorMessage,
      });
    }

    pendingConnectionRequestRef.current = null;
    setShowConnectionModal(false);
    setPendingConnectionRequest(null);
  }, [pendingConnectionRequest, sendResponse]);

  const toggleSelectedAddress = useCallback((selectedAddress: string) => {
    setSelectedAddresses((current) => (
      current.includes(selectedAddress)
        ? current.filter((addressEntry) => addressEntry !== selectedAddress)
        : [...current, selectedAddress]
    ));
  }, []);

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

      browserLogger.debug('Received command:', command, args);

      try {
        let result: unknown;

        if (command === 'getAccounts') {
          result = await handleGetAccounts(id);
          sendResponse({ type: 'kondor-response', id, result });
        } else if (command === 'signer:prepareTransaction') {
          // prepareTransaction doesn't need approval, but needs signer access
          result = await handleSignerCommand(id, command, args);
          sendResponse({ type: 'kondor-response', id, result });
        } else if (command === 'signer:signTransaction' || command === 'signer:sendTransaction') {
          // These require approval modal - modal handles the response
          await handleSignerCommand(id, command, args);
        } else if (command === 'provider:submitBlock') {
          result = await handleProviderCommand(command, args);
          sendResponse({ type: 'kondor-response', id, result });
        } else if (command === 'signer:signHash' || command === 'signer:signMessage') {
          // Message signing - handled by handleSignerCommand (throws error for now)
          result = await handleSignerCommand(id, command, args);
          sendResponse({ type: 'kondor-response', id, result });
        } else if (BACKGROUND_COMMANDS.includes(command)) {
          result = await handleProviderCommand(command, args);
          sendResponse({ type: 'kondor-response', id, result });
        } else {
          throw new Error(`Unknown command: ${command}`);
        }
      } catch (err: any) {
        browserLogger.error('Command error:', err);
        sendResponse({ type: 'kondor-response', id, error: err.message });
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, [handleGetAccounts, handleProviderCommand, handleSignerCommand, sendResponse]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    const nextOrigin = getOriginFromUrl(navState.url);
    if (nextOrigin !== currentOriginRef.current) {
      const pendingRequestOnOrigin = pendingConnectionRequestRef.current;
      const pendingTransactionOnOrigin = pendingTransactionRequestRef.current;
      const pendingSigningRequestOnOrigin = pendingMessageSigningRequestRef.current;
      if (pendingTransactionOnOrigin && pendingTransactionOnOrigin.origin !== nextOrigin) {
        sendResponse({
          type: 'kondor-response',
          id: pendingTransactionOnOrigin.id,
          error: 'Navigation changed before transaction was approved',
        });
        pendingTransactionRequestRef.current = null;
        setShowApprovalModal(false);
        setPendingRequest(null);
      }
      if (pendingRequestOnOrigin && pendingRequestOnOrigin.origin !== nextOrigin) {
        sendResponse({
          type: 'kondor-response',
          id: pendingRequestOnOrigin.id,
          error: 'Navigation changed before account access was approved',
        });
        pendingConnectionRequestRef.current = null;
        setShowConnectionModal(false);
        setPendingConnectionRequest(null);
      }
      if (pendingSigningRequestOnOrigin && pendingSigningRequestOnOrigin.origin !== nextOrigin) {
        sendResponse({
          type: 'kondor-response',
          id: pendingSigningRequestOnOrigin.id,
          error: 'Navigation changed before signing was approved',
        });
        clearPendingMessageSigningRequest();
      }
      currentOriginRef.current = nextOrigin;
      setIsConnected(false);
    }

    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
    setShowOriginWarning(inspectDAppOrigin(nextOrigin).level !== 'trusted');
  }, [clearPendingMessageSigningRequest, sendResponse]);

  // Block HTTP navigations - only allow HTTPS
  const handleShouldStartLoad = useCallback((request: ShouldStartLoadRequest): boolean => {
    const { url } = request;
    // Allow about:blank, data URIs, etc.
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return true;
    }
    if (url.startsWith('http://')) {
      Alert.alert(
        'Insecure Connection Blocked',
        'This page tried to navigate to an insecure HTTP URL. Only HTTPS connections are allowed.',
      );
      return false;
    }
    return true;
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
          ) : showOriginWarning ? (
            <Ionicons name="warning" size={12} color={colors.warning} style={styles.lockIcon} />
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

      {/* Origin Warning Banner */}
      {showOriginWarning && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={14} color={colors.warning} />
          <Text style={styles.warningText}>
            {getOriginWarningText(currentOriginSecurity)}
          </Text>
          <TouchableOpacity onPress={() => setShowOriginWarning(false)}>
            <Ionicons name="close" size={16} color={colors.warning} />
          </TouchableOpacity>
        </View>
      )}

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
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          mixedContentMode="never"
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

      {/* Transaction Approval Modal */}
      <TransactionApprovalModal
        visible={showApprovalModal}
        request={pendingRequest?.request || null}
        appName={app.name}
        appOrigin={pendingRequest?.origin || currentOriginRef.current || app.url}
        isSend={pendingRequest?.isSend || false}
        onApprove={handleApproveTransaction}
        onReject={handleRejectTransaction}
        onClose={handleCloseApprovalModal}
      />

      <DAppMessageSigningModal
        visible={!!pendingMessageSigningRequest}
        request={pendingMessageSigningRequest?.request || null}
        appName={app.name}
        appOrigin={pendingMessageSigningRequest?.origin || app.url}
        onApprove={handleApproveMessageSigning}
        onReject={handleRejectMessageSigning}
      />

      <Modal
        visible={showConnectionModal}
        animationType="slide"
        transparent
        onRequestClose={() => handleRejectConnection('User denied account access')}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.connectionModal}>
            <View style={styles.connectionHeader}>
              <Text style={styles.connectionTitle}>Connect with Kondor</Text>
              <Text style={styles.connectionSubtitle}>
                {pendingConnectionRequest?.security.displayOrigin || currentOriginSecurity.displayOrigin}
              </Text>
            </View>

            <View style={styles.connectionNotice}>
              <Ionicons
                name={pendingConnectionRequest?.security.level === 'trusted' ? 'shield-checkmark' : 'warning'}
                size={16}
                color={
                  pendingConnectionRequest?.security.level === 'trusted'
                    ? colors.success
                    : colors.warning
                }
              />
              <Text style={styles.connectionNoticeText}>
                {pendingConnectionRequest
                  ? getOriginWarningText(pendingConnectionRequest.security)
                  : 'Choose which accounts this site can view.'}
              </Text>
            </View>

            <FlatList
              style={styles.accountList}
              data={accounts}
              keyExtractor={(account) => account.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: account }) => {
                const selected = selectedAddresses.includes(account.address);

                return (
                  <TouchableOpacity
                    style={[styles.accountRow, selected && styles.accountRowSelected]}
                    onPress={() => toggleSelectedAddress(account.address)}
                  >
                    <View style={styles.accountCopy}>
                      <Text style={styles.accountName}>{account.name}</Text>
                      <Text style={styles.accountAddress}>{truncateAddress(account.address)}</Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={selected ? colors.purple : colors.textTertiary}
                    />
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.rememberRow}>
              <View style={styles.rememberCopy}>
                <Text style={styles.rememberTitle}>Remember this site</Text>
                <Text style={styles.rememberText}>
                  Keep account access connected until you disconnect it in Settings.
                </Text>
              </View>
              <Switch
                value={rememberSite}
                onValueChange={setRememberSite}
                trackColor={{ false: colors.border, true: colors.purpleLight }}
                thumbColor={rememberSite ? colors.purple : colors.textPrimary}
              />
            </View>

            <Text style={styles.connectionFootnote}>
              Connecting only shares selected account addresses. Signing and transaction approvals always stay prompt-driven.
            </Text>

            <View style={styles.connectionActions}>
              <TouchableOpacity
                style={[styles.connectionButton, styles.connectionButtonSecondary]}
                onPress={() => handleRejectConnection('User denied account access')}
              >
                <Text style={styles.connectionButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.connectionButton,
                  styles.connectionButtonPrimary,
                  selectedAddresses.length === 0 && styles.connectionButtonDisabled,
                ]}
                onPress={handleApproveConnection}
                disabled={selectedAddresses.length === 0}
              >
                <Text style={styles.connectionButtonPrimaryText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '18',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: colors.warning,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  connectionModal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    gap: 16,
    maxHeight: '82%',
  },
  connectionHeader: {
    gap: 6,
  },
  connectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  connectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  connectionNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
  },
  connectionNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  accountList: {
    maxHeight: 220,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  accountRowSelected: {
    borderColor: colors.purple,
    backgroundColor: colors.purpleLight,
  },
  accountCopy: {
    flex: 1,
    gap: 4,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  accountAddress: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
  },
  rememberCopy: {
    flex: 1,
    gap: 4,
  },
  rememberTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rememberText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  connectionFootnote: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  connectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  connectionButton: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  connectionButtonPrimary: {
    backgroundColor: colors.purple,
  },
  connectionButtonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionButtonDisabled: {
    opacity: 0.45,
  },
  connectionButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  connectionButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
