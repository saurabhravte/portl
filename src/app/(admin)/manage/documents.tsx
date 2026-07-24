import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
} from "@/features/admin/adminUi";
import {
  useDocumentMutations,
  useSocietyDocuments,
} from "@/features/documents/hooks";
import { createPrivateMediaUrl, pickAndUploadDocument } from "@/lib/photos";
import { useSupabase } from "@/lib/supabase";
import { format } from "date-fns";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

type DocCategory = "general" | "bylaws" | "minutes" | "circular" | "form" | "other";
type Visibility = "society" | "admins";

export default function DocumentsRoute() {
  const docs = useSocietyDocuments();
  const { create, archive } = useDocumentMutations();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocCategory>("general");
  const [visibility, setVisibility] = useState<Visibility>("society");
  const [uploading, setUploading] = useState(false);
  const rows = docs.data ?? [];

  const uploadAndCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Title required", "Give the document a short title.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await pickAndUploadDocument(supabase);
      if (!uploaded) return;
      await create.mutateAsync({
        title: title.trim(),
        category,
        storageRef: uploaded.reference,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        visibility,
      });
      setTitle("");
      Alert.alert("Document added");
    } catch (error: unknown) {
      Alert.alert(
        "Couldn’t save document",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async (storageRef: string) => {
    try {
      const url = await createPrivateMediaUrl(supabase, storageRef);
      await WebBrowser.openBrowserAsync(url);
    } catch (error: unknown) {
      Alert.alert(
        "Couldn’t open file",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  return (
    <AdminRoute
      title="Document vault"
      description="Store society PDFs and scans privately. Residents see society-visible files; admin-only stays internal."
    >
      <Card className="gap-2">
        <Text className="text-label text-ink">Upload document</Text>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="AGM minutes Jul 2026" />
        <FilterChips
          label="Category"
          value={category}
          options={[
            { value: "general", label: "General" },
            { value: "bylaws", label: "Bylaws" },
            { value: "minutes", label: "Minutes" },
            { value: "circular", label: "Circular" },
            { value: "form", label: "Form" },
            { value: "other", label: "Other" },
          ]}
          onChange={setCategory}
        />
        <FilterChips
          label="Visibility"
          value={visibility}
          options={[
            { value: "society", label: "All members" },
            { value: "admins", label: "Admins only" },
          ]}
          onChange={setVisibility}
        />
        <Button
          title="Pick file & save"
          loading={uploading || create.isPending}
          disabled={!title.trim()}
          onPress={() => void uploadAndCreate()}
        />
      </Card>

      {docs.isLoading ? <Skeleton /> : null}
      {docs.isError ? (
        <QueryErrorState
          error={docs.error}
          onRetry={() => void docs.refetch()}
          isRetrying={docs.isRefetching}
        />
      ) : null}
      {!docs.isLoading && !docs.isError && !rows.length ? (
        <EmptyState title="No documents yet" hint="Upload bylaws, minutes, or circulars." />
      ) : null}
      {rows.map((doc) => (
        <Card key={doc.id}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-label text-ink">{doc.title}</Text>
              <Text className="text-caption text-ink-muted">
                {doc.category}
                {doc.file_name ? ` · ${doc.file_name}` : ""}
                {" · "}
                {format(new Date(doc.created_at), "dd MMM yyyy")}
              </Text>
            </View>
            <Badge
              label={doc.visibility === "admins" ? "Admins" : "Society"}
              tone={doc.visibility === "admins" ? "warn" : "neutral"}
            />
          </View>
          <View className="flex-row gap-2">
            <Button
              title="Open"
              variant="secondary"
              className="grow"
              onPress={() => void openDoc(doc.storage_ref)}
            />
            <Button
              title="Archive"
              variant="ghost"
              className="grow"
              loading={archive.isPending}
              onPress={() =>
                archive.mutate({ id: doc.id }, mutationFeedback("Document archived"))
              }
            />
          </View>
        </Card>
      ))}
    </AdminRoute>
  );
}
