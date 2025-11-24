/**
 * Convert Kondor ABI format to koilib-compatible format
 * Kondor uses hyphenated keys (read-only, entry-point)
 * koilib expects underscored keys (read_only, entry_point)
 */
export function convertKondorAbiToKoilib(kondorAbi: any) {
  const koilibAbi: any = {
    methods: {},
    events: kondorAbi.events || {},
    types: kondorAbi.types || {},
    koilib_types: kondorAbi.types || {} // koilib expects this
  };

  // Convert methods
  if (kondorAbi.methods) {
    for (const [methodName, method] of Object.entries(kondorAbi.methods)) {
      const convertedMethod: any = { ...method };

      // Convert hyphenated keys to underscored
      if ('read-only' in convertedMethod) {
        convertedMethod.read_only = convertedMethod['read-only'];
        delete convertedMethod['read-only'];
      }

      if ('entry-point' in convertedMethod) {
        // Parse hex string to number if needed
        const entryPoint = convertedMethod['entry-point'];
        convertedMethod.entry_point = typeof entryPoint === 'string' && entryPoint.startsWith('0x')
          ? parseInt(entryPoint, 16)
          : entryPoint;
        delete convertedMethod['entry-point'];
      }

      koilibAbi.methods[methodName] = convertedMethod;
    }
  }

  return koilibAbi;
}