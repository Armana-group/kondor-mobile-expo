import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, Signer } from 'koilib';
import {
  swapQuoteService,
  type SwapQuote,
} from '../lib/swapQuote';
import {
  executeSwapTransaction as executeSwapTransactionService,
  type SwapExecutionResult,
  type SwapExecutionStatus,
} from '../lib/swapTransaction';
import {
  getSwapInputBalanceInvalidReason,
  SwapError,
  type SwapToken,
} from '../lib/swapMath';
import { getActiveNetworkConfig, type NetworkConfig, useNetworkStore } from '../stores/networkStore';
import type { Token } from '../stores/tokenStore';

declare const require: <T = unknown>(moduleName: string) => T;

type KoinosStoreModule = typeof import('../stores/koinosStore');
type TokenStoreModule = typeof import('../stores/tokenStore');
type WalletStoreModule = typeof import('../stores/walletStore');

export type NativeSwapStatus =
  | 'idle'
  | 'quoting'
  | 'ready'
  | 'confirming'
  | 'building'
  | 'signing'
  | 'broadcasting'
  | 'success'
  | 'error';

export interface NativeSwapQuote {
  amountOut: string;
  expiresAt: number;
  tokenInContractId?: string;
  tokenOutContractId?: string;
  amountIn?: string;
  amountOutMinBaseUnits?: string;
}

export interface NativeSwapQuoteRequest {
  amount: string;
  slippage: number;
}

export interface NativeSwapExecuteContext<TQuote extends NativeSwapQuote = NativeSwapQuote> {
  amount: string;
  quote: TQuote;
  setStatus: (status: NativeSwapStatus) => void;
}

export interface NativeSwapControllerDeps<TQuote extends NativeSwapQuote = NativeSwapQuote> {
  getSwapQuote: (request: NativeSwapQuoteRequest) => Promise<TQuote>;
  executeSwapTransaction: (
    quote: TQuote,
    context: NativeSwapExecuteContext<TQuote>
  ) => Promise<unknown>;
  validateAmount?: (amount: string) => string | null;
  now?: () => number;
  debounceMs?: number;
  onStateChange?: (state: NativeSwapControllerState<TQuote>) => void;
}

export interface NativeSwapControllerState<TQuote extends NativeSwapQuote = NativeSwapQuote> {
  amount: string;
  slippage: number;
  status: NativeSwapStatus;
  quote: TQuote | null;
  error: string | null;
  isQuoteLoading: boolean;
}

export interface NativeSwapController<TQuote extends NativeSwapQuote = NativeSwapQuote> {
  getState: () => NativeSwapControllerState<TQuote>;
  setAmount: (amount: string) => Promise<void>;
  setSlippage: (slippage: number) => Promise<void>;
  refreshQuote: () => Promise<void>;
  flushQuote: () => Promise<void>;
  execute: () => Promise<unknown>;
  reset: () => void;
  dispose: () => void;
}

export interface UseNativeSwapResult {
  availableTokens: Token[];
  amount: string;
  setAmount: (amount: string) => Promise<void>;
  slippage: number;
  setSlippage: (slippage: number) => Promise<void>;
  inputToken: SwapToken | null;
  outputToken: SwapToken | null;
  setInputToken: (token: SwapToken | string | null) => void;
  setOutputToken: (token: SwapToken | string | null) => void;
  switchTokens: () => void;
  quote: SwapQuote | null;
  status: NativeSwapStatus;
  error: string | null;
  isQuoteLoading: boolean;
  canSwap: boolean;
  refreshQuote: () => Promise<void>;
  execute: () => Promise<SwapExecutionResult>;
  reset: () => void;
}

export interface NativeSwapQuoteValidityParams {
  quote: NativeSwapQuote | null;
  amount: string;
  inputTokenContractId?: string | null;
  outputTokenContractId?: string | null;
  now: number;
  requireMetadata?: boolean;
}

