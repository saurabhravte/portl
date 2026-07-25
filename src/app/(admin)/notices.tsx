import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  Screen,
  Skeleton,
} from "@/components/ui";
import {
  type NoticeRow,
  useDeleteNotice,
  useNoticeReaders,
  useNotices,
  useSetNoticePinned,
} from "@/features/notices/hooks";
import { publicationStatus } from "@/features/productWorkflows/batch4Logic";
import { NOTICES } from "@/lib/copy";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

/** Admin Notices tab — list only. Create/edit lives on a separate screen. */
export default function AdminNotices() {
  const router = useRouter();
  const remove = useDeleteNotice();
  const pin = useSetNoticePinned();
  const notices = useNotices();
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

  const openEditor = (notice?: NoticeRow) => {
    if (notice) {
      router.push({
        pathname: "/(admin)/notice-editor",
        params: { id: notice.id },
      } as never);
    } else {
      router.push("/(admin)/notice-editor" as never);
    }
  };

  return (
    <Screen>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="gap-4 p-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-display text-ink">{NOTICES.title}</Text>
            <Button
              title={NOTICES.create}
              onPress={() => openEditor()}
              className="shrink-0"
            />
          </View>

          <Field
            label={NOTICES.search}
            value={search}
            onChangeText={setSearch}
            placeholder={NOTICES.searchPlaceholder}
            leadingIcon="search"
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
            <EmptyState
              title={NOTICES.empty}
              actionLabel={NOTICES.create}
              onAction={() => openEditor()}
              icon="notices"
            />
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
                  : NOTICES.notScheduled}{" "}
                · {n.reads?.length ?? 0} read
              </Text>
              {readersFor === n.id ? (
                <View className="gap-1">
                  {readers.isLoading ? <Skeleton height={40} /> : null}
                  {(readers.data ?? []).map((r) => (
                    <Text
                      key={r.profile_id}
                      className="text-caption text-ink-muted"
                    >
                      {r.name}
                      {r.flat_number ? ` · ${r.flat_number}` : ""} ·{" "}
                      {format(new Date(r.read_at), "d MMM, h:mm a")}
                    </Text>
                  ))}
                  {!readers.isLoading && !(readers.data ?? []).length ? (
                    <Text className="text-caption text-ink-muted">
                      {NOTICES.noReads}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <Button
                  title={NOTICES.edit}
                  variant="secondary"
                  className="grow"
                  onPress={() => openEditor(n)}
                />
                <Button
                  title={n.pinned_at ? NOTICES.unpin : NOTICES.pin}
                  variant="ghost"
                  className="grow"
                  loading={pin.isPending}
                  onPress={() =>
                    pin.mutate({ id: n.id, pinned: !n.pinned_at })
                  }
                />
                <Button
                  title={
                    readersFor === n.id ? NOTICES.hideReaders : NOTICES.whoRead
                  }
                  variant="ghost"
                  className="grow"
                  onPress={() =>
                    setReadersFor((cur) => (cur === n.id ? null : n.id))
                  }
                />
                <Button
                  title={NOTICES.delete}
                  variant="ghost"
                  loading={remove.isPending}
                  onPress={() =>
                    Alert.alert(NOTICES.delete, NOTICES.deleteConfirm, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: NOTICES.delete,
                        style: "destructive",
                        onPress: () => remove.mutate(n.id),
                      },
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
