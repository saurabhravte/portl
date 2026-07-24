import { PrivateMediaImage } from "@/components/PrivateMediaImage";
import {
  BackControl,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  QueryErrorState,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { useRouter } from "expo-router";
import {
  useAddTicketComment,
  useMyTickets,
  useRaiseTicket,
  useTicketComments,
  useTicketStatusHistory,
  useUpdateTicketStatus,
  type TicketRow,
  type TicketStatus,
} from "@/features/tickets/hooks";
import { useGiveKudos } from "@/features/community/extras";
import { pickAndUploadPhoto } from "@/lib/photos";
import { useSupabase } from "@/lib/supabase";
import { slaAgeLabel, slaBreached } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { formatDistanceToNow } from "date-fns";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

const categories = [
  "Plumbing",
  "Electrical",
  "Housekeeping",
  "Lift",
  "Security",
  "App issue",
  "Other",
];

export default function Helpdesk() {
  const router = useRouter();
  const supabase = useSupabase();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const { data, error, isError, isLoading, isRefetching, refetch } =
    useMyTickets(statusFilter);
  const raise = useRaiseTicket();
  const [category, setCategory] = useState(categories[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto(supabase, "tickets");
      if (url) setPhotoUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const onRaise = () => {
    if (!title.trim()) {
      Alert.alert("Add a title", "One line about the problem.");
      return;
    }
    raise.mutate(
      {
        category,
        title: title.trim(),
        description: description.trim(),
        photos: photoUrl ? [photoUrl] : [],
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setPhotoUrl(null);
        },
        onError: (e: any) => Alert.alert("Could not raise", e.message),
      },
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
            />
          }
        >
          <View className="gap-4 p-4">
            <BackControl
              label="Back"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/(resident)/home" as any);
              }}
            />
            <Text className="text-display text-ink">My Complaints</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {(["all", "open", "in_progress", "resolved"] as const).map(
                (f) => (
                  <Chip
                    key={f}
                    label={
                      f === "all"
                        ? "All"
                        : f === "in_progress"
                          ? "In Progress"
                          : f[0].toUpperCase() + f.slice(1)
                    }
                    selected={statusFilter === f}
                    onPress={() => setStatusFilter(f)}
                  />
                ),
              )}
            </ScrollView>
            <Card>
              <View className="flex-row flex-wrap gap-2">
                {categories.map((c) => (
                  <Button
                    key={c}
                    title={c}
                    variant={category === c ? "primary" : "ghost"}
                    selected={category === c}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </View>
              <Field
                label="What's wrong?"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Kitchen tap leaking"
              />
              <Field
                label="Details (optional)"
                value={description}
                onChangeText={setDescription}
                multiline
                className="min-h-20 pt-3"
              />
              <Button
                title={photoUrl ? "Change photo" : "Attach photo"}
                variant="secondary"
                loading={uploading}
                onPress={onPhoto}
              />
              {photoUrl ? (
                <View className="h-35 w-full overflow-hidden rounded-md">
                  <PrivateMediaImage
                    reference={photoUrl}
                    className="h-full w-full"
                    contentFit="cover"
                  />
                </View>
              ) : null}
              <Button
                title="Raise ticket"
                onPress={onRaise}
                loading={raise.isPending}
              />
            </Card>

            <SectionTitle>Your tickets</SectionTitle>
            {isLoading ? (
              <View className="h-24 rounded-lg bg-surface-alt" />
            ) : null}
            {!isLoading && isError ? (
              <QueryErrorState
                error={error}
                onRetry={() => void refetch()}
                isRetrying={isRefetching}
                title="Couldn’t load your tickets"
              />
            ) : null}
            {!isLoading && !isError && !data?.length && (
              <EmptyState
                title="No tickets"
                hint="Raise one above — the society team gets it instantly."
                actionLabel="Refresh"
                onAction={() => void refetch()}
              />
            )}
            {data?.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const statusTone = (status: string) =>
  status === "resolved" || status === "closed"
    ? ("approve" as const)
    : status === "in_progress"
      ? ("warn" as const)
      : ("deny" as const);

function TicketCard({ ticket: t }: { ticket: TicketRow }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { data: comments } = useTicketComments(open ? t.id : null);
  const { data: history } = useTicketStatusHistory(open ? t.id : null);
  const addComment = useAddTicketComment();
  const updateStatus = useUpdateTicketStatus();
  const kudos = useGiveKudos();
  const myId = useSessionStore((s) => s.profile?.id);

  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View className="flex-row justify-between">
          <Text className="flex-1 text-title text-ink">{t.title}</Text>
          <Badge
            label={
              t.status === "in_progress"
                ? "In Progress"
                : t.status[0].toUpperCase() + t.status.slice(1).replace("_", " ")
            }
            tone={statusTone(t.status)}
          />
        </View>
        <Text className="text-caption text-ink-muted">
          {t.category}
          {t.flat?.number ? ` · Flat ${t.flat.number}` : ""}
          {` · #CMP-${t.id.slice(0, 4).toUpperCase()}`}
          {t.assigned_staff ? ` · ${t.assigned_staff.name}` : ""}
          {" · "}
          {formatDistanceToNow(new Date(t.created_at))} ago
        </Text>
        {!t.first_response_at && t.status !== "closed" ? (
          <Text
            className={`text-caption ${slaBreached(t.created_at, t.first_response_at) ? "text-deny" : "text-ink-muted"}`}
          >
            First-response SLA: {slaAgeLabel(t.created_at)}
            {slaBreached(t.created_at, t.first_response_at)
              ? " · overdue"
              : " · target under 24h"}
          </Text>
        ) : t.first_response_at ? (
          <Text className="text-caption text-approve">
            Team responded {formatDistanceToNow(new Date(t.first_response_at))}{" "}
            ago
          </Text>
        ) : null}
      </Pressable>

      {open && (
        <View className="gap-2 border-t border-border pt-2">
          {t.description ? (
            <Text className="text-body text-ink-soft">{t.description}</Text>
          ) : null}
          {!!t.photos?.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {t.photos.map((photo) => (
                <PrivateMediaImage
                  key={photo}
                  reference={photo}
                  className="h-32 w-40 rounded-md bg-surface-alt"
                  contentFit="cover"
                  accessibilityLabel={`Attachment for ${t.title}`}
                />
              ))}
            </ScrollView>
          ) : null}
          <View className="gap-1 rounded-md bg-surface-alt p-3">
            <Text className="text-label text-ink">Status history</Text>
            {!history?.length ? (
              <Text className="text-caption text-ink-muted">
                Current status: {t.status.replace("_", " ")}
              </Text>
            ) : null}
            {history?.map((event) => (
              <Text key={event.id} className="text-caption text-ink-muted">
                {formatDistanceToNow(new Date(event.created_at))} ago ·{" "}
                {event.to_status.replace("_", " ")}
                {event.assigned_staff?.name
                  ? ` · assigned to ${event.assigned_staff.name}`
                  : ""}
              </Text>
            ))}
          </View>

          {comments?.map((c) => (
            <View
              key={c.id}
              className={`rounded-md p-2 ${c.author_id === myId ? "bg-surface-alt" : "bg-approve-bg"}`}
            >
              <Text className="text-caption text-ink-muted">
                {c.author?.name ?? "Team"} ·{" "}
                {formatDistanceToNow(new Date(c.created_at))} ago
              </Text>
              <Text className="text-body text-ink">{c.body}</Text>
              {c.author_id !== myId && c.author?.role === "resident" ? (
                <Button
                  title="Thanks — helpful"
                  size="sm"
                  variant="ghost"
                  loading={kudos.isPending}
                  onPress={() =>
                    kudos.mutate(
                      {
                        toProfileId: c.author_id,
                        reason: "helpdesk",
                        refId: t.id,
                      },
                      {
                        onSuccess: (r) =>
                          Alert.alert(
                            "Thanks sent",
                            r.helpful_badge
                              ? "They earned the Helpful Resident badge."
                              : `${r.kudos_90d} thanks in the last 90 days.`,
                          ),
                        onError: (e: Error) =>
                          Alert.alert("Couldn’t send thanks", e.message),
                      },
                    )
                  }
                />
              ) : null}
            </View>
          ))}

          {t.status !== "closed" && (
            <>
              <Field
                label="Add a comment"
                value={text}
                onChangeText={setText}
                placeholder="Reply to the society team…"
              />
              <Button
                title="Send"
                variant="secondary"
                loading={addComment.isPending}
                disabled={!text.trim()}
                onPress={() =>
                  addComment.mutate(
                    { ticketId: t.id, body: text.trim() },
                    {
                      onSuccess: () => setText(""),
                      onError: (e: any) =>
                        Alert.alert("Could not send", e.message),
                    },
                  )
                }
              />
            </>
          )}

          {t.status === "resolved" && (
            <View className="flex-row gap-2">
              <Button
                title="Confirm fixed"
                variant="approve"
                className="grow"
                loading={updateStatus.isPending}
                onPress={() =>
                  Alert.alert(
                    "Close this ticket?",
                    "Confirm that the issue is fixed. You can still reopen it later.",
                    [
                      { text: "Not yet", style: "cancel" },
                      {
                        text: "Confirm fixed",
                        onPress: () =>
                          updateStatus.mutate({ id: t.id, status: "closed" }),
                      },
                    ],
                  )
                }
              />
              <Button
                title="Reopen"
                variant="ghost"
                className="grow"
                loading={updateStatus.isPending}
                onPress={() =>
                  updateStatus.mutate({ id: t.id, status: "open" })
                }
              />
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
