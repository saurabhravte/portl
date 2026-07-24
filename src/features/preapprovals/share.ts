import { Share } from "react-native";

/**
 * Build a shareable deep link for a gate pass code. Opens the Portl app to the
 * passes screen (scheme "portl"). If EXPO_PUBLIC_APP_LINK_BASE is configured
 * (a hosted universal-link domain), an https link is used so recipients
 * without the app still get a landing page.
 *
 * Note: a full no-app web check-in page requires hosting that landing route;
 * this helper covers the app-native shareable link (#6) out of the box.
 */
export function buildPassLink(code: string): string {
  const base = process.env.EXPO_PUBLIC_APP_LINK_BASE?.trim();
  if (base) return `${base.replace(/\/$/, "")}/pass?code=${encodeURIComponent(code)}`;
  return `portl://pre-approvals?code=${encodeURIComponent(code)}`;
}

export async function sharePass(opts: {
  code: string;
  visitorName?: string;
  label?: string;
}): Promise<void> {
  const link = buildPassLink(opts.code);
  const who = opts.visitorName ?? opts.label ?? "your visit";
  await Share.share({
    message:
      `Your Portl gate pass for ${who}: code ${opts.code}\n` +
      `Show this code at the gate, or open: ${link}`,
  });
}
