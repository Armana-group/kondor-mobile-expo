/**
 * Kondor Provider Injection Script
 *
 * This script is injected into WebViews to provide the window.kondor interface
 * that dApps use to interact with the wallet.
 */

export const KONDOR_PROVIDER_SCRIPT = `
(function() {
  // Prevent double injection
  if (window.kondor) {
    return;
  }

  // Message ID counter for tracking requests
  let messageId = 0;
  const pendingRequests = new Map();

  // Send message to React Native and return a promise
  function sendMessage(command, args = {}) {
    console.log('[Kondor Mobile] Sending command:', command, args);
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      pendingRequests.set(id, { resolve, reject });

      const message = {
        type: 'kondor',
        id,
        command,
        args
      };
      console.log('[Kondor Mobile] Posting message:', message);
      window.ReactNativeWebView.postMessage(JSON.stringify(message));

      // Timeout after 5 minutes (for user approval flows)
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 300000);
    });
  }

  // Handle responses from React Native
  // React Native WebView sends messages to both window and document
  function handleResponse(event) {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      console.log('[Kondor Mobile] Received message:', data);
      if (data.type === 'kondor-response' && data.id) {
        const pending = pendingRequests.get(data.id);
        if (pending) {
          pendingRequests.delete(data.id);
          if (data.error) {
            console.log('[Kondor Mobile] Rejecting with error:', data.error);
            pending.reject(new Error(data.error));
          } else {
            console.log('[Kondor Mobile] Resolving with result:', data.result);
            pending.resolve(data.result);
          }
        }
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }

  window.addEventListener('message', handleResponse);
  document.addEventListener('message', handleResponse);

  // Also expose a direct callback for React Native
  window.__kondorResponse = function(response) {
    console.log('[Kondor Mobile] Direct response:', response);
    const pending = pendingRequests.get(response.id);
    if (pending) {
      pendingRequests.delete(response.id);
      if (response.error) {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.result);
      }
    }
  };

  // Create Provider object (compatible with koilib)
  const provider = {
    call: (method, params) => sendMessage('provider:call', { method, params }),
    getNonce: (account) => sendMessage('provider:getNonce', { account }),
    getNextNonce: (account) => sendMessage('provider:getNextNonce', { account }),
    getAccountRc: (account) => sendMessage('provider:getAccountRc', { account }),
    getTransactionsById: (transactionIds) => sendMessage('provider:getTransactionsById', { transactionIds }),
    getBlocksById: (blockIds) => sendMessage('provider:getBlocksById', { blockIds }),
    getHeadInfo: () => sendMessage('provider:getHeadInfo', {}),
    getChainId: () => sendMessage('provider:getChainId', {}),
    getBlocks: (height, numBlocks, idRef, opts) => sendMessage('provider:getBlocks', { height, numBlocks, idRef, opts }),
    getBlock: (height, opts) => sendMessage('provider:getBlock', { height, opts }),
    wait: (txId, type, timeout) => sendMessage('provider:wait', { txId, type, timeout }),
    sendTransaction: (transaction, broadcast) => sendMessage('provider:sendTransaction', { transaction, broadcast }),
    submitBlock: (block) => sendMessage('provider:submitBlock', { block }),
    readContract: (operation) => sendMessage('provider:readContract', { operation }),
    getForkHeads: () => sendMessage('provider:getForkHeads', {}),
    getResourceLimits: () => sendMessage('provider:getResourceLimits', {}),
    invokeGetContractMetadata: (contractId) => sendMessage('provider:invokeGetContractMetadata', { contractId }),
  };

  // Create Signer factory function
  function getSigner(address) {
    return {
      getAddress: () => Promise.resolve(address),
      signHash: (hash) => sendMessage('signer:signHash', { signerAddress: address, hash }),
      signMessage: (message) => sendMessage('signer:signMessage', { signerAddress: address, message }),
      signTransaction: (transaction, abis) => sendMessage('signer:signTransaction', { signerAddress: address, transaction, abis }),
      sendTransaction: (transaction, abis) => sendMessage('signer:sendTransaction', { signerAddress: address, transaction, abis }),
      prepareTransaction: (transaction) => sendMessage('signer:prepareTransaction', { signerAddress: address, transaction }),
    };
  }

  // Legacy signer object (deprecated but maintained for compatibility)
  const legacySigner = {
    signHash: (hash, signerAddress) => sendMessage('signer:signHash', { signerAddress, hash }),
    signMessage: (message, signerAddress) => sendMessage('signer:signMessage', { signerAddress, message }),
    signTransaction: (transaction, signerAddress, abis) => sendMessage('signer:signTransaction', { signerAddress, transaction, abis }),
    sendTransaction: (transaction, signerAddress, abis) => sendMessage('signer:sendTransaction', { signerAddress, transaction, abis }),
    prepareTransaction: (transaction, signerAddress) => sendMessage('signer:prepareTransaction', { signerAddress, transaction }),
  };

  // getProvider function (returns provider for a specific network)
  function getProvider(network) {
    console.log('[Kondor Mobile] getProvider called with network:', network);
    return provider;
  }

  // KondorSigner class (matches kondor-js API)
  class KondorSigner {
    constructor(signerAddress, options = {}) {
      this.signerAddress = signerAddress;
      this.provider = options.provider || provider;
    }

    getAddress() {
      return this.signerAddress;
    }

    async signHash(hash) {
      return sendMessage('signer:signHash', { signerAddress: this.signerAddress, hash });
    }

    async signMessage(message) {
      return sendMessage('signer:signMessage', { signerAddress: this.signerAddress, message });
    }

    async signTransaction(transaction, abis) {
      return sendMessage('signer:signTransaction', { signerAddress: this.signerAddress, transaction, abis });
    }

    async sendTransaction(transaction, options) {
      return sendMessage('signer:sendTransaction', { signerAddress: this.signerAddress, transaction, options });
    }

    async prepareTransaction(transaction) {
      return sendMessage('signer:prepareTransaction', { signerAddress: this.signerAddress, transaction });
    }
  }

  // Define window.kondor (matching kondor-js structure exactly)
  window.kondor = {
    // Get available accounts
    getAccounts: () => {
      console.log('[Kondor Mobile] getAccounts called');
      return sendMessage('getAccounts', {});
    },

    // Provider for blockchain queries
    provider: provider,

    // Get provider for specific network
    getProvider: getProvider,

    // Signer class
    KondorSigner: KondorSigner,

    // Signer factory (recommended)
    getSigner: function(signerAddress, options) {
      console.log('[Kondor Mobile] getSigner called with:', signerAddress);
      return new KondorSigner(signerAddress, options);
    },

    // Legacy signer (deprecated)
    signer: legacySigner,

    // Version info
    version: '1.0.0',
    isKondorMobile: true,
  };

  // Also set on globalThis for module contexts
  globalThis.kondor = window.kondor;

  // Dispatch event to notify dApps that kondor is ready
  window.dispatchEvent(new Event('kondor#initialized'));

  console.log('[Kondor Mobile] Provider injected');
})();
`;

/**
 * Message types for communication between WebView and React Native
 */
export interface KondorMessage {
  type: 'kondor';
  id: number;
  command: string;
  args: Record<string, unknown>;
}

export interface KondorResponse {
  type: 'kondor-response';
  id: number;
  result?: unknown;
  error?: string;
}

/**
 * List of commands that can be handled in the background (no user approval needed)
 */
export const BACKGROUND_COMMANDS = [
  'provider:call',
  'provider:getNonce',
  'provider:getNextNonce',
  'provider:getAccountRc',
  'provider:getTransactionsById',
  'provider:getBlocksById',
  'provider:getHeadInfo',
  'provider:getChainId',
  'provider:getBlocks',
  'provider:getBlock',
  'provider:wait',
  'provider:sendTransaction',
  'provider:submitBlock',
  'provider:readContract',
  'provider:getForkHeads',
  'provider:getResourceLimits',
  'provider:invokeGetContractMetadata',
  'signer:prepareTransaction',
];

/**
 * List of commands that require user approval (popup)
 */
export const APPROVAL_COMMANDS = [
  'getAccounts',
  'signer:signHash',
  'signer:signMessage',
  'signer:signTransaction',
  'signer:sendTransaction',
];
