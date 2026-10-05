import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { COLORS, SIZES, RADIUS } from '../src/constants/theme';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const router = useRouter();

  const handleManualEntry = () => {
    router.replace('/send');
  };

  if (!permission) {
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <View style={styles.content}>
          <Text style={styles.title}>Preparing Camera</Text>
          <Text style={styles.subtitle}>Checking camera permission…</Text>
          <Button
            title="Enter Address Manually"
            onPress={handleManualEntry}
            accessibilityRole="button"
            accessibilityLabel="Enter recipient address manually"
            style={styles.button}
          />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Camera Permission Required</Text>
          <Text style={styles.subtitle}>
            {permission.canAskAgain
              ? 'We need camera access to scan QR codes. You can grant permission or enter the recipient address manually.'
              : 'Camera access is blocked. Enable it in your device settings, or enter the recipient address manually.'}
          </Text>
          <Button 
            title="Enter Address Manually" 
            onPress={handleManualEntry} 
            accessibilityRole="button"
            accessibilityLabel="Enter recipient address manually"
            style={styles.button}
          />
          {permission.canAskAgain && (
             <Button 
               title="Request Camera Permission" 
               variant="secondary"
               onPress={requestPermission} 
               accessibilityRole="button"
               accessibilityLabel="Request camera permission"
               style={styles.button}
             />
          )}
        </View>
      </View>
    );
  }

  if (cameraError) {
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <View style={styles.content}>
          <Text style={styles.title}>Camera Unavailable</Text>
          <Text style={styles.subtitle}>
            We couldn&apos;t start the camera on this device. Enter the recipient address manually instead.
          </Text>
          <Button
            title="Enter Address Manually"
            onPress={handleManualEntry}
            accessibilityRole="button"
            accessibilityLabel="Enter recipient address manually"
            style={styles.button}
          />
        </View>
      </View>
    );
  }

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    // Pass the scanned data to the send screen
    router.replace(`/send?destination=${encodeURIComponent(data)}`);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        onMountError={({ message }) => setCameraError(message || 'Camera unavailable')}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.scanText}>Scan QR Code</Text>
        </View>
        <View style={styles.footer}>
          <Button 
            title="Enter Address Manually" 
            onPress={handleManualEntry} 
            accessibilityRole="button"
            accessibilityLabel="Enter recipient address manually"
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: SIZES.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SIZES.xxl,
    lineHeight: 24,
  },
  button: {
    marginBottom: SIZES.md,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: SIZES.xl,
    paddingBottom: SIZES.xxl,
  },
  header: {
    marginTop: SIZES.xxl,
    alignItems: 'center',
  },
  scanText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.sm,
    borderRadius: RADIUS.round,
    overflow: 'hidden',
  },
  footer: {
    width: '100%',
  }
});