const DEFAULT_SLIPPAGE_PERCENT = 0.5;
const QUOTE_DEBOUNCE_MS = 300;
const DECIMAL_AMOUNT_RE = /^\d+(?:\.\d+)?$/;
const REQUIRED_QUOTE_ERROR = 'Swap quote is required before execution';
const EXPIRED_QUOTE_ERROR = 'Swap quote has expired';
const STALE_QUOTE_ERROR = 'Swap quote is stale; refresh the quote before swapping';
const ZERO_MIN_OUTPUT_ERROR = 'Swap quote has invalid zero minimum output';

interface ScopedSwapTokensParams {
  hasHydrated: boolean;
  networkMode: 'mainnet' | 'harbinger';
  address: string | null | undefined;
  cacheKey: string | null;
  tokens: Token[];
}

export function getSwapUnavailableMessage(
  network: Pick<NetworkConfig, 'isTestnet' | 'name'>
): string | null {
  if (!network.isTestnet) {
    return null;
  }

  return `Swap is currently only supported on Mainnet. ${network.name} is not supported.`;
}

function isPositiveAmount(amount: string): boolean {
  const trimmed = amount.trim();
  return DECIMAL_AMOUNT_RE.test(trimmed) && Number(trimmed) > 0;
}

function cloneState<TQuote extends NativeSwapQuote>(
  state: NativeSwapControllerState<TQuote>
): NativeSwapControllerState<TQuote> {
  return { ...state };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Swap failed';
}

function amountValidationReason<TQuote extends NativeSwapQuote>(
  deps: NativeSwapControllerDeps<TQuote>,
  amount: string
): string | null {
  return deps.validateAmount?.(amount.trim()) ?? null;
}

function quoteIsExpired(quote: NativeSwapQuote, now: number): boolean {
  return quote.expiresAt <= now;
}

function shouldValidateQuoteField(requireMetadata: boolean, value: unknown): boolean {
  return requireMetadata || value !== undefined;
}

function shouldValidateTokenField(
  requireMetadata: boolean,
  expectedContractId: string | null | undefined
): boolean {
  return requireMetadata || expectedContractId != null;
}

export function getNativeSwapQuoteInvalidReason({
  quote,
  amount,
  inputTokenContractId,
  outputTokenContractId,
  now,
  requireMetadata = false,
}: NativeSwapQuoteValidityParams): string | null {
  if (!quote) {
    return REQUIRED_QUOTE_ERROR;
  }
  if (quoteIsExpired(quote, now)) {
    return EXPIRED_QUOTE_ERROR;
  }

  const trimmedAmount = amount.trim();
  if (
    shouldValidateQuoteField(requireMetadata, quote.amountIn) &&
    quote.amountIn?.trim() !== trimmedAmount
  ) {
    return STALE_QUOTE_ERROR;
  }
  if (
    shouldValidateTokenField(requireMetadata, inputTokenContractId) &&
    quote.tokenInContractId !== inputTokenContractId
  ) {
    return STALE_QUOTE_ERROR;
  }
  if (
    shouldValidateTokenField(requireMetadata, outputTokenContractId) &&
    quote.tokenOutContractId !== outputTokenContractId
  ) {
    return STALE_QUOTE_ERROR;
  }
  if (isPositiveAmount(amount) && quote.amountOutMinBaseUnits === '0') {
    return ZERO_MIN_OUTPUT_ERROR;
  }

  return null;
}

