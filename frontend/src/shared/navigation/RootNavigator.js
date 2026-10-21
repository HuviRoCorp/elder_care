// ============================================================================
// The top-level decision: loading, signed out, or signed in
//
// Conditional rendering rather than navigating between an auth stack and an app
// stack. Swapping the tree means there is no back route from a home screen to
// the login screen and none from login back into the app — signing out cannot
// leave a stale screen behind for someone to swipe back to, because those
// screens no longer exist.
// ============================================================================

import { useAuth } from '../auth/AuthContext';
import { LoadingScreen } from '../screens/LoadingScreen';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';

export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'restoring') return <LoadingScreen />;
  if (status === 'signedOut') return <AuthNavigator />;

  return <AppNavigator />;
}
