import {
  Badge,
  Button,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { useSupabase } from "@/lib/supabase";
import { eventRsvpSchema, parseInput } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import React from "react";
import { Alert, Share, Text, View } from "react-native";
import { useCalendarFeedUrl } from "@/features/community/extras";

export interface SocietyEventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  status: "scheduled" | "cancelled" | "completed";
  created_at: string;
  rsvps: { profile_id: string; response: "going" | "maybe" | "declined" }[];
}

function useSocietyEvents() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["society-events", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("society_events")
        .select(
          "id,title,description,location,starts_at,ends_at,capacity,status,created_at,rsvps:event_rsvps(profile_id,response)",
        )
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true })
        .limit(40);
      if (error) throw error;
      return data as unknown as SocietyEventRow[];
    },
  });
}

function useEventRsvp() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      response: "going" | "maybe" | "declined";
    }) => {
      const parsed = parseInput(eventRsvpSchema, input);
      const { error } = await supabase.rpc("upsert_event_rsvp", {
        p_event_id: parsed.eventId,
        p_response: parsed.response,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["society-events"] }),
  });
}

export function EventsPanel() {
  const events = useSocietyEvents();
  const rsvp = useEventRsvp();
  const myId = useSessionStore((s) => s.profile?.id);
  const feed = useCalendarFeedUrl();

  if (events.isLoading) return <Skeleton />;
  if (events.isError)
    return (
      <QueryErrorState
        error={events.error}
        onRetry={() => void events.refetch()}
        isRetrying={events.isRefetching}
      />
    );

  return (
    <>
      {feed.data ? (
        <Card className="gap-2">
          <Text className="text-label text-ink">Add to Google Calendar</Text>
          <Text className="text-caption text-ink-muted">
            Subscribe with this ICS feed (works in Google Calendar, Apple Calendar, Outlook).
          </Text>
          <Button
            title="Copy calendar link"
            variant="secondary"
            onPress={() => {
              void Share.share({ message: feed.data!, url: feed.data! }).catch(
                () => Alert.alert("Calendar link", feed.data!),
              );
            }}
          />
        </Card>
      ) : null}
      {!events.data?.length ? (
        <EmptyState
          title="No upcoming events"
          hint="Society admins can publish events from Manage."
        />
      ) : null}
      {events.data?.map((event) => {
        const mine = event.rsvps.find((r) => r.profile_id === myId);
        const going = event.rsvps.filter((r) => r.response === "going").length;
        return (
          <Card key={event.id} className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-title text-ink">{event.title}</Text>
              <Badge label={event.status} />
            </View>
            <Text className="text-body text-ink-soft">
              {format(new Date(event.starts_at), "d MMM, h:mm a")}
              {" – "}
              {format(new Date(event.ends_at), "h:mm a")}
            </Text>
            {event.location ? (
              <Text className="text-caption text-ink-muted">{event.location}</Text>
            ) : null}
            {event.description ? (
              <Text className="text-caption text-ink-muted">{event.description}</Text>
            ) : null}
            <Text className="text-caption text-ink-muted">
              {going} going
              {event.capacity ? ` · capacity ${event.capacity}` : ""}
              {mine ? ` · you: ${mine.response}` : ""}
            </Text>
            {event.status === "scheduled" ? (
              <View className="flex-row flex-wrap gap-2">
                {(["going", "maybe", "declined"] as const).map((response) => (
                  <Button
                    key={response}
                    title={response}
                    size="sm"
                    variant={mine?.response === response ? "primary" : "ghost"}
                    selected={mine?.response === response}
                    loading={rsvp.isPending}
                    onPress={() =>
                      rsvp.mutate(
                        { eventId: event.id, response },
                        {
                          onError: (e) =>
                            Alert.alert(
                              "RSVP failed",
                              e instanceof Error ? e.message : "",
                            ),
                        },
                      )
                    }
                  />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
