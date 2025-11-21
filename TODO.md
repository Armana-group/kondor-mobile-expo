# Next Session TODO: Mana Checker Implementation

## Priority: HIGH - Blocks Transfers

### Current Blocker
Transfers fail with: `insufficient pending account resources` (code 104)
Account has depleted mana and needs to regenerate or we need to check before sending.

## Task: Add Mana Checker

### 1. Backend - Add getMana to koinosStore
**File:** `src/stores/koinosStore.ts`

```typescript
getMana: async (address: string) => Promise<{ current: string; max: string; percentage: number }> => {
  const { provider } = get();

  // Get current mana
  const rcResult = await provider.call('chain.get_account_rc', {
    account: address
  });

  // Get max mana (based on balance)
  const balance = await get().getBalance(address);
  const maxMana = utils.parseUnits(balance, 8); // Max mana = balance * 10^8

  const currentMana = rcResult.rc || '0';
  const percentage = (BigInt(currentMana) * 100n) / BigInt(maxMana);

  return {
    current: currentMana,
    max: maxMana,
    percentage: Number(percentage)
  };
}
```

### 2. UI - Display Mana in HomeScreen
**File:** `src/screens/HomeScreen.tsx`

Add after balance display:
```typescript
const [mana, setMana] = useState<number>(0);

// Fetch mana when balance is fetched
const fetchMana = async () => {
  const manaData = await getMana(address);
  setMana(manaData.percentage);
};

// Display
<View style={styles.manaContainer}>
  <Text style={styles.manaLabel}>Mana Available</Text>
  <Text style={styles.manaValue}>{mana}%</Text>
  <View style={styles.manaBar}>
    <View style={[styles.manaFill, { width: `${mana}%` }]} />
  </View>
</View>
```

### 3. UI - Check Mana Before Send
**File:** `src/screens/SendScreen.tsx`

Add validation:
```typescript
const TRANSFER_MANA_COST = 500000; // Estimated mana cost for transfer

const validateMana = async () => {
  const manaData = await getMana(address);

  if (BigInt(manaData.current) < BigInt(TRANSFER_MANA_COST)) {
    const timeToRegenerate = calculateRegenTime(
      BigInt(manaData.current),
      BigInt(TRANSFER_MANA_COST),
      BigInt(manaData.max)
    );

    Alert.alert(
      'Insufficient Mana',
      `Please wait ${timeToRegenerate} for mana to regenerate.`
    );
    return false;
  }
  return true;
};

// Call before handleSend
const handleSend = async () => {
  if (!validateForm()) return;
  if (!await validateMana()) return;

  // ... rest of send logic
};
```

### 4. Helper - Calculate Regeneration Time
**File:** `src/lib/utils.ts` (or create new file)

```typescript
export const calculateManaRegenTime = (
  current: bigint,
  required: bigint,
  max: bigint
): string => {
  if (current >= required) return 'now';

  const needed = required - current;
  const FULL_REGEN_TIME = 432000; // 5 days in seconds

  const secondsNeeded = Number(needed * BigInt(FULL_REGEN_TIME) / max);

  if (secondsNeeded < 60) return `${secondsNeeded} seconds`;
  if (secondsNeeded < 3600) return `${Math.ceil(secondsNeeded / 60)} minutes`;
  if (secondsNeeded < 86400) return `${Math.ceil(secondsNeeded / 3600)} hours`;
  return `${Math.ceil(secondsNeeded / 86400)} days`;
};
```

## Testing Checklist

- [ ] Mana displays correctly in HomeScreen
- [ ] Mana updates when balance refreshes
- [ ] SendScreen checks mana before allowing send
- [ ] Error message shows when insufficient mana
- [ ] Time estimate is accurate
- [ ] Send works when mana is sufficient
- [ ] Mana percentage calculation is correct

## Reference

Look at `../kondor` or `../kondor-mobile` for existing mana handling patterns.

## Expected Completion

This should take 1-2 hours to implement and test.

## Alternative: Wait for Mana

If you want to test immediately without implementing mana checker:
- Wait 30-60 minutes for mana to regenerate
- Try sending a very small amount (0.01 KOIN)
- Current balance: 4.7 KOIN
- Account: `13jqmvK2NF9yGCqUWSKjVH4msTqhRM96ac`
