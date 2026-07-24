import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { DateTimeField, TargetPicker } from "@/features/admin/WorkflowFields";
import {
  type NoticeRow,
  useDeleteNotice,
  useNoticeReaders,
  useNotices,
  usePublishNotice,
  useSetNoticePinned,
  useUpdateNotice,
} from "@/features/notices/hooks";
import { pickAndUploadPhoto } from "@/lib/photos";
import { useSupabase } from "@/lib/supabase";
import { publicationStatus } from "@/features/productWorkflows/batch4Logic";
import { addDays, addHours, format } from "date-fns";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

export default function AdminNotices() {
  const publish = usePublishNotice();
  const update = useUpdateNotice();
  const remove = useDeleteNotice();
  const pin = useSetNoticePinned();
  const notices = useNotices();
  const supabase = useSupabase();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"draft" | "now" | "scheduled">("now");
  const [publishAt, setPublishAt] = useState(() => addHours(new Date(), 1));
  const [expiresAt, setExpiresAt] = useState(() => addDays(new Date(), 7));
  const [towerIds, setTowerIds] = useState<string[]>([]);
  const [flatIds, setFlatIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [readersFor, setReadersFor] = useState<string | null>(null);
  const readers = useNoticeReaders(readersFor);

  const data = useMemo(() => {
    const rows = notices.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
    );
  }, [notices.data, search]);

  const reset = () => {
    setTitle("");
    setBody("");
    setMode("now");
    setPublishAt(addHours(new Date(), 1));
    setExpiresAt(addDays(new Date(), 7));
    setTowerIds([]);
    setFlatIds([]);
    setAttachments([]);
    setEditing(null);
  };

  const onPublish = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing text", "A notice needs a title and a body.");
      return;
    }
    const publishedAt = mode === "draft" ? null : mode === "now" ? new Date() : publishAt;
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
      onSuccess: reset,
      onError: (error: Error) => Alert.alert("Couldn’t save notice", error.message),
    };
    if (editing) {
      update.mutate({ id: editing, changes }, feedback);
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

  const edit = (notice: NoticeRow) => {
    setEditing(notice.id);
    setTitle(notice.title);
    setBody(notice.body);
    setMode(
      notice.published_at
        ? new Date(notice.published_at) > new Date()
          ? "scheduled"
          : "now"
        : "draft",
    );
    if (notice.published_at) setPublishAt(new Date(notice.published_at));
    setExpiresAt(notice.expires_at ? new Date(notice.expires_at) : addDays(new Date(), 7));
    setTowerIds(notice.target_tower_ids);
    setFlatIds(notice.target_flat_ids);
    setAttachments(notice.attachments);
  };

  return (
    <Screen>
      <ScrollView className="flex-1">
        <View className="gap-4 p-4">
          <Text className="text-display text-ink">Notices</Text>
          <Card>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Water shutdown on Sunday"
            />
            <Field
              label="Body"
              value={body}
              onChangeText={setBody}
              multiline
              className="min-h-[100px] pt-3"
            />
            <View className="flex-row flex-wrap gap-2">
              {(["draft", "now", "scheduled"] as const).map((value) => (
                <Button
                  key={value}
                  title={value === "now" ? "Publish now" : value[0].toUpperCase() + value.slice(1)}
                  variant={mode === value ? "primary" : "ghost"}
                  selected={mode === value}
                  onPress={() => setMode(value)}
                />
              ))}
            </View>
            {mode === "scheduled" ? (
              <DateTimeField label="Publish at" value={publishAt} minimumDate={new Date()} onChange={setPublishAt} />
            ) : null}
            <DateTimeField label="Expires at" value={expiresAt} minimumDate={publishAt} onChange={setExpiresAt} />
            <TargetPicker
              towerIds={towerIds}
              flatIds={flatIds}
              onTowerIdsChange={setTowerIds}
              onFlatIdsChange={setFlatIds}
            />
            <Button
              title={attachments.length ? "Replace attachment" : "Add private attachment"}
              variant="secondary"
              onPress={() =>
                void pickAndUploadPhoto(supabase, "notices").then((path) => {
                  if (path) setAttachments([path]);
                })
              }
            />
            <Button
              title={editing ? "Save changes" : mode === "draft" ? "Save draft" : "Save notice"}
              onPress={onPublish}
              loading={publish.isPending || update.isPending}
            />
            {editing ? <Button title="Cancel editing" variant="ghost" onPress={reset} /> : null}
          </Card>
          <SectionTitle>All notices</SectionTitle>
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search notice title or body"
          />
          {notices.isLoading ? <Skeleton /> : null}
          {notices.isError ? (
            <QueryErrorState
              error={notices.error}
              onRetry={() => void notices.refetch()}
              isRetrying={notices.isRefetching}
            />
          ) : null}
          {!notices.isLoading && !notices.isError && !data.length ? (
            <EmptyState title="No notices published" />
          ) : null}
          {data.map((n) => (
            <Card key={n.id}>
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-title text-ink">{n.title}</Text>
                {n.pinned_at ? <Badge label="Pinned" tone="primary" /> : null}
              </View>
              <Badge
                label={publicationStatus(n.published_at, n.expires_at).replace(
                  /^./,
                  (value) => value.toUpperCase(),
                )}
              />
              <Text className="text-body text-ink-soft" numberOfLines={2}>
                {n.body}
              </Text>
              <Text className="text-caption text-ink-muted">
                {n.published_at
                  ? format(new Date(n.published_at), "d MMM, h:mm a")
                  : "Not scheduled"}{" "}
                · {n.reads?.length ?? 0} read
              </Text>
              {readersFor === n.id ? (
                <View className="gap-1">
                  {readers.isLoading ? <Skeleton height={40} /> : null}
                  {(readers.data ?? []).map((r) => (
                    <Text key={r.profile_id} className="text-caption text-ink-muted">
                      {r.name}
                      {r.flat_number ? ` · ${r.flat_number}` : ""} ·{" "}
                      {format(new Date(r.read_at), "d MMM, h:mm a")}
                    </Text>
                  ))}
                  {!readers.isLoading && !(readers.data ?? []).length ? (
                    <Text className="text-caption text-ink-muted">No reads yet.</Text>
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <Button title="Edit" variant="secondary" className="grow" onPress={() => edit(n)} />
                <Button
                  title={n.pinned_at ? "Unpin" : "Pin"}
                  variant="ghost"
                  className="grow"
                  loading={pin.isPending}
                  onPress={() =>
                    pin.mutate({ id: n.id, pinned: !n.pinned_at })
                  }
                />
                <Button
                  title={readersFor === n.id ? "Hide readers" : "Who read"}
                  variant="ghost"
                  className="grow"
                  onPress={() =>
                    setReadersFor((cur) => (cur === n.id ? null : n.id))
                  }
                />
                <Button
                  title="Delete"
                  variant="ghost"
                  loading={remove.isPending}
                  onPress={() =>
                    Alert.alert("Delete notice?", "Readership history will also be removed.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => remove.mutate(n.id) },
                    ])
                  }
                />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
