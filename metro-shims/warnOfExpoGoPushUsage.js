/**
 * Expo Go on Android throws from expo-notifications' push-token path (SDK 53+).
 * Portl still imports the package for local permission prompts / channel setup,
 * so Metro remaps the throw to a one-time warning for Expo Go development.
 */
const { isRunningInExpoGo } = require("expo");

let didWarn = false;

function warnOfExpoGoPushUsage() {
  if (!isRunningInExpoGo() || didWarn) return;
  didWarn = true;
  console.warn(
    "expo-notifications: remote push is unavailable in Expo Go on Android (SDK 53+). Use a development build for push. Local notification permission prompts still work.",
  );
}

module.exports = { warnOfExpoGoPushUsage };