export function createNativeSwapController<TQuote extends NativeSwapQuote = NativeSwapQuote>(
  deps: NativeSwapControllerDeps<TQuote>
): NativeSwapController<TQuote> {
  const now = deps.now ?? Date.now;
  const debounceMs = deps.debounceMs ?? QUOTE_DEBOUNCE_MS;
  let quoteTimer: ReturnType<typeof setTimeout> | null = null;
  let quoteRequestId = 0;
  let state: NativeSwapControllerState<TQuote> = {
    amount: '',
    slippage: DEFAULT_SLIPPAGE_PERCENT,
    status: 'idle',
    quote: null,
    error: null,
    isQuoteLoading: false,
  };

  const notify = () => {
    deps.onStateChange?.(cloneState(state));
  };

  const setState = (next: Partial<NativeSwapControllerState<TQuote>>) => {
    state = { ...state, ...next };
    notify();
  };

  const clearTimer = () => {
    if (quoteTimer) {
      clearTimeout(quoteTimer);
      quoteTimer = null;
    }
  };

  const runQuote = async (requestId: number): Promise<void> => {
    if (!isPositiveAmount(state.amount)) {
      setState({
        status: 'idle',
        quote: null,
        error: null,
        isQuoteLoading: false,
      });
      return;
    }

    const invalidAmountReason = amountValidationReason(deps, state.amount);
    if (invalidAmountReason) {
      setState({
        status: 'error',
        quote: null,
        error: invalidAmountReason,
        isQuoteLoading: false,
      });
      return;
    }

    const amount = state.amount;
    const slippage = state.slippage;
    setState({
      status: 'quoting',
      quote: null,
      error: null,
      isQuoteLoading: true,
    });

    try {
      const quote = await deps.getSwapQuote({ amount, slippage });
      if (requestId !== quoteRequestId) {
        return;
      }
      setState({
        status: 'ready',
        quote,
        error: null,
        isQuoteLoading: false,
      });
    } catch (error) {
      if (requestId !== quoteRequestId) {
        return;
      }
      setState({
        status: 'error',
        quote: null,
        error: errorMessage(error),
        isQuoteLoading: false,
      });
    }
  };

  const scheduleQuote = () => {
    clearTimer();
    const requestId = ++quoteRequestId;
    if (!isPositiveAmount(state.amount)) {
      setState({
        status: 'idle',
        quote: null,
        error: null,
        isQuoteLoading: false,
      });
      return;
    }

    const invalidAmountReason = amountValidationReason(deps, state.amount);
    if (invalidAmountReason) {
      setState({
        status: 'error',
        quote: null,
        error: invalidAmountReason,
        isQuoteLoading: false,
      });
      return;
    }

    setState({
      status: 'quoting',
      quote: null,
      error: null,
      isQuoteLoading: true,
    });

    quoteTimer = setTimeout(() => {
      quoteTimer = null;
      void runQuote(requestId);
    }, debounceMs);
  };

  const flushQuote = async () => {
    clearTimer();
    const requestId = ++quoteRequestId;
    await runQuote(requestId);
  };

  return {
    getState: () => cloneState(state),
    setAmount: async (amount: string) => {
      state = { ...state, amount };
      scheduleQuote();
    },
    setSlippage: async (slippage: number) => {
      state = { ...state, slippage };
      scheduleQuote();
    },
    refreshQuote: async () => {
      scheduleQuote();
    },
    flushQuote,
    execute: async () => {
      const invalidAmountReason = amountValidationReason(deps, state.amount);
      if (invalidAmountReason) {
        setState({
          status: 'error',
          error: invalidAmountReason,
          isQuoteLoading: false,
        });
        throw new Error(invalidAmountReason);
      }

      const quote = state.quote;
      const invalidReason = getNativeSwapQuoteInvalidReason({
        quote,
        amount: state.amount,
        now: now(),
      });
      if (invalidReason) {
        setState({
          status: 'error',
          error: invalidReason,
          isQuoteLoading: false,
        });
        throw new Error(invalidReason);
      }
      if (!quote) {
        throw new Error(REQUIRED_QUOTE_ERROR);
      }

      setState({ status: 'signing', error: null });
      try {
        const result = await deps.executeSwapTransaction(quote, {
          amount: state.amount,
          quote,
          setStatus: (status) => setState({ status }),
        });
        clearTimer();
        setState({
          amount: '',
          status: 'success',
          quote: null,
          error: null,
          isQuoteLoading: false,
        });
        return result;
      } catch (error) {
        setState({
          status: 'error',
          error: errorMessage(error),
          isQuoteLoading: false,
        });
        throw error;
      }
    },
    reset: () => {
      clearTimer();
      quoteRequestId += 1;
      setState({
        amount: '',
        slippage: DEFAULT_SLIPPAGE_PERCENT,
        status: 'idle',
        quote: null,
        error: null,
        isQuoteLoading: false,
      });
    },
    dispose: clearTimer,
  };
}

function toTokenId(token: SwapToken | string | null): string | null {
  if (!token) {
    return null;
  }
  return typeof token === 'string' ? token : token.contractId;
}

