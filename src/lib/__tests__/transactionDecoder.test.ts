import {
  decodeKnownOperation,
} from '../transactionDecoder';
import { KOINDX } from '../constants';

describe('transactionDecoder', () => {
  it('labels token approve operations for KoinDX periphery', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
        entry_point: KOINDX.ENTRY_POINTS.TOKEN_APPROVE,
        args: 'encoded-approve',
      },
    });

    expect(operation.title).toBe('approve');
    expect(operation.details).toContainEqual({
      label: 'Entry Point',
      value: 'approve',
    });
  });

  it('labels current KoinDX swap_tokens_in operations', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: KOINDX.PERIPHERY_CONTRACT,
        entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
        args: 'encoded-swap',
      },
    });

    expect(operation.title).toBe('swap_tokens_in');
    expect(operation.details).toContainEqual({
      label: 'Contract',
      value: 'KoinDX Periphery',
    });
  });

  it('keeps unknown operations explicit and inspectable', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '1UnknownContract',
        entry_point: 123,
        args: 'opaque',
      },
    });

    expect(operation.title).toBe('0x7b');
    expect(operation.details).toContainEqual({
      label: 'Contract',
      value: '1UnknownContract',
    });
    expect(operation.details).toContainEqual({
      label: 'Arguments',
      value: 'opaque',
    });
  });
});
