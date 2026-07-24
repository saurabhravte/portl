import type { AppSupabaseClient } from "@/lib/supabase";

const UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";

export interface CompressedAsset {
  uri: string;
  contentType: string;
}

export interface ImageKitConfig {
  publicKey: string;
  urlEndpoint: string;
}

/**
 * ImageKit is used as the media backend when both public env vars are set.
 * The PRIVATE key lives only in the imagekit-auth Edge Function.
 */
export function getImageKitConfig(): ImageKitConfig | null {
  const publicKey = process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY?.trim();
  const urlEndpoint = process.env.EXPO_PUBLIC_IMAGEKIT_URL_ENDPOINT?.trim();
  if (!publicKey || !urlEndpoint) return null;
  return { publicKey, urlEndpoint };
}

export function isImageKitConfigured(): boolean {
  return getImageKitConfig() !== null;
}

interface ImageKitAuth {
  token: string;
  expire: number;
  signature: string;
  folder: string;
}

async function fetchUploadAuth(
  supabase: AppSupabaseClient,
  folder: "visitors" | "tickets" | "notices" | "polls",
): Promise<ImageKitAuth> {
  const { data, error } = await supabase.functions.invoke("imagekit-auth", {
    body: { folder },
  });
  if (error) throw error;
  const auth = data as Partial<ImageKitAuth> | null;
  if (!auth?.token || !auth.signature || !auth.expire || !auth.folder) {
    throw new Error("Could not authorize the image upload.");
  }
  return auth as ImageKitAuth;
}

/**
 * Upload a compressed image to ImageKit and return the CDN URL to store as
 * the media reference. `PrivateMediaImage` renders any non-`society-media:`
 * reference as-is, so the returned URL is a drop-in replacement.
 */
export async function uploadToImageKit(
  supabase: AppSupabaseClient,
  folder: "visitors" | "tickets" | "notices" | "polls",
  asset: CompressedAsset,
  fileName: string,
): Promise<string> {
  const config = getImageKitConfig();
  if (!config) throw new Error("ImageKit is not configured.");

  const auth = await fetchUploadAuth(supabase, folder);

  const form = new FormData();
  // React Native file part.
  form.append("file", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uri: asset.uri,
    name: fileName,
    type: asset.contentType,
  } as any);
  form.append("fileName", fileName);
  form.append("folder", auth.folder);
  form.append("useUniqueFileName", "true");
  form.append("publicKey", config.publicKey);
  form.append("signature", auth.signature);
  form.append("expire", String(auth.expire));
  form.append("token", auth.token);

  const response = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as
    | { url?: string; message?: string }
    | null;
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.message ?? "ImageKit upload failed.");
  }
  return payload.url;
}
