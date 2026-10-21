const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'TopicSubscriptionModule.android.js');

if (fs.existsSync(targetFile)) {
  const content = `import { requireOptionalNativeModule } from 'expo-modules-core';

let nativeModule = null;
try {
  nativeModule = typeof requireOptionalNativeModule === 'function'
    ? requireOptionalNativeModule('ExpoTopicSubscriptionModule')
    : null;
} catch (e) {
  nativeModule = null;
}

const fallback = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

export default nativeModule || fallback;
`;
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('[patch-expo-notifications] Successfully patched TopicSubscriptionModule.android.js for Expo Go');
} else {
  console.log('[patch-expo-notifications] expo-notifications not found, skipping patch');
}
