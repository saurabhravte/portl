import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import { AdminRoute, FilterChips, mutationFeedback, SearchAndPagination, useAdminCursorPager } from "@/features/admin/adminUi";
import { useAdminAmenitiesPage, useAdminBookingsPage } from "@/features/admin/hooks";
import {
  type AmenityRow,
  type BookingRow,
  useAmenityUsageStats,
  useDecideAmenityBooking,
  useMarkAmenityNoShows,
  useSaveAmenity,
} from "@/features/community/hooks";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";
import { useState } from "react";
import { Text, View } from "react-native";

type Form = {
  name: string; description: string; open: string; close: string; slot: string;
  capacity: string; price: string; cutoff: string; latePenalty: string; noShowPenalty: string;
  grace: string; rules: string; blackouts: string;
  approval: boolean; active: boolean;
};
const EMPTY: Form = {
  name: "", description: "", open: "08:00", close: "22:00", slot: "60",
  capacity: "1", price: "0", cutoff: "60", latePenalty: "0", noShowPenalty: "0",
  grace: "15", rules: "", blackouts: "",
  approval: false, active: true,
};

export default function AmenitiesRoute() {
  const saveAmenity = useSaveAmenity();
  const decide = useDecideAmenityBooking();
  const markNoShows = useMarkAmenityNoShows();
  const usage = useAmenityUsageStats(30);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [rejectionReason, setRejectionReason] = useState("");
  const [facilitySearch, setFacilitySearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingView, setBookingView] = useState<"pending" | "decided">("pending");
  const facilityPager = useAdminCursorPager(facilitySearch.trim());
  const bookingPager = useAdminCursorPager(`${bookingSearch.trim()}:${bookingView}`);
  const amenities = useAdminAmenitiesPage<AmenityRow>({
    search: facilitySearch, after: facilityPager.cursor, limit: 10,
  });
  const bookings = useAdminBookingsPage<BookingRow>({
    search: bookingSearch, after: bookingPager.cursor, limit: 10,
    filters: bookingView === "pending" ? { status: "pending" } : { decided: true },
  });
  const set = (key: keyof Form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const valid =
    form.name.trim().length > 1 &&
    /^\d{2}:\d{2}$/.test(form.open) &&
    /^\d{2}:\d{2}$/.test(form.close) &&
    Number(form.capacity) > 0 &&
    Number(form.slot) >= 15 &&
    Number(form.price) >= 0 &&
    Number(form.cutoff) >= 0;

  const edit = (amenity: AmenityRow) => {
    setEditing(amenity.id);
    setForm({
      name: amenity.name,
      description: amenity.description ?? "",
      open: amenity.open_time.slice(0, 5),
      close: amenity.close_time.slice(0, 5),
      slot: String(amenity.slot_minutes),
      capacity: String(amenity.capacity),
      price: String(amenity.price),
      cutoff: String(amenity.cancellation_cutoff_minutes),
      latePenalty: String(amenity.late_cancel_penalty ?? 0),
      noShowPenalty: String(amenity.no_show_penalty ?? 0),
      grace: String(amenity.checkin_grace_minutes ?? 15),
      rules: amenity.rules ?? "",
      blackouts: amenity.blackout_dates.join(", "),
      approval: amenity.requires_approval,
      active: amenity.is_active,
    });
  };

  const save = () => saveAmenity.mutate({
    id: editing ?? undefined,
    name: form.name.trim(),
    description: form.description.trim() || null,
    open_time: form.open,
    close_time: form.close,
    slot_minutes: Number(form.slot),
    capacity: Number(form.capacity),
    price: Number(form.price),
    cancellation_cutoff_minutes: Number(form.cutoff),
    late_cancel_penalty: Number(form.latePenalty),
    no_show_penalty: Number(form.noShowPenalty),
    checkin_grace_minutes: Number(form.grace),
    requires_approval: form.approval,
    rules: form.rules.trim() || null,
    blackout_dates: form.blackouts.split(",").map((value) => value.trim()).filter(Boolean),
    is_active: form.active,
  }, mutationFeedback(editing ? "Amenity updated" : "Amenity created", () => {
    setEditing(null);
    setForm(EMPTY);
  }));

  const bookingRows = bookings.data?.rows ?? [];
  return (
    <AdminRoute title="Amenities" description="Configure facilities, penalties, payments, and decide pending resident requests.">
      {usage.data ? (
        <Card>
          <Text className="text-title text-ink">Usage · last {usage.data.days} days</Text>
          <Text className="text-caption text-ink-muted">
            {usage.data.total_bookings} bookings · {usage.data.checked_in} checked in ·{" "}
            {usage.data.cancelled} cancelled · {usage.data.no_shows} no-shows ·{" "}
            {usage.data.waitlist_waiting} waiting
          </Text>
          <Text className="text-caption text-ink-muted">
            Revenue {formatMoney(usage.data.revenue)} · Penalties due{" "}
            {formatMoney(usage.data.penalties_due)}
          </Text>
          {usage.data.by_amenity.slice(0, 5).map((row) => (
            <Text key={row.amenity_id} className="text-body text-ink-soft">
              {row.amenity_name}: {row.bookings} booked · {row.checked_in} in ·{" "}
              {row.no_shows} no-show
            </Text>
          ))}
          <Button
            title="Mark no-shows"
            variant="secondary"
            loading={markNoShows.isPending}
            onPress={() =>
              markNoShows.mutate(undefined, mutationFeedback("No-shows updated"))
            }
          />
        </Card>
      ) : null}
      <Card>
        <Field label="Name" value={form.name} onChangeText={(value) => set("name", value)} />
        <Field label="Description" value={form.description} onChangeText={(value) => set("description", value)} />
        <View className="flex-row gap-2">
          <View className="grow"><Field label="Opens (HH:MM)" value={form.open} onChangeText={(value) => set("open", value)} /></View>
          <View className="grow"><Field label="Closes (HH:MM)" value={form.close} onChangeText={(value) => set("close", value)} /></View>
        </View>
        <View className="flex-row gap-2">
          <View className="grow"><Field label="Slot minutes" value={form.slot} keyboardType="number-pad" onChangeText={(value) => set("slot", value)} /></View>
          <View className="grow"><Field label="Capacity" value={form.capacity} keyboardType="number-pad" onChangeText={(value) => set("capacity", value)} /></View>
        </View>
        <View className="flex-row gap-2">
          <View className="grow"><Field label="Price" value={form.price} keyboardType="decimal-pad" onChangeText={(value) => set("price", value)} /></View>
          <View className="grow"><Field label="Cancel cutoff (min)" value={form.cutoff} keyboardType="number-pad" onChangeText={(value) => set("cutoff", value)} /></View>
        </View>
        <View className="flex-row gap-2">
          <View className="grow"><Field label="Late-cancel penalty" value={form.latePenalty} keyboardType="decimal-pad" onChangeText={(value) => set("latePenalty", value)} /></View>
          <View className="grow"><Field label="No-show penalty" value={form.noShowPenalty} keyboardType="decimal-pad" onChangeText={(value) => set("noShowPenalty", value)} /></View>
        </View>
        <Field label="Check-in grace (min)" value={form.grace} keyboardType="number-pad" onChangeText={(value) => set("grace", value)} />
        <Field label="Rules" value={form.rules} multiline onChangeText={(value) => set("rules", value)} />
        <Field label="Blackout dates (YYYY-MM-DD, comma separated)" value={form.blackouts} onChangeText={(value) => set("blackouts", value)} />
        <View className="flex-row flex-wrap gap-2">
          <Button title={form.approval ? "Approval required" : "Auto approve"} variant={form.approval ? "primary" : "ghost"} selected={form.approval} onPress={() => set("approval", !form.approval)} />
          <Button title={form.active ? "Active" : "Inactive"} variant={form.active ? "primary" : "ghost"} selected={form.active} onPress={() => set("active", !form.active)} />
        </View>
        <Button title={editing ? "Save amenity" : "Add amenity"} loading={saveAmenity.isPending} disabled={!valid} onPress={save} />
        {editing ? <Button title="Cancel editing" variant="ghost" onPress={() => { setEditing(null); setForm(EMPTY); }} /> : null}
      </Card>

      <Text className="text-title text-ink">Bookings</Text>
      <FilterChips
        label="Booking view"
        value={bookingView}
        options={[
          { value: "pending", label: "Pending approval" },
          { value: "decided", label: "Recent decisions" },
        ]}
        onChange={setBookingView}
      />
      <SearchAndPagination
        search={bookingSearch}
        onSearchChange={setBookingSearch}
        page={bookingPager.page}
        pageCount={Math.max(1, Math.ceil((bookings.data?.total_count ?? 0) / 10))}
        resultCount={bookings.data?.total_count ?? 0}
        onPageChange={(page) => page > bookingPager.page ? bookingPager.next(bookings.data?.next_cursor) : bookingPager.previous()}
        placeholder="Search bookings by amenity or flat"
      />
      {bookingView === "pending" && bookingRows.length ? (
        <Field
          label="Rejection reason"
          value={rejectionReason}
          onChangeText={setRejectionReason}
          placeholder="Required when rejecting"
        />
      ) : null}
      {!bookingRows.length ? <EmptyState title={bookingView === "pending" ? "No pending bookings" : "No decisions"} /> : null}
      {bookingRows.map((booking) => (
        <Card key={booking.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{booking.amenity.name}</Text>
            {bookingView === "decided" ? (
              <Badge
                label={booking.status}
                tone={booking.status === "confirmed" ? "approve" : "deny"}
              />
            ) : null}
          </View>
          <Text className="text-body text-ink-soft">Flat {booking.flat?.number ?? "—"} · {format(new Date(booking.starts_at), "d MMM, h:mm a")}</Text>
          {bookingView === "pending" ? <View className="flex-row gap-2">
            <Button title="Approve" variant="approve" className="grow" loading={decide.isPending} onPress={() => decide.mutate({ bookingId: booking.id, decision: "confirmed" })} />
            <Button
              title="Reject"
              variant="deny"
              className="grow"
              loading={decide.isPending}
              disabled={rejectionReason.trim().length < 3}
              onPress={() =>
                decide.mutate(
                  { bookingId: booking.id, decision: "rejected", reason: rejectionReason.trim() },
                  { onSuccess: () => setRejectionReason("") },
                )
              }
            />
          </View> : null}
          {booking.decision_reason ? (
            <Text className="text-body text-ink-soft">{booking.decision_reason}</Text>
          ) : null}
        </Card>
      ))}

      <Text className="text-title text-ink">Facilities</Text>
      <SearchAndPagination
        search={facilitySearch}
        onSearchChange={setFacilitySearch}
        page={facilityPager.page}
        pageCount={Math.max(1, Math.ceil((amenities.data?.total_count ?? 0) / 10))}
        resultCount={amenities.data?.total_count ?? 0}
        onPageChange={(page) => page > facilityPager.page ? facilityPager.next(amenities.data?.next_cursor) : facilityPager.previous()}
        placeholder="Search facilities"
      />
      {amenities.isLoading ? <Skeleton /> : null}
      {amenities.isError ? <QueryErrorState error={amenities.error} onRetry={() => void amenities.refetch()} /> : null}
      {amenities.data?.rows.map((amenity) => (
        <Card key={amenity.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{amenity.name}</Text>
            <Badge label={amenity.is_active ? "Active" : "Inactive"} tone={amenity.is_active ? "approve" : "neutral"} />
          </View>
          <Text className="text-caption text-ink-muted">
            {amenity.open_time.slice(0, 5)}–{amenity.close_time.slice(0, 5)} · {amenity.slot_minutes} min · capacity {amenity.capacity} · ₹{amenity.price}
          </Text>
          <Button title="Edit configuration" variant="secondary" onPress={() => edit(amenity)} />
        </Card>
      ))}
    </AdminRoute>
  );
}
