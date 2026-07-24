/** Expo SDK 55 unit and React Native integration test configuration. */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/jest/setup.ts"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.tsx",
    "<rootDir>/scripts/**/*.test.js",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|@clerk/expo|@react-navigation/.*|react-native-svg|react-native-safe-area-context|react-native-gesture-handler|react-native-reanimated|react-native-worklets|uniwind|zustand)",
  ],
};
