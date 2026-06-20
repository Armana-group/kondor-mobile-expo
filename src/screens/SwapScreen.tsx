import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { useNativeSwap } from '../hooks/useNativeSwap';
import type { SwapQuote } from '../lib/swapQuote';
import { useTokenStore, type Token } from '../stores/tokenStore';
import type { SwapToken } from '../lib/swapMath';
import colors from '../theme/colors';

type SwapSide = 'input' | 'output';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1, 2];
const DECIMAL_INPUT_RE = /^\d*\.?\d*$/;
const DECIMAL_AMOUNT_RE = /^\d+(?:\.\d+)?$/;
const TOKEN_SELECTOR_WIDTH = 132;
const DISPLAY_AMOUNT_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 8,
});

function isPositiveAmount(amount: string): boolean {
  const trimmed = amount.trim();
  return DECIMAL_AMOUNT_RE.test(trimmed) && Number(trimmed) > 0;
}

function formatDisplayAmount(value?: string | null): string {
  if (!value) {
    return '0';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return DISPLAY_AMOUNT_FORMATTER.format(numeric);
}

function formatMaxAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  return value
    .toFixed(Math.min(decimals, 8))
    .replace(/\.?0+$/, '');
}

function formatPercent(value: number): string {
  const percent = value * 100;
  const digits = percent > 0 && percent < 0.01 ? 4 : 2;
  return `${percent.toFixed(digits)}%`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Swap failed';
}

function isNoLiquidityError(error: string | null): boolean {
  if (!error) {
    return false;
  }

  return /no liquidity|no pair|could not find/i.test(error);
}

interface TokenIconProps {
  token: Pick<SwapToken, 'icon' | 'symbol'>;
  size: number;
}

