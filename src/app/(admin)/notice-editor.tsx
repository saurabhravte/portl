import {
  BackControl,
  Button,
  Card,
  Field,
  Screen,
} from "@/components/ui";
import { DateTimeField, TargetPicker } from "@/features/admin/WorkflowFields";
import {
  useNotices,
  usePublishNotice,
  useUpdateNotice,
} from "@/features/notices/hooks";
import { pickAndUploadPhoto } from "@/lib/photos";
import { NOTICES } from "@/lib/copy";
import { useSupabase } from "@/lib/supabase";
import { addDays, addHours } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

/** Separate create / edit notice screen — keeps the Notices tab list-only. */
export default function NoticeEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === "string" ? params.id : null;
  const publish = usePublishNotice();
  const update = useUpdateNotice();
  const notices = useNotices();
  const supabase = useSupabase();

  const existing = useMemo(
    () => (notices.data ?? []).find((n) => n.id === editingId) ?? null,
    [notices.data, editingId],
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"draft" | "now" | "scheduled">("now");
  const [publishAt, setPublishAt] = useState(() => addHours(new Date(), 1));
  const [expiresAt, setExpiresAt] = useState(() => addDays(new Date(), 7));
  const [towerIds, setTowerIds] = useState<string[]>([]);
  const [flatIds, setFlatIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!editingId || !existing || hydrated) return;
    setTitle(existing.title);
    setBody(existing.body);
    setMode(
      existing.published_at
        ? new Date(existing.published_at) > new Date()
          ? "scheduled"
          : "now"
        : "draft",
    );
    if (existing.published_at) setPublishAt(new Date(existing.published_at));
    setExpiresAt(
      existing.expires_at
        ? new Date(existing.expires_at)
        : addDays(new Date(), 7),
    );
    setTowerIds(existing.target_tower_ids);
    setFlatIds(existing.target_flat_ids);
    setAttachments(existing.attachments);
    setHydrated(true);
  }, [editingId, existing, hydrated]);

  const onPublish = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing text", NOTICES.missingText);
      return;
    }
    const publishedAt =
      mode === "draft" ? null : mode === "now" ? new Date() : publishAt;
    const changes = {
      title: title.trim(),
      body: body.trim(),
      published_at: publishedAt?.toISOString() ?? null,
      expires_at: expiresAt.toISOString(),
      attachments,
      target_tower_ids: towerIds,
      target_flat_ids: flatIds,
    };
    const feedback = {
      onSuccess: () => router.back(),
      onError: (error: Error) => Alert.alert(NOTICES.saveFailed, error.message),
    };
    if (editingId) {
      update.mutate({ id: editingId, changes }, feedback);
    } else {
      publish.mutate(
        {
          title: changes.title,
          body: changes.body,
          publishedAt,
          expiresAt,
          attachments,
          targetTowerIds: towerIds,
          targetFlatIds: flatIds,
        },
        feedback,
      );
    }
  };

  return (
    <Screen keyboard>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="gap-4 p-4">
          <BackControl onPress={() => router.back()} />
          <Text className="text-display text-ink">
            {editingId ? NOTICES.edit : NOTICES.create}
          </Text>
          <Card>
            <Field
              label={NOTICES.titleLabel}
              value={title}
              onChangeText={setTitle}
              placeholder={NOTICES.titlePlaceholder}
            />
            <Field
              label={NOTICES.bodyLabel}
              value={body}
              onChangeText={setBody}
              multiline
              className="min-h-24 pt-3"
            />
            <View className="flex-row flex-wrap gap-2">
              {(["draft", "now", "scheduled"] as const).map((value) => (
                <Button
                  key={value}
                  title={
                    value === "now"
                      ? NOTICES.publishNow
                      : value === "draft"
                        ? NOTICES.draft
                        : NOTICES.scheduled
                  }
                  variant={mode === value ? "primary" : "ghost"}
                  selected={mode === value}
                  onPress={() => setMode(value)}
                />
              ))}
            </View>
            {mode === "scheduled" ? (
              <DateTimeField
                label="Publish at"
                value={publishAt}
                minimumDate={new Date()}
                onChange={setPublishAt}
              />
            ) : null}
            <DateTimeField
              label="Expires at"
              value={expiresAt}
              minimumDate={publishAt}
              onChange={setExpiresAt}
            />
            <TargetPicker
              towerIds={towerIds}
              flatIds={flatIds}
              onTowerIdsChange={setTowerIds}
              onFlatIdsChange={setFlatIds}
            />
            <Button
              title={
                attachments.length
                  ? NOTICES.replaceAttachment
                  : NOTICES.addAttachment
              }
              variant="secondary"
              onPress={() =>
                void pickAndUploadPhoto(supabase, "notices").then((path) => {
                  if (path) setAttachments([path]);
                })
              }
            />
            <Button
              title={
                editingId
                  ? NOTICES.saveChanges
                  : mode === "draft"
                    ? NOTICES.saveDraft
                    : NOTICES.saveNotice
              }
              onPress={onPublish}
              loading={publish.isPending || update.isPending}
            />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
