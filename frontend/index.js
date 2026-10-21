// ============================================================================
// Expo entry point
//
// All application code lives under src/, matching the folder structure in
// PROJECT_REPORT section 5. This file exists only to hand src/App.js to Expo.
// ============================================================================

import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and sets up the environment for both Expo Go and a native build.
registerRootComponent(App);
