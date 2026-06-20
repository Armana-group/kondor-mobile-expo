import { KOINDX, KOINOS_TOKEN_CONTRACTS } from '../constants';
import { parseHistoryTransaction } from '../transactionHistoryParser';

const userAddress = '14AHKz8t2exampleWalletAddressXhQw';
const vUsdtContract = '12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh';

const tokens = new Map([
  [
    KOINOS_TOKEN_CONTRACTS.KOIN,
    {
      contractId: KOINOS_TOKEN_CONTRACTS.KOIN,
      symbol: 'KOIN',
      decimals: 8,
      icon: 'koin.png',
    },
  ],
  [
    vUsdtContract,
    {
      contractId: vUsdtContract,
      symbol: 'vUSDT',
      decimals: 6,
      icon: 'vusdt.png',
    },
  ],
]);

const getTokenByContractId = (contractId: string) => tokens.get(contractId);

describe('parseHistoryTransaction', () => {
  it('parses a native KoinDX swap operation as a swap history row for the input token', () => {
    const tx = parseHistoryTransaction(
      {
        seq_num: '42',
        block_height: 123456,
        trx: {
          transaction: {
            id: '0xswap',
            header: { payer: userAddress },
            operations: [
              {
                call_contract: {
                  contract_id: KOINOS_TOKEN_CONTRACTS.KOIN,
                  entry_point: KOINDX.ENTRY_POINTS.TOKEN_APPROVE,
                  args: {
                    owner: userAddress,
                    spender: KOINDX.PERIPHERY_CONTRACT,
                    value: '100000000',
                  },
                },
              },
              {
                call_contract: {
                  contract_id: KOINDX.PERIPHERY_CONTRACT,
                  entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
                  args: {
                    from: userAddress,
                    receiver: userAddress,
                    amount_in: '100000000',
                    amount_out_min: '995000',
                    path: ['koin', vUsdtContract],
                  },
                },
              },
            ],
          },
          receipt: {
            rc_used: '50000000',
          },
        },
      },
      userAddress,
      getTokenByContractId
    );

    expect(tx).toMatchObject({
      id: '0xswap',
      type: 'swap',
      amount: '1',
      token: KOINOS_TOKEN_CONTRACTS.KOIN,
      tokenSymbol: 'KOIN',
      tokenIcon: 'koin.png',
      from: userAddress,
      to: userAddress,
      blockHeight: 123456,
      fee: '0.5',
      payer: userAddress,
      seqNum: '42',
      swapTokenOut: vUsdtContract,
      swapTokenOutSymbol: 'vUSDT',
      swapAmountOutMin: '0.995',
      swapRoute: 'KOIN -> vUSDT',
    });
  });
});
