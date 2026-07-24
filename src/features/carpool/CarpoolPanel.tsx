import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { DateTimeField } from "@/features/admin/WorkflowFields";
import { useSupabase } from "@/lib/supabase";
import {
  carpoolClaimSchema,
  carpoolRideSchema,
  parseInput,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHours, format } from "date-fns";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

export interface CarpoolRideRow {
  id: string;
  origin: string;
  destination: string;
  depart_at: string;
  seats_total: number;
  seats_taken: number;
  notes: string | null;
  vehicle_label: string | null;
  status: "open" | "full" | "cancelled" | "completed";
  created_by: string;
  created_at: string;
}

function useCarpoolRides() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["carpool-rides", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carpool_rides")
        .select(
          "id,origin,destination,depart_at,seats_total,seats_taken,notes,vehicle_label,status,created_by,created_at",
        )
        .gte("depart_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .order("depart_at", { ascending: true })
        .limit(40);
      if (error) throw error;
      return data as unknown as CarpoolRideRow[];
    },
  });
}

function useOfferRide() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      origin: string;
      destination: string;
      departAt: Date;
      seatsTotal: number;
      notes?: string;
      vehicleLabel?: string;
    }) => {
      const parsed = parseInput(carpoolRideSchema, input);
      if (!profile) throw new Error("Sign in required.");
      const { error } = await supabase.from("carpool_rides").insert({
        society_id: profile.society_id,
        created_by: profile.id,
        flat_id: profile.flat_id,
        origin: parsed.origin,
        destination: parsed.destination,
        depart_at: parsed.departAt.toISOString(),
        seats_total: parsed.seatsTotal,
        notes: parsed.notes ?? null,
        vehicle_label: parsed.vehicleLabel ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["carpool-rides"] });
      qc.invalidateQueries({ queryKey: ["society-activity"] });
    },
  });
}

function useClaimSeat() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rideId: string; seats?: number }) => {
      const parsed = parseInput(carpoolClaimSchema, input);
      const { error } = await supabase.rpc("claim_carpool_seat", {
        p_ride_id: parsed.rideId,
        p_seats: parsed.seats,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["carpool-rides"] }),
  });
}

export function CarpoolPanel() {
  const rides = useCarpoolRides();
  const offer = useOfferRide();
  const claim = useClaimSeat();
  const myId = useSessionStore((s) => s.profile?.id);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departAt, setDepartAt] = useState(() => addHours(new Date(), 2));
  const [seats, setSeats] = useState("3");

  if (rides.isLoading) return <Skeleton />;
  if (rides.isError)
    return (
      <QueryErrorState
        error={rides.error}
        onRetry={() => void rides.refetch()}
        isRetrying={rides.isRefetching}
      />
    );

  return (
    <>
      <Card className="gap-2">
        <Text className="text-title text-ink">Offer a ride</Text>
        <Field label="From" value={origin} onChangeText={setOrigin} placeholder="Society gate" />
        <Field label="To" value={destination} onChangeText={setDestination} placeholder="Airport" />
        <DateTimeField label="Depart" value={departAt} minimumDate={new Date()} onChange={setDepartAt} />
        <Field label="Seats" value={seats} onChangeText={setSeats} keyboardType="number-pad" />
        <Button
          title="Publish ride"
          disabled={origin.trim().length < 2 || destination.trim().length < 2}
          loading={offer.isPending}
          onPress={() =>
            offer.mutate(
              {
                origin: origin.trim(),
                destination: destination.trim(),
                departAt,
                seatsTotal: Math.min(8, Math.max(1, Number(seats) || 1)),
              },
              {
                onSuccess: () => {
                  setOrigin("");
                  setDestination("");
                },
                onError: (e) =>
                  Alert.alert("Couldn’t publish", e instanceof Error ? e.message : ""),
              },
            )
          }
        />
      </Card>

      {!rides.data?.length ? <EmptyState title="No upcoming rides" /> : null}
      {rides.data?.map((ride) => {
        const seatsLeft = ride.seats_total - ride.seats_taken;
        return (
          <Card key={ride.id} className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-title text-ink">
                {ride.origin} → {ride.destination}
              </Text>
              <Badge label={ride.status} tone={ride.status === "open" ? "approve" : "neutral"} />
            </View>
            <Text className="text-body text-ink-soft">
              {format(new Date(ride.depart_at), "d MMM, h:mm a")} · {seatsLeft} seat
              {seatsLeft === 1 ? "" : "s"} left
            </Text>
            {ride.notes ? (
              <Text className="text-caption text-ink-muted">{ride.notes}</Text>
            ) : null}
            {ride.created_by !== myId && ride.status === "open" ? (
              <Button
                title="Claim 1 seat"
                loading={claim.isPending}
                onPress={() =>
                  claim.mutate(
                    { rideId: ride.id, seats: 1 },
                    {
                      onError: (e) =>
                        Alert.alert(
                          "Couldn’t claim",
                          e instanceof Error ? e.message : "",
                        ),
                    },
                  )
                }
              />
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
