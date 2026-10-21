// ============================================================================
// Babel config — Expo SDK 54
//
// This file was missing entirely (never committed — git log --all shows no
// history for it at any point, on any branch; not lost in a merge). Metro
// still bundled without it because @expo/metro-config supplies a default
// babel transform when no project-level config is found, which is why
// `expo export` succeeded earlier despite this gap. But a preview/production
// build embeds a bundle produced without this file ever being read, and
// nothing here guarantees that implicit fallback behaves identically to an
// explicit babel-preset-expo pass for every plugin this app actually needs
// (JSX, the RN preset, etc.) — hence the immediate-crash-on-launch symptom
// with a Metro bundle that otherwise looked clean.
//
// No react-native-reanimated plugin here — not a dependency of this project
// (checked package.json). If it's added later, its babel plugin must be
// listed last in the plugins array; nothing to add today.
// ============================================================================

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
