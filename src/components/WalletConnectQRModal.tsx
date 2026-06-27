/**
 * WalletConnectQRModal
 *
 * QR scanner specifically for WalletConnect URIs.
 * Used in the Apps screen to connect to dApps via WalletConnect.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticFeedback } from '../lib/haptics';
import { isWalletConnectUri } from './QRScannerModal';
import { wcLogger } from '../lib/logger';
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
  wcLogger.debug('expo-camera not available:', e);
}

interface WalletConnectQRModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (wcUri: string) => void;
}

export const WalletConnectQRModal: React.FC<WalletConnectQRModalProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  const cameraPermissions = cameraAvailable && useCameraPermissions ? useCameraPermissions() : [null, () => {}];
  const [permission, requestPermission] = cameraPermissions;
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setProcessing(false);
    }
  }, [visible]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing) return;

    // Check if it's a WalletConnect URI
    if (isWalletConnectUri(data)) {
      setScanned(true);
      setProcessing(true);
      HapticFeedback.success();

      // Small delay to show processing state
      setTimeout(() => {
        onScan(data);
        onClose();
      }, 300);
    } else {
      HapticFeedback.error();
      setScanned(true);
      Alert.alert(
        'Invalid QR Code',
        'This QR code is not a valid WalletConnect connection. Please scan a WalletConnect QR code from a dApp.',
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
    // Camera not available
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
          <Text style={styles.messageText}>Camera access is required to scan WalletConnect QR codes</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (processing) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.messageText}>Connecting...</Text>
        </View>
      );
    }

    return (
      <View style={styles.cameraWrapper}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        />
        {/* Overlay */}
        <View style={styles.overlay}>
          <View style={styles.overlaySection} />
          <View style={styles.middleSection}>
            <View style={styles.overlaySection} />
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <View style={styles.overlaySection} />
          </View>
          <View style={styles.overlaySection}>
            <View style={styles.instructionContainer}>
              <Ionicons name="link" size={20} color="#FFFFFF" style={styles.instructionIcon} />
              <Text style={styles.instructionText}>
                Scan a WalletConnect QR code
              </Text>
            </View>
            <Text style={styles.instructionSubtext}>
              Open a dApp in your browser and click "Connect Wallet"
            </Text>
          </View>
        </View>
      </View>
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
          <Text style={styles.title}>WalletConnect</Text>
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
  cameraWrapper: {
    flex: 1,
    position: 'relative',
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
    ...StyleSheet.absoluteFill,
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
    borderColor: '#3B99FC', // WalletConnect blue
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
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  instructionIcon: {
    marginRight: 8,
  },
  instructionText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  instructionSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
});
