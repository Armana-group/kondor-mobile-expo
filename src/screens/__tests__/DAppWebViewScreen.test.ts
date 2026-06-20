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
