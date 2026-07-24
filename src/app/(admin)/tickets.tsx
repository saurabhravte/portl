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
import { useAdminStaffPage } from "@/features/admin/hooks";
import {
  useAddTicketComment,
  useAssignTicket,
  useMyTickets,
  useTicketComments,
  useUpdateTicketStatus,
  type TicketRow,
  type TicketStatus,
} from "@/features/tickets/hooks";
import { slaAgeLabel, slaBreached } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { formatDistanceToNow } from "date-fns";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

const filters: (TicketStatus | "all")[] = [
  "all",
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export default function AdminTickets() {
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const tickets = useMyTickets(filter);
  const { data } = tickets;

  return (
    <Screen>
      <ScrollView className="flex-1">
        <View className="gap-3 p-4">
          <Text className="text-display text-ink">Complaints</Text>

          <View className="flex-row flex-wrap gap-2">
            {filters.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`rounded-pill px-3 py-2 ${filter === f ? "bg-ink" : "bg-surface-alt"}`}
              >
                <Text
                  className={`text-caption capitalize ${filter === f ? "text-inverse" : "text-ink-soft"}`}
                >
                  {f.replace("_", " ")}
                </Text>
              </Pressable>
            ))}
          </View>

          {tickets.isLoading ? <Skeleton /> : null}
          {tickets.isError ? (
            <QueryErrorState
              error={tickets.error}
              onRetry={() => void tickets.refetch()}
              isRetrying={tickets.isRefetching}
            />
          ) : null}
          {!tickets.isLoading && !tickets.isError && !data?.length && (
            <EmptyState
              title="Queue is empty"
              hint="Resident tickets land here with category and status."
            />
          )}
          {data?.map((t) => (
            <AdminTicketCard key={t.id} ticket={t} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function AdminTicketCard({ ticket: t }: { ticket: TicketRow }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const update = useUpdateTicketStatus();
  const assign = useAssignTicket();
  const staff = useAdminStaffPage({
    search: staffSearch,
    filters: { active: true },
    limit: 50,
    enabled: assigning,
  });
  const { data: comments } = useTicketComments(open ? t.id : null);
  const addComment = useAddTicketComment();
  const myId = useSessionStore((s) => s.profile?.id);

  const breached = slaBreached(t.created_at, t.first_response_at);
  const awaitingFirstResponse = !t.first_response_at && t.status === "open";

  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View className="flex-row justify-between">
          <Text className="flex-1 text-title text-ink">{t.title}</Text>
          <Badge
            label={t.status.replace("_", " ")}
            tone={
              t.status === "resolved" || t.status === "closed"
                ? "approve"
                : "neutral"
            }
          />
        </View>
        <View className="mt-1 flex-row flex-wrap items-center gap-2">
          <Text className="text-caption text-ink-muted">{t.category}</Text>
          {/* SLA: first response within 24h (ticket #9) */}
          {awaitingFirstResponse && (
            <Badge
              label={`⏱ ${slaAgeLabel(t.created_at)}${breached ? " · SLA breached" : ""}`}
              tone={breached ? "deny" : "neutral"}
            />
          )}
          {t.assigned_staff ? (
            <Badge label={`→ ${t.assigned_staff.name}`} tone="ink" />
          ) : null}
        </View>
      </Pressable>

      <View className="flex-row flex-wrap gap-2">
        {t.status === "open" && (
          <Button
            title="Start work"
            variant="secondary"
            onPress={() => update.mutate({ id: t.id, status: "in_progress" })}
          />
        )}
        {t.status === "in_progress" && (
          <Button
            title="Mark resolved"
            onPress={() => update.mutate({ id: t.id, status: "resolved" })}
          />
        )}
        {(t.status === "open" || t.status === "in_progress") && (
          <Button
            title={t.assigned_staff ? "Reassign" : "Assign staff"}
            variant="ghost"
            onPress={() => setAssigning((a) => !a)}
          />
        )}
      </View>

      {assigning && (
        <View className="gap-2">
          <Field label="Find staff" value={staffSearch} onChangeText={setStaffSearch} />
          <View className="flex-row flex-wrap gap-2">
          {staff.data?.rows.map((s) => (
            <Pressable
              key={s.id}
              onPress={() =>
                assign.mutate(
                  { id: t.id, staffId: s.id },
                  {
                    onSuccess: () => setAssigning(false),
                    onError: (e: any) => Alert.alert("Could not assign", e.message),
                  },
                )
              }
              className="rounded-pill bg-surface-alt px-3 py-2"
            >
              <Text className="text-caption text-ink-soft">
                {s.name} · {s.category}
              </Text>
            </Pressable>
          ))}
          {!staff.data?.rows.length && (
            <Text className="text-caption text-ink-muted">
              Add staff in Manage → Staff first.
            </Text>
          )}
          </View>
        </View>
      )}

      {open && (
        <View className="gap-2 border-t border-border pt-2">
          {t.description ? (
            <Text className="text-body text-ink-soft">{t.description}</Text>
          ) : null}
          {comments?.map((c) => (
            <View
              key={c.id}
              className={`rounded-md p-2 ${c.author_id === myId ? "bg-surface-alt" : "bg-approve-bg"}`}
            >
              <Text className="text-caption text-ink-muted">
                {c.author?.name ?? "Resident"} ·{" "}
                {formatDistanceToNow(new Date(c.created_at))} ago
              </Text>
              <Text className="text-body text-ink">{c.body}</Text>
            </View>
          ))}
          {t.status !== "closed" && (
            <>
              <Field
                label="Reply"
                value={text}
                onChangeText={setText}
                placeholder="Update the resident… (first reply stops the SLA clock)"
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
                      onError: (e: any) => Alert.alert("Could not send", e.message),
                    },
                  )
                }
              />
            </>
          )}
        </View>
      )}
    </Card>
  );
}
