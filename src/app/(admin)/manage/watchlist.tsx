import { Badge, Button, Card, EmptyState, Field } from "@/components/ui";
import { AdminRoute, mutationFeedback } from "@/features/admin/adminUi";
import {
  useAddWatchlistEntry,
  useRemoveWatchlistEntry,
  useSetWatchlistActive,
  useWatchlist,
} from "@/features/watchlist/hooks";
import { format } from "date-fns";
import { useState } from "react";
import { Text, View } from "react-native";

export default function WatchlistRoute() {
  const list = useWatchlist();
  const add = useAddWatchlistEntry();
  const setActive = useSetWatchlistActive();
  const remove = useRemoveWatchlistEntry();
  const [kind, setKind] = useState<"blacklist" | "watchlist">("blacklist");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [reason, setReason] = useState("");

  return (
    <AdminRoute
      title="Blacklist & watchlist"
      description="Blocklisted visitors are refused at the gate. Watchlist matches warn guards."
    >
      <Card>
        <Text className="text-caption text-ink-muted">Entry type</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            title="Blacklist"
            variant={kind === "blacklist" ? "deny" : "ghost"}
            selected={kind === "blacklist"}
            onPress={() => setKind("blacklist")}
          />
          <Button
            title="Watchlist"
            variant={kind === "watchlist" ? "primary" : "ghost"}
            selected={kind === "watchlist"}
            onPress={() => setKind("watchlist")}
          />
        </View>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Optional if phone/plate set" />
        <Field label="Phone (E.164)" value={phone} onChangeText={setPhone} placeholder="+9198…" keyboardType="phone-pad" />
        <Field label="Vehicle" value={vehicleNo} onChangeText={setVehicleNo} placeholder="Optional plate" autoCapitalize="characters" />
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Why this person is flagged" />
        <Button
          title="Add entry"
          disabled={reason.trim().length < 3 || (!name.trim() && !phone.trim() && !vehicleNo.trim())}
          loading={add.isPending}
          onPress={() =>
            add.mutate(
              {
                kind,
                name: name.trim() || undefined,
                phone: phone.trim() || undefined,
                vehicleNo: vehicleNo.trim() || undefined,
                reason: reason.trim(),
              },
              mutationFeedback("Entry saved", () => {
                setName("");
                setPhone("");
                setVehicleNo("");
                setReason("");
              }),
            )
          }
        />
      </Card>

      {!list.data?.length ? <EmptyState title="No watchlist entries yet" /> : null}
      {list.data?.map((entry) => (
        <Card key={entry.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{entry.name ?? entry.phone ?? entry.vehicle_no}</Text>
            <Badge
              label={entry.kind}
              tone={entry.kind === "blacklist" ? "deny" : "neutral"}
            />
          </View>
          <Text className="text-body text-ink-soft">{entry.reason}</Text>
          <Text className="text-caption text-ink-muted">
            {[entry.phone, entry.vehicle_no].filter(Boolean).join(" · ") || "Name match only"}
            {" · "}
            {format(new Date(entry.created_at), "d MMM yyyy")}
          </Text>
          <Badge label={entry.is_active ? "Active" : "Inactive"} tone={entry.is_active ? "approve" : "neutral"} />
          <View className="flex-row flex-wrap gap-2">
            <Button
              title={entry.is_active ? "Deactivate" : "Reactivate"}
              variant="ghost"
              loading={setActive.isPending}
              onPress={() => setActive.mutate({ id: entry.id, isActive: !entry.is_active })}
            />
            <Button
              title="Remove"
              variant="deny"
              loading={remove.isPending}
              onPress={() => remove.mutate(entry.id, mutationFeedback("Removed"))}
            />
          </View>
        </Card>
      ))}
    </AdminRoute>
  );
}
