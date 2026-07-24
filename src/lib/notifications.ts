/**
 * Push pipeline client side — token registration, Android channels, and
 * actionable notification categories (sprint ticket #7 — P1).
 *
 * Channels (review §5.6): gate requests go to a MAX-importance channel
 * (sound + heads-up) so residents can silence notices/polls/dues without
 * ever muting the gate.
 *
 * Categories: the visitor_request category adds Approve/Deny buttons so a
 * resident can decide from the lock screen without opening the app — the
 * single biggest lever on approval latency.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { idempotencyKeyFromString } from "./offlineQueue";
import type { AppSupabaseClient } from "./supabase";
import {
  parseInput,
  privilegedRpcResultSchema,
  pushTokenSchema,
  uuidSchema,
} from "./validation";
import { z } from "zod";

export const GATE_CHANNEL_ID = "gate";
export const DEFAULT_CHANNEL_ID = "default";
export const VISITOR_REQUEST_CATEGORY = "visitor_request";
export const ACTION_APPROVE = "approve";
export const ACTION_DENY = "deny";
let currentDeviceExpoPushToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Register channels + action categories once at app start. */
export async function configureNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(GATE_CHANNEL_ID, {
      name: "Gate requests",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: "Notices, polls & dues",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.setNotificationCategoryAsync(VISITOR_REQUEST_CATEGORY, [
    {
      identifier: ACTION_APPROVE,
      buttonTitle: "Approve",
      // Restore the authenticated session before performing this privileged
      // mutation; no unauthenticated headless task is allowed to decide.
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_DENY,
      buttonTitle: "Deny",
      options: { opensAppToForeground: true, isDestructive: true },
    },
  ]);
}

/** Ask permission and register this device without replacing other devices. */
export async function registerPushToken(
  supabase: AppSupabaseClient,
  _userId: string,
) {
  // Web has no Expo push tokens; emulators can't receive remote push.
  if (Platform.OS === "web" || !Device.isDevice) return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    }));
  }
  if (status !== "granted") return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  // Skip remote push token when EAS project id is still a placeholder.
  if (!projectId || String(projectId).includes("REPLACE")) return;

  const token = parseInput(
    pushTokenSchema,
    (await Notifications.getExpoPushTokenAsync({ projectId })).data,
  );
  const platform = parseInput(z.enum(["ios", "android"]), Platform.OS);
  const { error } = await supabase.rpc("register_push_token", {
    p_token: token,
    p_platform: platform,
  });
  if (error) throw error;
  currentDeviceExpoPushToken = token;
  return token;
}

export function getTrackedDevicePushToken() {
  return currentDeviceExpoPushToken;
}

export function clearTrackedDevicePushToken() {
  currentDeviceExpoPushToken = null;
}

/** Remove only this installation's token; other signed-in devices remain. */
export async function unregisterCurrentDevicePushToken(
  supabase: AppSupabaseClient,
) {
  const token = currentDeviceExpoPushToken;
  if (!token) return false;
  const { error } = await supabase.rpc("unregister_push_token", {
    p_token: token,
  });
  if (error) throw new Error("Could not unregister notifications for this device.");
  currentDeviceExpoPushToken = null;
  return true;
}

/**
 * Native push services can roll their token while the app is running. Expo's
 * listener reports that event, after which the Expo token must be fetched and
 * registered again.
 */
export function addExpoPushTokenRolloverListener(
  supabase: AppSupabaseClient,
  userId: string,
) {
  return Notifications.addPushTokenListener(() => {
    const previousToken = currentDeviceExpoPushToken;
    void registerPushToken(supabase, userId)
      .then(async (nextToken) => {
        if (!previousToken || !nextToken || previousToken === nextToken) return;
        const { error } = await supabase.rpc("unregister_push_token", {
          p_token: previousToken,
        });
        if (error) {
          // The new token is already active; stale-token receipts can safely
          // finish cleanup if this best-effort rollover removal fails.
        }
      })
      .catch(() => {
        // Registration is recoverable at the next app start/token event.
      });
  });
}

type VisitorNotificationData = {
  url?: string;
  requestId?: string;
};

const visitorNotificationDataSchema = z.object({
  url: z.string().trim().max(500).refine((value) => value.startsWith("/"), "Invalid app route.").optional(),
  requestId: uuidSchema.optional(),
}).passthrough();

/**
 * Shared notification-response handler for root integration. It uses the
 * decision RPC (so zero-row updates cannot look successful) and can process
 * the response that launched a cold app.
 */
export async function handleVisitorNotificationResponse(
  supabase: AppSupabaseClient,
  response: Notifications.NotificationResponse,
  openUrl: (url: string) => void,
) {
  const parsedData = visitorNotificationDataSchema.safeParse(
    response.notification.request.content.data,
  );
  const data: VisitorNotificationData | undefined = parsedData.success
    ? parsedData.data
    : undefined;
  const action = response.actionIdentifier;
  if (
    (action === ACTION_APPROVE || action === ACTION_DENY) &&
    data?.requestId
  ) {
    const decision = action === ACTION_APPROVE ? "approved" : "denied";
    const { data: result, error } = await supabase.rpc(
      "decide_visitor_request",
      {
        p_idempotency_key: idempotencyKeyFromString(
          `${response.notification.request.identifier}:${action}:${data.requestId}`,
        ),
        p_request_id: data.requestId,
        p_decision: decision,
      },
    );
    const succeeded = privilegedRpcResultSchema.safeParse(result).success;
    if (error || !succeeded) {
      openUrl(`/(resident)/approve?requestId=${data.requestId}`);
    }
    return true;
  }
  if (data?.url) {
    openUrl(data.url);
    return true;
  }
  return false;
}

/** Call once after auth/profile/router are ready to handle cold-start taps. */
export async function handleLastVisitorNotificationResponse(
  supabase: AppSupabaseClient,
  openUrl: (url: string) => void,
) {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return false;
  const handled = await handleVisitorNotificationResponse(
    supabase,
    response,
    openUrl,
  );
  if (handled) await Notifications.clearLastNotificationResponseAsync();
  return handled;
}
