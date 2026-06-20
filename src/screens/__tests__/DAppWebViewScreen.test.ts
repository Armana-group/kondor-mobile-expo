describe('DAppWebViewScreen provider sendTransaction guard', () => {
  it('rejects broadcasts unless the dApp explicitly requests a non-broadcast dry run', async () => {
    const mockSendTransaction = jest.fn(async () => ({ receipt: 'should-not-send' }));
    const { handleWebViewProviderSendTransaction } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderSendTransaction(
        { sendTransaction: mockSendTransaction },
        { transaction: { operations: [] } }
      )
    ).rejects.toThrow(/approval|required|unsupported/i);

    await expect(
      handleWebViewProviderSendTransaction(
        { sendTransaction: mockSendTransaction },
        { transaction: { operations: [] }, broadcast: true }
      )
    ).rejects.toThrow(/approval|required|unsupported/i);

    expect(mockSendTransaction).not.toHaveBeenCalled();

    mockSendTransaction.mockResolvedValueOnce({ receipt: 'dry-run' });

    await expect(
      handleWebViewProviderSendTransaction(
        { sendTransaction: mockSendTransaction },
        { transaction: { operations: [] }, broadcast: false }
      )
    ).resolves.toEqual({ receipt: 'dry-run' });

    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockSendTransaction).toHaveBeenCalledWith({ operations: [] }, false);
  });
});

describe('DAppWebViewScreen generic RPC guards', () => {
  it('allows only safe read-only provider.call RPC methods', async () => {
    const mockCall = jest.fn(async () => ({ head_topology: { id: '0xabc' } }));
    const { handleWebViewProviderCall } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderCall(
        { call: mockCall },
        { method: 'chain.get_head_info', params: { payload: 'ok' } }
      )
    ).resolves.toEqual({ head_topology: { id: '0xabc' } });

    expect(mockCall).toHaveBeenCalledWith('chain.get_head_info', { payload: 'ok' });
  });

  it('rejects mutating provider.call RPC methods and never executes them', async () => {
    const mockCall = jest.fn(async () => ({ receipt: 'should-not-run' }));
    const { handleWebViewProviderCall } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderCall(
        { call: mockCall },
        { method: 'chain.submit_transaction', params: { transaction: { operations: [] } } }
      )
    ).rejects.toThrow(/read-only|approval|required|unsupported/i);

    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects provider.submitBlock instead of executing it in the background', async () => {
    const mockSubmitBlock = jest.fn(async () => ({ receipt: 'should-not-run' }));
    const { handleWebViewProviderSubmitBlock } = require('../dappWebViewProviderGuards');

    await expect(
      handleWebViewProviderSubmitBlock({ submitBlock: mockSubmitBlock }, { block: { header: {} } })
    ).rejects.toThrow(/approval|required|unsupported/i);

    expect(mockSubmitBlock).not.toHaveBeenCalled();
  });
});
