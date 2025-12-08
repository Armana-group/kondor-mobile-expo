/**
 * Kondor Provider Injection Script
 *
 * This script is injected into WebViews to provide the window.kondor interface
 * that dApps use to interact with the wallet.
 *
 * Strategy:
 * 1. Create our own window.kondor BEFORE the page loads
 * 2. Also intercept any window.postMessage calls (in case dApp uses kondor-js directly)
 * 3. Route all commands to React Native via ReactNativeWebView.postMessage
 */

export const KONDOR_PROVIDER_SCRIPT = `
(function() {
  // Prevent double injection
  if (window.__kondorMobileInjected) {
    return;
  }
  window.__kondorMobileInjected = true;

  console.log('[Kondor Mobile] Starting provider injection...');

  // Generate UUID for message IDs
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Track pending requests
  const pendingRequests = new Map();

  // Send message to React Native and return a promise
  function sendToNative(command, args = {}) {
    const id = generateId();
    console.log('[Kondor Mobile] Sending:', command, id);

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'kondor',
        id: id,
        command: command,
        args: args
      }));

      // Timeout after 5 minutes
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 300000);
    });
  }

  // Handle responses from React Native
  window.__kondorMobileResponse = function(response) {
    console.log('[Kondor Mobile] Response received:', response.id);
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

  // Also listen for postMessage responses (for kondor-js compatibility)
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    const data = event.data;

    // Handle response messages (no command, has id)
    if (data && typeof data === 'object' && data.id && !data.command) {
      const pending = pendingRequests.get(data.id);
      if (pending) {
        pendingRequests.delete(data.id);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data.result);
        }
      }
    }

    // Intercept kondor-js requests (has command)
    if (data && typeof data === 'object' && data.command && data.id) {
      console.log('[Kondor Mobile] Intercepted postMessage request:', data.command);

      // Store the request for later response
      if (!pendingRequests.has(data.id)) {
        // This is a request from kondor-js, forward to native
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'kondor',
          id: data.id,
          command: data.command,
          args: data.args || {}
        }));
      }
    }
  });

  // Create Provider object (compatible with koilib)
  const provider = {
    call: (method, params) => sendToNative('provider:call', { method, params }),
    getNonce: (account) => sendToNative('provider:getNonce', { account }),
    getNextNonce: (account) => sendToNative('provider:getNextNonce', { account }),
    getAccountRc: (account) => sendToNative('provider:getAccountRc', { account }),
    getTransactionsById: (transactionIds) => sendToNative('provider:getTransactionsById', { transactionIds }),
    getBlocksById: (blockIds) => sendToNative('provider:getBlocksById', { blockIds }),
    getHeadInfo: () => sendToNative('provider:getHeadInfo', {}),
    getChainId: () => sendToNative('provider:getChainId', {}),
    getBlocks: (height, numBlocks, idRef, opts) => sendToNative('provider:getBlocks', { height, numBlocks, idRef, opts }),
    getBlock: (height, opts) => sendToNative('provider:getBlock', { height, opts }),
    wait: (txId, type, timeout) => sendToNative('provider:wait', { txId, type, timeout }),
    sendTransaction: (transaction, broadcast) => sendToNative('provider:sendTransaction', { transaction, broadcast }),
    submitBlock: (block) => sendToNative('provider:submitBlock', { block }),
    readContract: (operation) => sendToNative('provider:readContract', { operation }),
    getForkHeads: () => sendToNative('provider:getForkHeads', {}),
    getResourceLimits: () => sendToNative('provider:getResourceLimits', {}),
    invokeGetContractMetadata: (contractId) => sendToNative('provider:invokeGetContractMetadata', { contractId }),
  };

  // getProvider function
  function getProvider(network) {
    console.log('[Kondor Mobile] getProvider called:', network);
    return provider;
  }

  // KondorSigner class (matches kondor-js API)
  class KondorSigner {
    constructor(opts) {
      if (typeof opts === 'string') {
        this.address = opts;
        this.provider = provider;
      } else {
        this.address = opts.address;
        this.provider = opts.provider || provider;
      }
    }

    getAddress() {
      return this.address;
    }

    async signHash(hash) {
      return sendToNative('signer:signHash', { signerAddress: this.address, hash });
    }

    async signMessage(message) {
      return sendToNative('signer:signMessage', { signerAddress: this.address, message });
    }

    async signTransaction(transaction, abis) {
      return sendToNative('signer:signTransaction', { signerAddress: this.address, transaction, abis });
    }

    async sendTransaction(transaction, options) {
      return sendToNative('signer:sendTransaction', { signerAddress: this.address, transaction, options });
    }

    async prepareTransaction(transaction) {
      return sendToNative('signer:prepareTransaction', { signerAddress: this.address, transaction });
    }

    async prepareBlock() {
      throw new Error('prepareBlock not available in Kondor Mobile');
    }

    async signBlock() {
      throw new Error('signBlock not available in Kondor Mobile');
    }
  }

  // getSigner function
  function getSigner(signerAddress, options) {
    console.log('[Kondor Mobile] getSigner called:', signerAddress);
    return new KondorSigner({ address: signerAddress, ...options });
  }

  // getAccounts function
  async function getAccounts() {
    console.log('[Kondor Mobile] getAccounts called');
    return sendToNative('getAccounts', {});
  }

  // Define window.kondor (matching kondor-js structure exactly)
  window.kondor = {
    provider: provider,
    getProvider: getProvider,
    getSigner: getSigner,
    getAccounts: getAccounts,
    KondorSigner: KondorSigner,
  };

  // Also set on globalThis
  if (typeof globalThis !== 'undefined') {
    globalThis.kondor = window.kondor;
  }

  console.log('[Kondor Mobile] window.kondor injected:', Object.keys(window.kondor));
})();
`;

/**
 * Message types for communication between WebView and React Native
 */
export interface KondorMessage {
  type: 'kondor';
  id: string;
  command: string;
  args: Record<string, unknown>;
  to?: string;
}

export interface KondorResponse {
  id: string;
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
