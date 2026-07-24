import {
  isImageKitConfigured,
  uploadToImageKit,
  type CompressedAsset,
} from "@/lib/imagekit";
import type { AppSupabaseClient } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { parseInput } from "@/lib/validation";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { z } from "zod";

const MEDIA_PREFIX = "society-media:";

export function privateMediaPath(reference: string): string | null {
  return reference.startsWith(MEDIA_PREFIX)
    ? reference.slice(MEDIA_PREFIX.length)
    : null;
}

export async function createPrivateMediaUrl(
  supabase: AppSupabaseClient,
  reference: string,
): Promise<string> {
  const path = privateMediaPath(reference);
  if (!path) return reference; // legacy external/public URL
  const safePath = parseInput(
    z.string().max(512).regex(
      /^[0-9a-f-]{36}\/(visitors|tickets|notices|polls|documents)\/[A-Za-z0-9._-]+$/,
      "Media reference is invalid.",
    ),
    path,
  );
  const { data, error } = await supabase.storage
    .from("society-media")
    .createSignedUrl(safePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Prompt for camera/gallery, then compress before upload so guard flows stay
 * fast on 3G (review §5.6): resize to ≤1280px wide and re-encode at 70% JPEG.
 * Backend-agnostic — used by both the ImageKit and Supabase upload paths.
 */
async function pickAndCompressImage(): Promise<CompressedAsset | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      Alert.alert("Permission needed", "Allow camera or photos to attach an image.");
      return null;
    }
  }

  const choice = await new Promise<"camera" | "library" | null>((resolve) => {
    Alert.alert("Add photo", "Take a new photo or pick from gallery.", [
      { text: "Camera", onPress: () => resolve("camera") },
      { text: "Gallery", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
  if (!choice) return null;

  const result =
    choice === "camera"
      ? await ImagePicker.launchCameraAsync({
          quality: 0.7,
          allowsEditing: true,
          aspect: [4, 3],
        })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsEditing: true,
          aspect: [4, 3],
          mediaTypes: ["images"],
        });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let uploadUri = asset.uri;
  let contentType = asset.mimeType ?? "image/jpeg";
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      asset.width && asset.width > 1280 ? [{ resize: { width: 1280 } }] : [],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    uploadUri = manipulated.uri;
    contentType = "image/jpeg";
  } catch {
    // fall back to the original asset if manipulation fails
  }

  return { uri: uploadUri, contentType };
}

/**
 * Pick a photo and upload it. When ImageKit is configured
 * (EXPO_PUBLIC_IMAGEKIT_*), uploads go to ImageKit and the returned CDN URL
 * is stored as the reference. Otherwise falls back to the private
 * `society-media` Supabase Storage bucket (short-lived signed URLs).
 */
export async function pickAndUploadPhoto(
  supabase: AppSupabaseClient,
  folder: "visitors" | "tickets" | "notices" | "polls",
): Promise<string | null> {
  folder = parseInput(z.enum(["visitors", "tickets", "notices", "polls"]), folder);
  const profile = useSessionStore.getState().profile;
  if (!profile) {
    return null;
  }

  const asset = await pickAndCompressImage();
  if (!asset) return null;

  // ── ImageKit backend ──────────────────────────────────────────────────
  if (isImageKitConfigured()) {
    try {
      const fileName = `${profile.id}-${Date.now()}.jpg`;
      return await uploadToImageKit(supabase, folder, asset, fileName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("Upload failed", message || "Could not upload photo.");
      return null;
    }
  }

  // ── Supabase Storage backend (fallback) ───────────────────────────────
  const uploadUri = asset.uri;
  const contentType = asset.contentType;
  const path = `${profile.society_id}/${folder}/${profile.id}-${Date.now()}.jpg`;

  try {
    const response = await fetch(uploadUri);
    const blob = await response.blob();
    if (blob.size > 10 * 1024 * 1024) {
      throw new Error("Photo must be smaller than 10 MB.");
    }
    const safePath = parseInput(
      z.string().regex(
        /^[0-9a-f-]{36}\/(visitors|tickets|notices|polls)\/[0-9a-f-]{36}-\d+\.jpg$/,
        "Photo destination is invalid.",
      ),
      path,
    );
    const { error } = await supabase.storage
      .from("society-media")
      .upload(safePath, blob, {
        contentType,
        upsert: false,
      });
    if (error) {
      Alert.alert("Upload failed", error.message);
      return null;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Alert.alert("Upload failed", message || "Could not upload photo.");
    return null;
  }

  // Store an object reference, not a public URL. Display code exchanges this
  // for a short-lived signed URL after RLS authorizes the current user.
  return `${MEDIA_PREFIX}${path}`;
}

const documentExtSchema = z.enum(["jpg", "jpeg", "png", "webp", "pdf"]);

/**
 * Admin document-vault upload into `society-media/.../documents/`.
 * Uses DocumentPicker (PDF or image); never ImageKit (private vault).
 */
export async function pickAndUploadDocument(
  supabase: AppSupabaseClient,
): Promise<{ reference: string; fileName: string; mimeType: string } | null> {
  const profile = useSessionStore.getState().profile;
  if (!profile) return null;

  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? "application/octet-stream";
  const rawName = asset.name ?? "document";
  const extFromName = rawName.includes(".")
    ? rawName.split(".").pop()!.toLowerCase()
    : "";
  const ext =
    extFromName === "pdf" || mimeType === "application/pdf"
      ? "pdf"
      : extFromName === "png" || mimeType === "image/png"
        ? "png"
        : extFromName === "webp" || mimeType === "image/webp"
          ? "webp"
          : "jpg";
  const safeExt = parseInput(documentExtSchema, ext);
  const path = `${profile.society_id}/documents/${profile.id}-${Date.now()}.${safeExt}`;

  try {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    if (blob.size > 15 * 1024 * 1024) {
      throw new Error("Document must be smaller than 15 MB.");
    }
    const safePath = parseInput(
      z.string().regex(
        /^[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}-\d+\.(jpg|jpeg|png|webp|pdf)$/,
        "Document destination is invalid.",
      ),
      path,
    );
    const { error } = await supabase.storage.from("society-media").upload(safePath, blob, {
      contentType: mimeType === "application/octet-stream"
        ? safeExt === "pdf"
          ? "application/pdf"
          : `image/${safeExt === "jpg" ? "jpeg" : safeExt}`
        : mimeType,
      upsert: false,
    });
    if (error) {
      Alert.alert("Upload failed", error.message);
      return null;
    }
    return {
      reference: `${MEDIA_PREFIX}${path}`,
      fileName: rawName.slice(0, 200),
      mimeType,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Alert.alert("Upload failed", message || "Could not upload document.");
    return null;
  }
}
