// Minimal token ABI that avoids protobuf issues
// Based on the KOIN token contract interface

export const minimalTokenAbi = {
  methods: {
    balance_of: {
      entry_point: 1550980247, // 0x5c721497
      argument: "balance_of_arguments",
      return: "balance_of_result",
      read_only: true,
      default_output: { value: "0" }
    },
    transfer: {
      entry_point: 670398154, // 0x27f576ca
      argument: "transfer_arguments",
      return: "transfer_result",
      read_only: false,
      default_output: { value: true }
    },
    total_supply: {
      entry_point: 2967091508, // 0xb0da3934
      argument: "total_supply_arguments",
      return: "total_supply_result",
      read_only: true,
      default_output: { value: "0" }
    }
  },
  types: {
    nested: {
      balance_of_arguments: {
        fields: {
          owner: {
            type: "bytes",
            id: 1,
            rule: "required"
          }
        }
      },
      balance_of_result: {
        fields: {
          value: {
            type: "uint64",
            id: 1
          }
        }
      },
      transfer_arguments: {
        fields: {
          from: {
            type: "bytes",
            id: 1,
            rule: "required"
          },
          to: {
            type: "bytes",
            id: 2,
            rule: "required"
          },
          value: {
            type: "uint64",
            id: 3,
            rule: "required"
          }
        }
      },
      transfer_result: {
        fields: {
          value: {
            type: "bool",
            id: 1
          }
        }
      },
      total_supply_arguments: {
        fields: {}
      },
      total_supply_result: {
        fields: {
          value: {
            type: "uint64",
            id: 1
          }
        }
      }
    }
  }
};