import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// Dynamically import camera to handle missing native module gracefully
let CameraView: any = null;
let useCameraPermissions: any = null;
let cameraAvailable = false;

try {
  const expoCamera = require('expo-camera');
  CameraView = expoCamera.CameraView;
  useCameraPermissions = expoCamera.useCameraPermissions;
  cameraAvailable = true;
} catch (e) {
  console.log('[QRScanner] expo-camera not available:', e);
}

// Parsed QR data structure
export interface ParsedQRData {
  address: string;
  amount?: string;
  token?: string;
  memo?: string;
}

// Parse koinos: URI scheme or plain address
export function parseKoinosQR(data: string): ParsedQRData | null {
  if (!data || typeof data !== 'string') {
    return null;
  }

  const trimmed = data.trim();

  // Check for koinos: URI scheme
  // Format: koinos:ADDRESS?amount=X&token=SYMBOL&memo=TEXT
  if (trimmed.toLowerCase().startsWith('koinos:')) {
    try {
      const withoutScheme = trimmed.slice(7); // Remove 'koinos:'
      const [address, queryString] = withoutScheme.split('?');

      if (!address) {
        return null;
      }

      const result: ParsedQRData = { address };

      if (queryString) {
        const params = new URLSearchParams(queryString);
        const amount = params.get('amount');
        const token = params.get('token');
        const memo = params.get('memo');

        if (amount) result.amount = amount;
        if (token) result.token = token;
        if (memo) result.memo = memo;
      }

      return result;
    } catch {
      return null;
    }
  }

  // Plain address - Koinos addresses start with 1 and are 34 characters
  if (/^1[a-km-zA-HJ-NP-Z0-9]{25,34}$/.test(trimmed)) {
    return { address: trimmed };
  }

  return null;
}

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: ParsedQRData) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  // Only use camera permissions hook if camera is available
  const cameraPermissions = cameraAvailable && useCameraPermissions ? useCameraPermissions() : [null, () => {}];
  const [permission, requestPermission] = cameraPermissions;
  const [scanned, setScanned] = useState(false);

  // Reset scanned state when modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
    }
  }, [visible]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    const parsed = parseKoinosQR(data);
    if (parsed) {
      setScanned(true);
      onScan(parsed);
      onClose();
    } else {
      setScanned(true);
      Alert.alert(
        'Invalid QR Code',
        'This QR code does not contain a valid Koinos address.',
        [
          {
            text: 'Try Again',
            onPress: () => setScanned(false),
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: onClose,
          },
        ]
      );
    }
  };

  const renderContent = () => {
    // Camera not available (running in Expo Go or missing native module)
    if (!cameraAvailable || !CameraView) {
      return (
        <View style={styles.centered}>
          <Ionicons name="build-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.messageTitle}>Development Build Required</Text>
          <Text style={styles.messageText}>
            QR scanning requires a development build with native camera support.
          </Text>
          <Text style={styles.messageSubtext}>
            Run: eas build --profile development --platform ios
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => Linking.openURL('https://docs.expo.dev/develop/development-builds/introduction/')}
          >
            <Text style={styles.permissionButtonText}>Learn More</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.centered}>
          <Text style={styles.messageText}>Loading camera...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.messageText}>Camera access is required to scan QR codes</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        <View style={styles.overlay}>
          {/* Top overlay */}
          <View style={styles.overlaySection} />

          {/* Middle section with scanning frame */}
          <View style={styles.middleSection}>
            <View style={styles.overlaySection} />
            <View style={styles.scanFrame}>
              {/* Corner decorations */}
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <View style={styles.overlaySection} />
          </View>

          {/* Bottom overlay with instructions */}
          <View style={styles.overlaySection}>
            <Text style={styles.instructionText}>
              Align QR code within the frame
            </Text>
          </View>
        </View>
      </CameraView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Scan QR Code</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Camera / Content */}
        <View style={styles.cameraContainer}>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const SCAN_FRAME_SIZE = 280;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  messageTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  messageSubtext: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 24,
    backgroundColor: colors.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  permissionButton: {
    backgroundColor: colors.purple,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlaySection: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  middleSection: {
    flexDirection: 'row',
    height: SCAN_FRAME_SIZE,
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.purple,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  instructionText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 24,
  },
});
