import {
  Badge,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import {
  useEligibleFlatCount,
  usePolls,
  useVote,
} from "@/features/community/hooks";
import { pollQuorum } from "@/features/productWorkflows/logic";
import { useSessionStore } from "@/stores/session";
import { format, isBefore } from "date-fns";
import React from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";

export function PollsPanel() {
  const { data, error, isError, isLoading, isRefetching, refetch } = usePolls();
  const vote = useVote();
  const myId = useSessionStore((s) => s.profile?.id);
  const myFlatId = useSessionStore((s) => s.profile?.flat_id);
  const role = useSessionStore((s) => s.profile?.role);
  const { data: eligibleFlats = 0 } = useEligibleFlatCount();

  if (isLoading) return <Skeleton />;
  if (isError)
    return (
      <QueryErrorState
        error={error}
        onRetry={() => void refetch()}
        isRetrying={isRefetching}
      />
    );
  if (!data?.length)
    return (
      <EmptyState
        title="No polls yet"
        hint="Your society admin can create polls."
      />
    );

  return (
    <>
      {data.map((poll) => {
        const closed =
          !!poll.closed_at || isBefore(new Date(poll.closes_at), new Date());
        const myVote = poll.votes.find(
          (v) => v.flat_id === myFlatId || v.voter_id === myId,
        );
        const useTallies = poll.is_anonymous || !!poll.tallies;
        const total = useTallies
          ? (poll.tallies?.total ?? 0)
          : poll.votes.length;
        const quorum = pollQuorum(total, eligibleFlats, poll.quorum_percent);
        return (
          <Card key={poll.id} className="gap-2">
            <View className="flex-row justify-between gap-2">
              <Text className="flex-1 text-label text-ink">{poll.question}</Text>
              <View className="items-end gap-1">
                <Badge
                  label={closed ? "Closed" : "Open"}
                  tone={closed ? "neutral" : "approve"}
                />
                {poll.is_anonymous ? (
                  <Badge label="Anonymous" tone="ink" />
                ) : null}
              </View>
            </View>
            {poll.options.map((opt, i) => {
              const count = useTallies
                ? (poll.tallies?.counts[i] ?? 0)
                : poll.votes.filter((v) => v.option_index === i).length;
              const pct = total ? Math.round((count / total) * 100) : 0;
              const showResults = closed || !!myVote || role === "admin";
              const selected = myVote?.option_index === i;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="radio"
                  accessibilityLabel={`${opt}${showResults ? `, ${pct} percent, ${count} votes` : ""}`}
                  accessibilityState={{
                    checked: selected,
                    disabled: closed || !!myVote || vote.isPending,
                  }}
                  disabled={closed || !!myVote || vote.isPending}
                  onPress={() =>
                    vote.mutate(
                      { pollId: poll.id, optionIndex: i },
                      {
                        onError: (e: any) =>
                          Alert.alert("Could not vote", e.message),
                      },
                    )
                  }
                  className={`rounded-md border bg-surface p-3 ${selected ? "border-ink" : "border-border"}`}
                >
                  <View className="flex-row justify-between">
                    <Text className="text-body text-ink-soft">{opt}</Text>
                    {showResults ? (
                      <Text className="text-caption text-ink-muted">
                        {pct}% ({count})
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            <Text className="text-caption text-ink-muted">
              {closed
                ? `Closed ${format(new Date(poll.closes_at), "d MMM")}`
                : `Closes ${format(new Date(poll.closes_at), "d MMM, h:mm a")}`}{" "}
              · {total} vote{total === 1 ? "" : "s"}
              {poll.is_anonymous ? " · ballots hidden" : ""}
            </Text>
            {poll.quorum_percent > 0 ? (
              <Text
                className={`text-caption ${quorum.met ? "text-approve" : "text-ink-muted"}`}
              >
                Quorum {quorum.met ? "met" : "not met"} · {total}/
                {quorum.required} flats ({poll.quorum_percent}%)
              </Text>
            ) : null}
            {!!poll.attachments?.length ? (
              <View className="flex-row flex-wrap gap-2">
                {poll.attachments.map((attachment) => (
                  <Pressable
                    key={attachment}
                    accessibilityRole="link"
                    onPress={() => Linking.openURL(attachment)}
                  >
                    <Badge label="Open attachment" tone="ink" />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
