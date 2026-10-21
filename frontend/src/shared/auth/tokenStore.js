// ============================================================================
// Token storage
//
// SecureStore, not AsyncStorage. AsyncStorage is an unencrypted file inside the
// app's sandbox; SecureStore hands the value to the Keychain on iOS and to
// EncryptedSharedPreferences on Android. The refresh token is a 30-day
// credential for someone's emergency account — it belongs behind the same door
// as a password, not in a plain file.
//
// This is also what keeps a user logged in across app restarts: the tokens
// outlive the process, so the app can prove who it is on the next launch
// without asking for the password again.
// ============================================================================

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'eldercare.accessToken';
const REFRESH_TOKEN_KEY = 'eldercare.refreshToken';

// SecureStore has no web implementation. Rather than crash `npm run web`, the
// browser gets an in-memory object — which means tokens do not survive a page
// reload there. Acceptable because the web target is only ever used for a quick
// look at a screen; the product ships to phones.
const memoryStore = new Map();
const isWeb = Platform.OS === 'web';

async function setItem(key, value) {
  if (isWeb) {
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key) {
  if (isWeb) return memoryStore.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key) {
  if (isWeb) {
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** Writes both tokens. Called after login, registration, and every refresh. */
export async function saveTokens({ accessToken, refreshToken }) {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, accessToken),
    setItem(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export async function loadTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    getItem(ACCESS_TOKEN_KEY),
    getItem(REFRESH_TOKEN_KEY),
  ]);

  return { accessToken, refreshToken };
}

/**
 * Removes both tokens. Called on sign-out and whenever the server tells us a
 * session is over. Deleting them is the only way the app forgets a session —
 * an access token cannot be recalled, it just stops working within 15 minutes.
 */
export async function clearTokens() {
  await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
}
