import { Badge, Button, Card, EmptyState, Field } from "@/components/ui";
import { AdminRoute, mutationFeedback } from "@/features/admin/adminUi";
import { DateTimeField } from "@/features/admin/WorkflowFields";
import { useSupabase } from "@/lib/supabase";
import { parseInput, societyEventSchema, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHours, format } from "date-fns";
import { useState } from "react";
import { Text, View } from "react-native";

interface AdminEventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  status: string;
}

export default function EventsManageRoute() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const societyId = profile?.society_id;
  const events = useQuery({
    queryKey: ["admin-society-events", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("society_events")
        .select("id,title,description,location,starts_at,ends_at,capacity,status")
        .order("starts_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as AdminEventRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      location?: string;
      startsAt: Date;
      endsAt: Date;
      capacity?: number | null;
    }) => {
      const parsed = parseInput(societyEventSchema, input);
      if (!profile) throw new Error("Sign in required.");
      const { error } = await supabase.from("society_events").insert({
        society_id: profile.society_id,
        created_by: profile.id,
        title: parsed.title,
        description: parsed.description ?? null,
        location: parsed.location ?? null,
        starts_at: parsed.startsAt.toISOString(),
        ends_at: parsed.endsAt.toISOString(),
        capacity: parsed.capacity ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-society-events"] });
      qc.invalidateQueries({ queryKey: ["society-events"] });
      qc.invalidateQueries({ queryKey: ["society-activity"] });
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const eventId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("society_events")
        .update({ status: "cancelled" })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-society-events"] });
      qc.invalidateQueries({ queryKey: ["society-events"] });
    },
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [startsAt, setStartsAt] = useState(() => addHours(new Date(), 24));
  const [endsAt, setEndsAt] = useState(() => addHours(new Date(), 26));

  return (
    <AdminRoute
      title="Events"
      description="Publish society events. Residents RSVP from the Community Events tab."
    >
      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Description" value={description} onChangeText={setDescription} />
        <Field label="Location" value={location} onChangeText={setLocation} />
        <Field
          label="Capacity (optional)"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
        />
        <DateTimeField label="Starts" value={startsAt} minimumDate={new Date()} onChange={setStartsAt} />
        <DateTimeField label="Ends" value={endsAt} minimumDate={startsAt} onChange={setEndsAt} />
        <Button
          title="Publish event"
          disabled={title.trim().length < 2 || endsAt <= startsAt}
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              {
                title: title.trim(),
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                startsAt,
                endsAt,
                capacity: capacity.trim() ? Number(capacity) : null,
              },
              mutationFeedback("Event published", () => {
                setTitle("");
                setDescription("");
                setLocation("");
                setCapacity("");
              }),
            )
          }
        />
      </Card>

      {!events.data?.length ? <EmptyState title="No events yet" /> : null}
      {events.data?.map((event) => (
        <Card key={event.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{event.title}</Text>
            <Badge label={event.status} />
          </View>
          <Text className="text-caption text-ink-muted">
            {format(new Date(event.starts_at), "d MMM, h:mm a")} –{" "}
            {format(new Date(event.ends_at), "h:mm a")}
            {event.location ? ` · ${event.location}` : ""}
          </Text>
          {event.status === "scheduled" ? (
            <Button
              title="Cancel event"
              variant="deny"
              loading={cancel.isPending}
              onPress={() => cancel.mutate(event.id, mutationFeedback("Event cancelled"))}
            />
          ) : null}
        </Card>
      ))}
    </AdminRoute>
  );
}