const TokenIcon = ({ token, size }: TokenIconProps) => {
  if (token.icon) {
    return (
      <Image
        source={{ uri: token.icon }}
        style={[
          styles.tokenIconImage,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        defaultSource={require('../../assets/icon.png')}
      />
    );
  }

  return (
    <View
      style={[
        styles.tokenIconFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={styles.tokenIconFallbackText}>
        {token.symbol.charAt(0)}
      </Text>
    </View>
  );
};

interface TokenSelectorProps {
  side: SwapSide;
  token: SwapToken | null;
  onOpen: (side: SwapSide) => void;
}

const TokenSelector = ({ side, token, onOpen }: TokenSelectorProps) => (
  <TouchableOpacity
    style={styles.tokenSelector}
    onPress={() => onOpen(side)}
    activeOpacity={0.75}
  >
    {token ? (
      <>
        <TokenIcon token={token} size={34} />
        <Text
          style={styles.tokenSelectorSymbol}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {token.symbol}
        </Text>
      </>
    ) : (
      <Text
        style={styles.tokenSelectorPlaceholder}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        Select
      </Text>
    )}
    <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
  </TouchableOpacity>
);

interface SwapPanelProps {
  side: SwapSide;
  label: string;
  token: SwapToken | null;
  value: string;
  editable: boolean;
  onAmountChange: (value: string) => void;
  onMaxPress: () => void;
  onOpenTokenPicker: (side: SwapSide) => void;
}

const SwapPanel = ({
  side,
  label,
  token,
  value,
  editable,
  onAmountChange,
  onMaxPress,
  onOpenTokenPicker,
}: SwapPanelProps) => (
  <View style={styles.swapPanel}>
    <View style={styles.panelHeader}>
      <Text style={styles.panelLabel}>{label}</Text>
      {side === 'input' && (
        <TouchableOpacity
          style={styles.maxButton}
          onPress={onMaxPress}
          disabled={!token}
          activeOpacity={0.75}
        >
          <Text style={styles.maxButtonText}>Max</Text>
        </TouchableOpacity>
      )}
    </View>

    <View style={styles.amountRow}>
      <TextInput
        style={[
          styles.amountInput,
          !editable && styles.amountInputReadonly,
        ]}
        value={value}
        onChangeText={onAmountChange}
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        editable={editable}
      />
      <TokenSelector side={side} token={token} onOpen={onOpenTokenPicker} />
    </View>

    <Text
      style={styles.balanceText}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      Balance: {formatDisplayAmount(token?.balance)} {token?.symbol ?? ''}
    </Text>
  </View>
);

interface QuoteDetailsProps {
  quote: SwapQuote | null;
  inputToken: SwapToken | null;
  outputToken: SwapToken | null;
  routeDisplay: string;
  quoteExpiresIn: number;
}

const QuoteDetails = ({
  quote,
  inputToken,
  outputToken,
  routeDisplay,
  quoteExpiresIn,
}: QuoteDetailsProps) => {
  if (!quote || !inputToken || !outputToken) {
    return null;
  }

  return (
    <View style={styles.quotePanel}>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Rate</Text>
        <Text
          style={styles.detailValue}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          1 {inputToken.symbol} = {formatDisplayAmount(String(quote.executionPrice))} {outputToken.symbol}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Minimum received</Text>
        <Text
          style={styles.detailValue}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {formatDisplayAmount(quote.amountOutMin)} {outputToken.symbol}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Price impact</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {formatPercent(quote.priceImpact)}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Fee</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {formatPercent(quote.fee)}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Route</Text>
        <Text
          style={styles.detailValue}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {routeDisplay}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Quote expires</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {quoteExpiresIn}s
        </Text>
      </View>
    </View>
  );
};

interface SlippageSelectorProps {
  slippage: number;
  onSetSlippage: (slippage: number) => void;
}

const SlippageSelector = ({ slippage, onSetSlippage }: SlippageSelectorProps) => (
  <View style={styles.slippageSection}>
    <Text style={styles.sectionLabel}>Slippage</Text>
    <View style={styles.slippageRow}>
      {SLIPPAGE_PRESETS.map((preset) => {
        const isSelected = slippage === preset;
        return (
          <TouchableOpacity
            key={preset}
            style={[
              styles.slippageButton,
              isSelected && styles.slippageButtonSelected,
            ]}
            onPress={() => onSetSlippage(preset)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.slippageButtonText,
                isSelected && styles.slippageButtonTextSelected,
              ]}
            >
              {preset}%
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

interface TokenPickerRowProps {
  item: Token;
  isSelected: boolean;
  onSelect: (token: Token) => void;
}

const TokenPickerRow = React.memo(({
  item,
  isSelected,
  onSelect,
}: TokenPickerRowProps) => (
  <TouchableOpacity
    style={[
      styles.tokenPickerItem,
      isSelected && styles.tokenPickerItemSelected,
    ]}
    onPress={() => onSelect(item)}
    activeOpacity={0.75}
  >
    <View style={styles.tokenPickerIcon}>
      <TokenIcon token={item} size={44} />
    </View>
    <View style={styles.tokenPickerInfo}>
      <Text
        style={styles.tokenPickerName}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.name}
      </Text>
      <Text
        style={styles.tokenPickerSymbol}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.symbol}
      </Text>
    </View>
    <View style={styles.tokenPickerBalance}>
      <Text
        style={styles.tokenPickerBalanceText}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {formatDisplayAmount(item.balance)}
      </Text>
    </View>
    {isSelected && (
      <Ionicons name="checkmark-circle" size={24} color={colors.purple} />
    )}
  </TouchableOpacity>
));
TokenPickerRow.displayName = 'TokenPickerRow';

const TokenPickerSeparator = () => <View style={styles.tokenPickerSeparator} />;

const EmptyTokenList = () => (
  <View style={styles.emptyTokenList}>
    <Text style={styles.emptyTokenListText}>No tokens available</Text>
  </View>
);

interface TokenPickerModalProps {
  side: SwapSide | null;
  tokens: Token[];
  selectedToken: SwapToken | null;
  onClose: () => void;
  onSelect: (token: Token) => void;
}

const TokenPickerModal = ({
  side,
  tokens,
  selectedToken,
  onClose,
  onSelect,
}: TokenPickerModalProps) => {
  const renderItem = useCallback(
    ({ item }: { item: Token }) => (
      <TokenPickerRow
        item={item}
        isSelected={selectedToken?.contractId === item.contractId}
        onSelect={onSelect}
      />
    ),
    [onSelect, selectedToken?.contractId]
  );

  return (
    <Modal
      visible={side !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            Select {side === 'input' ? 'pay' : 'receive'} token
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={tokens}
          keyExtractor={(item) => item.contractId}
          renderItem={renderItem}
          ItemSeparatorComponent={TokenPickerSeparator}
          ListEmptyComponent={EmptyTokenList}
          contentContainerStyle={styles.tokenPickerList}
        />
      </View>
    </Modal>
  );
};

export const SwapScreen = () => {
  const {
    amount,
    setAmount,
    slippage,
    setSlippage,
    inputToken,
    outputToken,
    setInputToken,
    setOutputToken,
    switchTokens,
    quote,
    status,
    error,
    isQuoteLoading,
    canSwap,
    refreshQuote,
    execute,
  } = useNativeSwap();
  const { tokens } = useTokenStore();
  const [pickerSide, setPickerSide] = useState<SwapSide | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!quote) {
      return undefined;
    }

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote]);

  const quoteExpiresIn = quote
    ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))
    : 0;
  const hasSwapInputs = Boolean(
    isPositiveAmount(amount) &&
    inputToken &&
    outputToken &&
    inputToken.contractId !== outputToken.contractId
  );
  const isQuoteExpired = Boolean(quote && quoteExpiresIn <= 0);
  const selectedPickerToken = pickerSide === 'input' ? inputToken : outputToken;
  const routeDisplay = useMemo(() => {
    if (!quote) {
      return '';
    }

    return quote.route.map((routeToken) => {
      if (routeToken === 'koin') {
        return 'KOIN';
      }
      if (routeToken === 'vhp') {
        return 'VHP';
      }
      return tokens.find((token) => token.contractId === routeToken)?.symbol ?? routeToken;
    }).join(' -> ');
  }, [quote, tokens]);

  const isTransactionPending = status === 'building'
    || status === 'signing'
    || status === 'broadcasting'
    || status === 'confirming';
  const primaryButtonTitle = useMemo(() => {
    if (status === 'building') {
      return 'Building transaction...';
    }
    if (status === 'signing') {
      return 'Signing...';
    }
    if (status === 'broadcasting' || status === 'confirming') {
      return 'Broadcasting...';
    }
    if (!isPositiveAmount(amount)) {
      return 'Enter amount';
    }
    if (!inputToken || !outputToken || inputToken.contractId === outputToken.contractId) {
      return 'Select different tokens';
    }
    if (isQuoteLoading || status === 'quoting') {
      return 'Fetching quote...';
    }
    if (isQuoteExpired) {
      return 'Refresh quote';
    }
    if (isNoLiquidityError(error)) {
      return 'No liquidity for this pair';
    }
    return 'Review swap';
  }, [amount, error, inputToken, isQuoteExpired, isQuoteLoading, outputToken, status]);

  const canRefreshExpiredQuote = isQuoteExpired && hasSwapInputs && !isQuoteLoading;
  const isPrimaryDisabled = isTransactionPending
    || isQuoteLoading
    || (!canSwap && !canRefreshExpiredQuote)
    || (!quote && !canRefreshExpiredQuote);

  const handleAmountChange = useCallback((value: string) => {
    if (!DECIMAL_INPUT_RE.test(value)) {
      return;
    }

    void setAmount(value);
  }, [setAmount]);

  const handleMaxPress = useCallback(() => {
    if (!inputToken) {
      return;
    }

    const balance = Number(inputToken.balance);
    const maxAmount = inputToken.symbol === 'KOIN'
      ? Math.max(0, balance - 0.01)
      : balance;
    void setAmount(formatMaxAmount(maxAmount, inputToken.decimals));
  }, [inputToken, setAmount]);

  const handleSwitchTokens = useCallback(() => {
    switchTokens();
    void setAmount('');
  }, [setAmount, switchTokens]);

  const handleTokenSelect = useCallback((token: Token) => {
    if (pickerSide === 'input') {
      if (outputToken?.contractId === token.contractId) {
        setOutputToken(inputToken);
      }
      setInputToken(token);
    }

    if (pickerSide === 'output') {
      if (inputToken?.contractId === token.contractId) {
        setInputToken(outputToken);
      }
      setOutputToken(token);
    }

    setPickerSide(null);
  }, [inputToken, outputToken, pickerSide, setInputToken, setOutputToken]);

  const handleConfirmSwap = useCallback(async () => {
    try {
      const result = await execute();
      Alert.alert(
        'Swap Submitted',
        `Transaction ID:\n${result.transactionId}`
      );
    } catch (swapError) {
      Alert.alert('Swap Failed', getErrorMessage(swapError));
    }
  }, [execute]);

  const handleRefreshQuote = useCallback(() => {
    void refreshQuote();
  }, [refreshQuote]);

  const handleReviewSwap = useCallback(() => {
    if (!quote || !inputToken || !outputToken || !canSwap) {
      return;
    }

    Alert.alert(
      'Review Swap',
      [
        `Pay: ${formatDisplayAmount(amount)} ${inputToken.symbol}`,
        `Receive: ${formatDisplayAmount(quote.amountOut)} ${outputToken.symbol}`,
        `Minimum received: ${formatDisplayAmount(quote.amountOutMin)} ${outputToken.symbol}`,
        `Route: ${routeDisplay}`,
        `Price impact: ${formatPercent(quote.priceImpact)}`,
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Swap', onPress: handleConfirmSwap },
      ]
    );
  }, [amount, canSwap, handleConfirmSwap, inputToken, outputToken, quote, routeDisplay]);

  const handlePrimaryPress = useCallback(() => {
    if (canRefreshExpiredQuote) {
      handleRefreshQuote();
      return;
    }

    handleReviewSwap();
  }, [canRefreshExpiredQuote, handleRefreshQuote, handleReviewSwap]);

  const openTokenPicker = useCallback((side: SwapSide) => {
    setPickerSide(side);
  }, []);

  const closeTokenPicker = useCallback(() => {
    setPickerSide(null);
  }, []);

  const handleSetSlippage = useCallback((preset: number) => {
    void setSlippage(preset);
  }, [setSlippage]);

  return (
    <Screen contentContainerStyle={styles.screenContent}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Swap</Text>
          {isQuoteLoading && (
            <View style={styles.quoteLoadingPill}>
              <Ionicons name="time-outline" size={14} color={colors.purple} />
              <Text style={styles.quoteLoadingText}>Quote</Text>
            </View>
          )}
        </View>

        <SwapPanel
          side="input"
          label="Pay"
          token={inputToken}
          value={amount}
          editable
          onAmountChange={handleAmountChange}
          onMaxPress={handleMaxPress}
          onOpenTokenPicker={openTokenPicker}
        />

        <View style={styles.switchContainer}>
          <TouchableOpacity
            style={styles.switchButton}
            onPress={handleSwitchTokens}
            disabled={!inputToken || !outputToken}
            activeOpacity={0.75}
          >
            <Ionicons name="swap-vertical" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <SwapPanel
          side="output"
          label="Receive"
          token={outputToken}
          value={quote?.amountOut ?? ''}
          editable={false}
          onAmountChange={handleAmountChange}
          onMaxPress={handleMaxPress}
          onOpenTokenPicker={openTokenPicker}
        />

        {error && !isQuoteLoading && (
          <View style={styles.errorPanel}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <QuoteDetails
          quote={quote}
          inputToken={inputToken}
          outputToken={outputToken}
          routeDisplay={routeDisplay}
          quoteExpiresIn={quoteExpiresIn}
        />

        <SlippageSelector
          slippage={slippage}
          onSetSlippage={handleSetSlippage}
        />

        <Button
          title={primaryButtonTitle}
          onPress={handlePrimaryPress}
          disabled={isPrimaryDisabled}
          style={styles.primaryButton}
        />
      </View>

      <TokenPickerModal
        side={pickerSide}
        tokens={tokens}
        selectedToken={selectedPickerToken}
        onClose={closeTokenPicker}
        onSelect={handleTokenSelect}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  quoteLoadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.purpleLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  quoteLoadingText: {
    marginLeft: 4,
    color: colors.purple,
    fontSize: 12,
    fontWeight: '600',
  },
  swapPanel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  panelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  maxButton: {
    backgroundColor: colors.elevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  maxButtonText: {
    color: colors.purple,
    fontSize: 12,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    paddingVertical: 4,
    paddingRight: 12,
  },
  amountInputReadonly: {
    color: colors.textSecondary,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    borderRadius: 999,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 10,
    width: TOKEN_SELECTOR_WIDTH,
    flexShrink: 0,
  },
  tokenSelectorSymbol: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    marginLeft: 8,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  tokenSelectorPlaceholder: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    paddingLeft: 4,
  },
  tokenIconImage: {
    backgroundColor: colors.elevated,
  },
  tokenIconFallback: {
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenIconFallbackText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  balanceText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 12,
    minWidth: 0,
  },
  switchContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  switchButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.purple,
    borderWidth: 4,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: 13,
    marginLeft: 8,
    lineHeight: 18,
  },
  quotePanel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    marginLeft: 16,
  },
  slippageSection: {
    marginTop: 18,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  slippageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slippageButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    marginRight: 8,
  },
  slippageButtonSelected: {
    backgroundColor: colors.purpleLight,
    borderColor: colors.purple,
  },
  slippageButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  slippageButtonTextSelected: {
    color: colors.purple,
  },
  primaryButton: {
    marginTop: 22,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  tokenPickerList: {
    padding: 16,
  },
  tokenPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 12,
    padding: 14,
  },
  tokenPickerItemSelected: {
    borderColor: colors.purple,
  },
  tokenPickerIcon: {
    marginRight: 12,
    flexShrink: 0,
  },
  tokenPickerInfo: {
    flex: 1,
    minWidth: 0,
  },
  tokenPickerName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 0,
  },
  tokenPickerSymbol: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    minWidth: 0,
  },
  tokenPickerBalance: {
    marginRight: 12,
    maxWidth: 112,
    flexShrink: 1,
  },
  tokenPickerBalanceText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'right',
  },
  tokenPickerSeparator: {
    height: 8,
  },
  emptyTokenList: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTokenListText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
