/** Validation-only launch route. Production screens and camera are unchanged.
 * Native Android permission dialogs and the camera's real no-hardware mount
 * failure drive the UI. No store, permission hook, camera or transport mocks.
 * Never include this route in the submitted feature commits.
 */
import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import ScanScreen from '../scan';
import ContactsScreen from '../contacts';
export default function NativeCameraFixture() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  return <><Stack.Screen options={{ headerShown: false }} />{screen === 'contacts' ? <ContactsScreen /> : <ScanScreen />}</>;
}
