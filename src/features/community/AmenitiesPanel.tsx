import { formatMoney } from "@/lib/money";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import {
  matchesAmenityCategory,
  type AmenityCategoryFilter,
} from "@/features/community/amenityCategory";
import {
  useAmenities,
  useBookAmenity,
  useBookAmenitySeries,
  useBookings,
  useCancelBooking,
  useJoinAmenityWaitlist,
} from "@/features/community/hooks";
import { payAmenityWithRazorpay } from "@/features/payments/razorpay";
import { buildAmenitySlots } from "@/features/productWorkflows/logic";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useThemeColors } from "@/theme/useThemeColors";
import { format } from "date-fns";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export function AmenitiesPanel({
  categoryFilter = "all",
}: {
  categoryFilter?: AmenityCategoryFilter;
}) {
  const supabase = useSupabase();
  const colors = useThemeColors();
  const {
    data: amenities,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useAmenities();
  const { data: bookings, refetch: refetchBookings } = useBookings();
  const book = useBookAmenity();
  const bookSeries = useBookAmenitySeries();
  const waitlist = useJoinAmenityWaitlist();
  const cancel = useCancelBooking();
  const profile = useSessionStore((s) => s.profile);
  const [picking, setPicking] = useState<string | null>(null);
  const [repeatWeekly, setRepeatWeekly] = useState(false);

  const filtered = useMemo(
    () =>
      (amenities ?? []).filter((a) =>
        matchesAmenityCategory(a.name, a.description, categoryFilter),
      ),
    [amenities, categoryFilter],
  );

  const onCancel = (bookingId: string, amenityName: string, startsAt: string, latePenalty: number) => {
    Alert.alert(
      "Cancel booking?",
      `${amenityName} on ${format(new Date(startsAt), "d MMM, h:mm a")} will become available to others.`,
      [
        { text: "Keep booking", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: () =>
            cancel.mutate(
              { bookingId },
              {
                onError: (e) => {
                  const msg = e instanceof Error ? e.message : "";
                  if (msg.toLowerCase().includes("penalty") || msg.toLowerCase().includes("closed")) {
                    Alert.alert(
                      "Late cancellation",
                      latePenalty > 0
                        ? `The free-cancel window has closed. Cancel anyway and accept a ${formatMoney(latePenalty)} penalty?`
                        : "The free-cancel window has closed.",
                      latePenalty > 0
                        ? [
                            { text: "Keep booking", style: "cancel" },
                            {
                              text: "Accept penalty",
                              style: "destructive",
                              onPress: () =>
                                cancel.mutate({ bookingId, acceptPenalty: true }),
                            },
                          ]
                        : [{ text: "OK" }],
                    );
                    return;
                  }
                  Alert.alert("Couldn’t cancel", msg);
                },
              },
            ),
        },
      ],
    );
  };

  const onPay = async (bookingId: string) => {
    const row = bookings?.find((b) => b.id === bookingId);
    if (!row) return;
    const result = await payAmenityWithRazorpay({
      supabase,
      booking: {
        id: row.id,
        payment_amount: row.payment_amount,
        amenity: row.amenity,
      },
      user: {
        name: profile?.name,
        email: null,
        phone: null,
      },
      colors,
    });
    if (result.status === "paid") {
      Alert.alert("Paid", "Your amenity booking is confirmed.");
      void refetchBookings();
    }
  };

  if (isLoading) return <Skeleton />;
  if (isError)
    return (
      <QueryErrorState
        error={error}
        onRetry={() => {
          void refetch();
          void refetchBookings();
        }}
        isRetrying={isRefetching}
      />
    );
  if (!amenities?.length)
    return (
      <EmptyState
        title="No amenities"
        hint="Your admin hasn't added any bookable amenities yet."
      />
    );

  const mine = bookings?.filter((b) => b.booked_by === profile?.id) ?? [];

  if (!filtered.length)
    return (
      <EmptyState
        title="Nothing in this category"
        hint="Try All, or ask your admin to add more amenities."
      />
    );

  return (
    <>
      {mine.length > 0 && categoryFilter === "all" ? (
        <Card className="gap-2">
          <Text className="text-label text-ink">Your bookings</Text>
          {mine.map((b) => {
            const amenity = amenities?.find((a) => a.id === b.amenity_id);
            return (
              <View key={b.id} className="gap-2 border-t border-hairline pt-2">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-body text-ink-soft">
                    {b.amenity.name} ·{" "}
                    {format(new Date(b.starts_at), "d MMM, h:mm a")}
                  </Text>
                  {b.status === "pending" ? (
                    <Badge label="Approval pending" tone="neutral" />
                  ) : null}
                  {b.status === "pending_payment" ? (
                    <Badge label="Pay to confirm" tone="deny" />
                  ) : null}
                  {b.status === "confirmed" && b.checked_in_at ? (
                    <Badge label="Checked in" tone="approve" />
                  ) : null}
                </View>
                {b.status === "confirmed" && b.access_code ? (
                  <View className="items-center gap-1 py-2">
                    <QRCode value={b.access_code} size={120} />
                    <Text className="text-caption text-ink-muted">
                      Access code {b.access_code}
                    </Text>
                  </View>
                ) : null}
                {b.status === "pending_payment" ? (
                  <Button title="Pay now" onPress={() => void onPay(b.id)} />
                ) : null}
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() =>
                    onCancel(
                      b.id,
                      b.amenity.name,
                      b.starts_at,
                      Number(amenity?.late_cancel_penalty ?? 0),
                    )
                  }
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      {filtered.map((a) => {
        const priceLabel =
          Number(a.price) > 0
            ? `${formatMoney(a.price)} / ${a.slot_minutes} mins`
            : "Free";
        const timing = `${a.open_time.slice(0, 5)} – ${a.close_time.slice(0, 5)}`;
        return (
          <Card key={a.id} className="gap-2">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-title text-ink">{a.name}</Text>
                {a.description ? (
                  <Text className="text-caption text-ink-muted" numberOfLines={2}>
                    {a.description}
                  </Text>
                ) : null}
                <Text className="text-caption text-ink-muted">
                  Capacity: {a.capacity} · Daily timing: {timing}
                </Text>
              </View>
              <Text className="text-label text-primary">{priceLabel}</Text>
            </View>
            {a.rules ? (
              <Text className="text-body text-ink-soft">{a.rules}</Text>
            ) : null}
            <Text className="text-caption text-ink-muted">
              Cancel at least {a.cancellation_cutoff_minutes} min before
              {Number(a.late_cancel_penalty) > 0
                ? ` · late cancel ${formatMoney(a.late_cancel_penalty)}`
                : ""}
              {Number(a.no_show_penalty) > 0
                ? ` · no-show ${formatMoney(a.no_show_penalty)}`
                : ""}
              {a.requires_approval ? " · admin approval required" : ""}
            </Text>
            {picking === a.id ? (
              <>
                <Button
                  title={repeatWeekly ? "Repeating weekly (4 weeks)" : "One-time booking"}
                  variant="ghost"
                  size="sm"
                  onPress={() => setRepeatWeekly((v) => !v)}
                />
                <View className="flex-row flex-wrap gap-2">
                  {buildAmenitySlots(
                    a,
                    (bookings ?? []).filter((booking) => booking.amenity_id === a.id),
                    new Date(),
                    12,
                    { includeFull: true },
                  ).map((s) => (
                    <Pressable
                      key={s.start.toISOString()}
                      accessibilityRole="button"
                      accessibilityLabel={
                        s.remaining > 0
                          ? `Book ${a.name} on ${format(s.start, "EEEE at h:mm a")}`
                          : `Join waitlist for ${a.name} on ${format(s.start, "EEEE at h:mm a")}`
                      }
                      onPress={() => {
                        if (s.remaining <= 0) {
                          waitlist.mutate(
                            {
                              amenityId: a.id,
                              startsAt: s.start,
                              endsAt: s.end,
                            },
                            {
                              onSuccess: () => {
                                setPicking(null);
                                Alert.alert("Waitlisted", "We’ll notify you if a spot opens.");
                              },
                              onError: (e: any) =>
                                Alert.alert("Waitlist failed", e.message ?? "Try again."),
                            },
                          );
                          return;
                        }
                        if (repeatWeekly) {
                          bookSeries.mutate(
                            { amenityId: a.id, startsAt: s.start, weeks: 4 },
                            {
                              onSuccess: (result) => {
                                setPicking(null);
                                Alert.alert(
                                  "Series booked",
                                  `${result.bookedCount} slots booked` +
                                    (result.skipped ? `, ${result.skipped} skipped` : ""),
                                );
                              },
                              onError: (e: any) =>
                                Alert.alert("Series unavailable", e.message ?? "Try another slot."),
                            },
                          );
                          return;
                        }
                        book.mutate(
                          {
                            amenityId: a.id,
                            startsAt: s.start,
                            endsAt: s.end,
                          },
                          {
                            onSuccess: () => {
                              setPicking(null);
                              if (Number(a.price) > 0) {
                                Alert.alert(
                                  "Payment required",
                                  "Your slot is held — pay from Your bookings to confirm.",
                                );
                              }
                            },
                            onError: (e: any) =>
                              Alert.alert(
                                "Slot unavailable",
                                e.message ?? "Someone just booked it.",
                              ),
                          },
                        );
                      }}
                      className="rounded-md bg-surface-alt px-3 py-2"
                    >
                      <Text className="text-caption text-ink-muted">
                        {format(s.start, "EEE h:mm a")} ·{" "}
                        {s.remaining > 0 ? `${s.remaining} left` : "Waitlist"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Button
                title="Book a slot"
                variant="secondary"
                onPress={() => {
                  setRepeatWeekly(false);
                  setPicking(a.id);
                }}
              />
            )}
          </Card>
        );
      })}
    </>
  );
}
