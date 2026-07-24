import {
  Badge,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import {
  useMarkNoticeRead,
  useNotices,
  type NoticeRow,
} from "@/features/notices/hooks";
import { useSessionStore } from "@/stores/session";
import { format } from "date-fns";
import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

export function NoticesPanel() {
  const { data, error, isError, isLoading, isRefetching, refetch } =
    useNotices();

  if (isLoading)
    return (
      <>
        <Skeleton />
        <Skeleton />
      </>
    );

  if (isError)
    return (
      <QueryErrorState
        error={error}
        onRetry={() => void refetch()}
        isRetrying={isRefetching}
        title="Couldn’t load notices"
      />
    );

  if (!data?.length)
    return (
      <EmptyState
        title="Nothing posted"
        hint="Society announcements will show up here."
        actionLabel="Refresh"
        onAction={() => void refetch()}
      />
    );

  return (
    <>
      {data.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} />
      ))}
    </>
  );
}

function NoticeCard({ notice }: { notice: NoticeRow }) {
  const profileId = useSessionStore((s) => s.profile?.id);
  const initiallyRead = notice.reads.some(
    (read) => read.profile_id === profileId,
  );
  const [open, setOpen] = useState(false);
  const markRead = useMarkNoticeRead();
  const toggle = () => {
    setOpen((current) => !current);
    if (!initiallyRead && !markRead.isPending) markRead.mutate(notice.id);
  };
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Collapse" : "Read"} notice ${notice.title}`}
        onPress={toggle}
      >
          <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-title text-ink">{notice.title}</Text>
          <View className="flex-row gap-1">
            {notice.pinned_at ? <Badge label="Pinned" tone="primary" /> : null}
            {!initiallyRead ? <Badge label="New" tone="ink" /> : null}
          </View>
        </View>
        <Text className="text-caption text-ink-muted">
          {notice.published_at
            ? format(new Date(notice.published_at), "d MMM yyyy, h:mm a")
            : "Draft"}
          {notice.expires_at
            ? ` · expires ${format(new Date(notice.expires_at), "d MMM")}`
            : ""}
        </Text>
      </Pressable>
      {open ? (
        <>
          <Text className="text-body text-ink-soft">{notice.body}</Text>
          {notice.updated_at !== notice.published_at ? (
            <Text className="text-caption text-ink-muted">
              Edited {format(new Date(notice.updated_at), "d MMM, h:mm a")}
            </Text>
          ) : null}
          {notice.attachments.map((attachment, index) => (
            <Pressable
              key={attachment}
              accessibilityRole="link"
              accessibilityLabel={`Open attachment ${index + 1}`}
              onPress={() => Linking.openURL(attachment)}
            >
              <Text className="text-label text-ink underline">
                Open attachment {index + 1}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </Card>
  );
}
