import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import { AdminRoute, mutationFeedback, SearchAndPagination, useAdminCursorPager } from "@/features/admin/adminUi";
import { useAdminPollsPage } from "@/features/admin/hooks";
import { DateTimeField, TargetPicker } from "@/features/admin/WorkflowFields";
import {
  type PollRow,
  useClosePoll,
  useCreatePoll,
  useDeletePoll,
  useUpdatePoll,
} from "@/features/community/hooks";
import { pickAndUploadPhoto } from "@/lib/photos";
import { useSupabase } from "@/lib/supabase";
import { pollStatus, validPollOptions } from "@/features/productWorkflows/batch4Logic";
import { addDays, addHours, format } from "date-fns";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

export default function PollsRoute() {
  const create = useCreatePoll();
  const update = useUpdatePoll();
  const close = useClosePoll();
  const remove = useDeletePoll();
  const supabase = useSupabase();
  const [editing, setEditing] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [opensAt, setOpensAt] = useState(() => addHours(new Date(), 1));
  const [closesAt, setClosesAt] = useState(() => addDays(new Date(), 7));
  const [quorum, setQuorum] = useState("0");
  const [towerIds, setTowerIds] = useState<string[]>([]);
  const [flatIds, setFlatIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [search, setSearch] = useState("");
  const pager = useAdminCursorPager(search.trim());
  const polls = useAdminPollsPage<Omit<PollRow, "votes" | "notified_at"> & { vote_count: number }>({
    search, after: pager.cursor, limit: 10,
  });
  const options = optionsText.split(",").map((value) => value.trim()).filter(Boolean);
  const validOptions = validPollOptions(options);
  const validQuorum = Number.isInteger(Number(quorum)) && Number(quorum) >= 0 && Number(quorum) <= 100;

  const reset = () => {
    setEditing(null);
    setQuestion("");
    setOptionsText("");
    setOpensAt(addHours(new Date(), 1));
    setClosesAt(addDays(new Date(), 7));
    setQuorum("0");
    setTowerIds([]);
    setFlatIds([]);
    setAttachments([]);
    setIsAnonymous(false);
  };

  const edit = (poll: Omit<PollRow, "votes" | "notified_at"> & { vote_count: number }) => {
    setEditing(poll.id);
    setQuestion(poll.question);
    setOptionsText(poll.options.join(", "));
    setOpensAt(new Date(poll.opens_at));
    setClosesAt(new Date(poll.closes_at));
    setQuorum(String(poll.quorum_percent));
    setTowerIds(poll.target_tower_ids);
    setFlatIds(poll.target_flat_ids);
    setAttachments(poll.attachments);
    setIsAnonymous(!!(poll as { is_anonymous?: boolean }).is_anonymous);
  };

  const save = () => {
    const feedback = mutationFeedback(editing ? "Poll updated" : "Poll created", reset);
    if (editing) {
      update.mutate({
        id: editing,
        changes: {
          question: question.trim(),
          options,
          opens_at: opensAt.toISOString(),
          closes_at: closesAt.toISOString(),
          quorum_percent: Number(quorum),
          target_tower_ids: towerIds,
          target_flat_ids: flatIds,
          attachments,
          is_anonymous: isAnonymous,
        },
      }, feedback);
    } else {
      create.mutate({
        question: question.trim(),
        options,
        opensAt,
        closesAt,
        quorumPercent: Number(quorum),
        isAnonymous,
        targetTowerIds: towerIds,
        targetFlatIds: flatIds,
        attachments,
      }, feedback);
    }
  };

  return (
    <AdminRoute title="Polls" description="Schedule targeted ballots, set quorum, and manage the full lifecycle.">
      <Card>
        <Field label="Question" value={question} onChangeText={setQuestion} />
        <Field label="Options (2–6, comma separated)" value={optionsText} onChangeText={setOptionsText} />
        <Field label="Quorum percent" value={quorum} onChangeText={setQuorum} keyboardType="number-pad" />
        {!validOptions || !validQuorum ? (
          <Text className="text-caption text-deny">Use 2–6 unique options and a quorum from 0–100.</Text>
        ) : null}
        <DateTimeField label="Opens at" value={opensAt} minimumDate={new Date()} onChange={setOpensAt} />
        <DateTimeField label="Closes at" value={closesAt} minimumDate={opensAt} onChange={setClosesAt} />
        <TargetPicker
          towerIds={towerIds}
          flatIds={flatIds}
          onTowerIdsChange={setTowerIds}
          onFlatIdsChange={setFlatIds}
        />
        <Button
          title={isAnonymous ? "Anonymous ballots: ON" : "Anonymous ballots: OFF"}
          variant={isAnonymous ? "primary" : "ghost"}
          selected={isAnonymous}
          onPress={() => setIsAnonymous((v) => !v)}
        />
        <Text className="text-caption text-ink-muted">
          Anonymous polls hide who voted for what. Admins still keep an immutable audit trail.
        </Text>
        <Button
          title={attachments.length ? "Replace attachment" : "Add private attachment"}
          variant="secondary"
          onPress={() => void pickAndUploadPhoto(supabase, "polls").then((path) => path && setAttachments([path]))}
        />
        <Button
          title={editing ? "Save poll" : "Create poll"}
          loading={create.isPending || update.isPending}
          disabled={!question.trim() || !validOptions || !validQuorum || closesAt <= opensAt}
          onPress={save}
        />
        {editing ? <Button title="Cancel editing" variant="ghost" onPress={reset} /> : null}
      </Card>
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={Math.max(1, Math.ceil((polls.data?.total_count ?? 0) / 10))}
        resultCount={polls.data?.total_count ?? 0}
        onPageChange={(page) => page > pager.page ? pager.next(polls.data?.next_cursor) : pager.previous()}
        placeholder="Search poll questions"
      />
      {polls.isLoading ? <Skeleton /> : null}
      {polls.isError ? (
        <QueryErrorState error={polls.error} onRetry={() => void polls.refetch()} />
      ) : null}
      {!polls.isLoading && !polls.data?.rows.length ? <EmptyState title="No polls" /> : null}
      {polls.data?.rows.map((poll) => {
        const status = pollStatus(poll.opens_at, poll.closes_at, poll.closed_at);
        const scheduled = status === "scheduled";
        const open = status === "open";
        return (
          <Card key={poll.id}>
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-title text-ink">{poll.question}</Text>
              <Badge label={scheduled ? "Scheduled" : open ? "Open" : "Closed"} tone={open ? "approve" : "neutral"} />
            </View>
            <Text className="text-caption text-ink-muted">
              {poll.vote_count} votes · quorum {poll.quorum_percent}% · opens {format(new Date(poll.opens_at), "d MMM, h:mm a")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {scheduled ? <Button title="Edit" variant="secondary" onPress={() => edit(poll)} /> : null}
              {open ? (
                <Button
                  title="Close now"
                  variant="deny"
                  loading={close.isPending}
                  onPress={() => Alert.alert("Close poll?", "Voting will stop immediately.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Close", style: "destructive", onPress: () => close.mutate(poll.id) },
                  ])}
                />
              ) : null}
              <Button
                title="Delete"
                variant="ghost"
                loading={remove.isPending}
                onPress={() => Alert.alert("Delete poll?", "Votes and results will be permanently removed.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => remove.mutate(poll.id) },
                ])}
              />
            </View>
          </Card>
        );
      })}
    </AdminRoute>
  );
}
