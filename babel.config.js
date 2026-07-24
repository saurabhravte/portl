module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Polyfill `import.meta` for Hermes / Expo Go (Zustand ESM and similar).
      ["babel-preset-expo", { unstable_transformImportMeta: true }],
    ],
  };
};