function getDefaultInputToken(tokens: SwapToken[]): SwapToken | null {
  return tokens.find((token) => token.symbol === 'KOIN') ?? tokens[0] ?? null;
}

function getDefaultOutputToken(tokens: SwapToken[], inputToken: SwapToken | null): SwapToken | null {
  const vhp = tokens.find((token) => token.symbol === 'VHP');
  if (vhp && vhp.contractId !== inputToken?.contractId) {
    return vhp;
  }
  return tokens.find((token) => token.contractId !== inputToken?.contractId) ?? null;
}

function getSelectedToken(tokens: SwapToken[], tokenId: string | null): SwapToken | null {
  if (!tokenId) {
    return null;
  }
  return tokens.find((token) => token.contractId === tokenId) ?? null;
}

function getTokenScopeKeyForNetwork(
  network: Pick<NetworkConfig, 'isTestnet'>,
  address: string
): string {
  return `${network.isTestnet ? 'harbinger' : 'mainnet'}:${address}`;
}

export function getScopedSwapTokens({
  hasHydrated,
  networkMode,
  address,
  cacheKey,
  tokens,
}: ScopedSwapTokensParams): Token[] {
  if (!hasHydrated || !address) {
    return [];
  }

  const expectedCacheKey = `${networkMode}:${address}`;
  return cacheKey === expectedCacheKey ? tokens : [];
}

function getKoinosStoreModule(): KoinosStoreModule {
  return require<KoinosStoreModule>('../stores/koinosStore');
}

function getTokenStoreModule(): TokenStoreModule {
  return require<TokenStoreModule>('../stores/tokenStore');
}

function getWalletStoreModule(): WalletStoreModule {
  return require<WalletStoreModule>('../stores/walletStore');
}

export async function ensureProviderForActiveNetwork(): Promise<Provider> {
  const { useKoinosStore } = getKoinosStoreModule();
  const activeNetwork = getActiveNetworkConfig();
  let { provider, isInitialized, initialize, networkChainId } = useKoinosStore.getState();
  if (!provider || !isInitialized || networkChainId !== activeNetwork.chainId) {
    await initialize();
    ({ provider, networkChainId } = useKoinosStore.getState());
  }
  if (!provider || networkChainId !== activeNetwork.chainId) {
    throw new Error('Provider not initialized');
  }
  return provider;
}

export async function ensureSwapTokenScopeForActiveNetwork(
  address: string | null | undefined
): Promise<void> {
  if (!address) {
    return;
  }

  const tokenStore = getTokenStoreModule().useTokenStore.getState();
  const expectedCacheKey = getTokenScopeKeyForNetwork(getActiveNetworkConfig(), address);

  if (tokenStore.cacheKey === expectedCacheKey && tokenStore.isInitialized) {
    return;
  }

  await tokenStore.initialize(address);
}

function createTemporarySigner(privateKey: string, provider: Provider): Signer {
  if (privateKey.length === 64) {
    return new Signer({ privateKey, provider });
  }

  const signer = Signer.fromWif(privateKey);
  signer.provider = provider;
  return signer;
}

function getSwapInputAmountInvalidReason(amount: string, inputToken: SwapToken | null): string | null {
  if (!inputToken || !isPositiveAmount(amount)) {
    return null;
  }

  try {
    return getSwapInputBalanceInvalidReason(amount, inputToken);
  } catch (error) {
    if (error instanceof SwapError) {
      return error.message;
    }
    throw error;
  }
}

function mapExecutionStatus(status: SwapExecutionStatus): NativeSwapStatus {
  if (status === 'estimating_mana') {
    return 'building';
  }
  if (status === 'confirmed') {
    return 'confirming';
  }
  return status;
}

export function useNativeSwap(): UseNativeSwapResult {
  const { useWalletStore } = getWalletStoreModule();
  const { useTokenStore } = getTokenStoreModule();
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const walletState = useWalletStore();
  const tokenState = useTokenStore();
  const [inputTokenId, setInputTokenId] = useState<string | null>(null);
  const [outputTokenId, setOutputTokenId] = useState<string | null>(null);
  const listenerRef = useRef<(state: NativeSwapControllerState<SwapQuote>) => void>(() => undefined);
  const latestRef = useRef<{
    inputToken: SwapToken | null;
    outputToken: SwapToken | null;
    tokens: SwapToken[];
  }>({
    inputToken: null,
    outputToken: null,
    tokens: [],
  });
  const controllerRef = useRef<NativeSwapController<SwapQuote> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createNativeSwapController<SwapQuote>({
      now: Date.now,
      debounceMs: QUOTE_DEBOUNCE_MS,
      onStateChange: (nextState) => listenerRef.current(nextState),
      validateAmount: (amount) => {
        const { inputToken } = latestRef.current;
        return getSwapInputAmountInvalidReason(amount, inputToken);
      },
      getSwapQuote: async ({ amount, slippage }) => {
        const swapUnavailableMessage = getSwapUnavailableMessage(getActiveNetworkConfig());
        if (swapUnavailableMessage) {
          throw new Error(swapUnavailableMessage);
        }

        const provider = await ensureProviderForActiveNetwork();
        const { inputToken, outputToken, tokens } = latestRef.current;
        if (!inputToken || !outputToken) {
          throw new Error('Select two tokens before quoting');
        }
        if (inputToken.contractId === outputToken.contractId) {
          throw new Error('Cannot swap the same token');
        }

        return swapQuoteService.getSwapQuote({
          provider,
          tokenIn: inputToken,
          tokenOut: outputToken,
          amountIn: amount,
          slippagePercent: slippage,
          allTokens: tokens,
        });
      },
      executeSwapTransaction: async (quote, context) => {
        const swapUnavailableMessage = getSwapUnavailableMessage(getActiveNetworkConfig());
        if (swapUnavailableMessage) {
          throw new Error(swapUnavailableMessage);
        }

        const { inputToken, outputToken, tokens } = latestRef.current;
        if (!inputToken || !outputToken) {
          throw new Error('Select two tokens before swapping');
        }

        const invalidReason = getNativeSwapQuoteInvalidReason({
          quote,
          amount: context.amount,
          inputTokenContractId: inputToken.contractId,
          outputTokenContractId: outputToken.contractId,
          now: Date.now(),
          requireMetadata: true,
        });
        if (invalidReason) {
          throw new Error(invalidReason);
        }

        const provider = await ensureProviderForActiveNetwork();
        const privateKey = await getWalletStoreModule().useWalletStore.getState().getPrivateKey();
        if (!privateKey) {
          throw new Error('Authentication required to swap');
        }

        const signer = createTemporarySigner(privateKey, provider);
        const fromAddress = signer.getAddress();
        const mana = await getKoinosStoreModule().useKoinosStore.getState().getMana(fromAddress);
        const result = await executeSwapTransactionService({
          provider,
          signer,
          quote,
          tokenIn: inputToken,
          tokenOut: outputToken,
          allTokens: tokens,
          maxRc: Number(mana.max) || undefined,
          availableRc: Number(mana.available) || undefined,
          onStatus: (status) => context.setStatus(mapExecutionStatus(status)),
        });

        const walletStore = getWalletStoreModule().useWalletStore.getState();
        const tokenStore = getTokenStoreModule().useTokenStore.getState();
        const balance = await getKoinosStoreModule().useKoinosStore.getState().getBalance(fromAddress);
        walletStore.updateBalance(balance);
        await Promise.all([
          tokenStore.refreshSingleBalance(fromAddress, inputToken.contractId),
          tokenStore.refreshSingleBalance(fromAddress, outputToken.contractId),
        ]);

        return result;
      },
    });
  }

  const controller = controllerRef.current;
  const [controllerState, setControllerState] = useState<NativeSwapControllerState<SwapQuote>>(
    () => controller.getState()
  );
  listenerRef.current = (nextState) => setControllerState(nextState);

  const tokens = useMemo(
    () => getScopedSwapTokens({
      hasHydrated,
      networkMode,
      address: walletState.address,
      cacheKey: tokenState.cacheKey,
      tokens: tokenState.tokens,
    }),
    [hasHydrated, networkMode, tokenState.cacheKey, tokenState.tokens, walletState.address]
  );
  const defaultInputToken = useMemo(() => getDefaultInputToken(tokens), [tokens]);
  const selectedInputToken = getSelectedToken(tokens, inputTokenId) ?? defaultInputToken;
  const defaultOutputToken = useMemo(
    () => getDefaultOutputToken(tokens, selectedInputToken),
    [tokens, selectedInputToken]
  );
  const selectedOutputToken = getSelectedToken(tokens, outputTokenId) ?? defaultOutputToken;
  const inputToken = selectedInputToken ?? null;
  const outputToken = selectedOutputToken?.contractId === inputToken?.contractId
    ? null
    : selectedOutputToken ?? null;

  latestRef.current = {
    inputToken,
    outputToken,
    tokens,
  };

  useEffect(() => {
    if (!hasHydrated || !walletState.address) {
      return;
    }

    ensureSwapTokenScopeForActiveNetwork(walletState.address).catch(() => undefined);
  }, [hasHydrated, networkMode, walletState.address]);

  useEffect(() => {
    if (!defaultInputToken) {
      setInputTokenId(null);
      return;
    }

    const currentInputStillExists = inputTokenId
      ? tokens.some((token) => token.contractId === inputTokenId)
      : false;
    if (!currentInputStillExists) {
      setInputTokenId(defaultInputToken.contractId);
    }
  }, [defaultInputToken, inputTokenId, tokens]);

  useEffect(() => {
    if (!inputToken) {
      setOutputTokenId(null);
      return;
    }

    const currentOutputStillValid = outputTokenId
      ? tokens.some(
        (token) => token.contractId === outputTokenId && token.contractId !== inputToken.contractId
      )
      : false;
    if (!currentOutputStillValid) {
      setOutputTokenId(defaultOutputToken?.contractId ?? null);
    }
  }, [defaultOutputToken, inputToken, outputTokenId, tokens]);

  useEffect(() => {
    if (isPositiveAmount(controller.getState().amount)) {
      void controller.refreshQuote();
    }
  }, [controller, inputToken?.contractId, outputToken?.contractId, tokens]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    controller.reset();
  }, [controller, hasHydrated, networkMode]);

  useEffect(() => () => controller.dispose(), [controller]);

  const invalidQuoteReason = getNativeSwapQuoteInvalidReason({
    quote: controllerState.quote,
    amount: controllerState.amount,
    inputTokenContractId: inputToken?.contractId,
    outputTokenContractId: outputToken?.contractId,
    now: Date.now(),
    requireMetadata: true,
  });
  const canSwap = Boolean(
    walletState.isWalletCreated &&
    walletState.address &&
    inputToken &&
    outputToken &&
    inputToken.contractId !== outputToken.contractId &&
    isPositiveAmount(controllerState.amount) &&
    !invalidQuoteReason &&
    !controllerState.isQuoteLoading &&
    controllerState.status === 'ready'
  );

  const setAmount = useCallback(
    (amount: string) => controller.setAmount(amount),
    [controller]
  );
  const setSlippage = useCallback(
    (slippage: number) => controller.setSlippage(slippage),
    [controller]
  );
  const refreshQuote = useCallback(
    () => controller.flushQuote(),
    [controller]
  );
  const execute = useCallback(
    () => controller.execute() as Promise<SwapExecutionResult>,
    [controller]
  );
  const reset = useCallback(() => controller.reset(), [controller]);
  const switchTokens = useCallback(() => {
    setInputTokenId(outputToken?.contractId ?? null);
    setOutputTokenId(inputToken?.contractId ?? null);
  }, [inputToken, outputToken]);

  return {
    availableTokens: tokens,
    amount: controllerState.amount,
    setAmount,
    slippage: controllerState.slippage,
    setSlippage,
    inputToken,
    outputToken,
    setInputToken: (token) => setInputTokenId(toTokenId(token)),
    setOutputToken: (token) => setOutputTokenId(toTokenId(token)),
    switchTokens,
    quote: controllerState.quote,
    status: controllerState.status,
    error: controllerState.error,
    isQuoteLoading: controllerState.isQuoteLoading,
    canSwap,
    refreshQuote,
    execute,
    reset,
  };
}
