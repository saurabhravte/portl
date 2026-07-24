import { Button, Field } from "@/components/ui";
import { useAdminFlatsPage, useAdminTowersPage } from "@/features/admin/hooks";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-1">
      <Text className="text-label text-ink">{label}</Text>
      <Button
        title={format(value, "d MMM yyyy, h:mm a")}
        variant="ghost"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <View className="gap-2">
          <DateTimePicker
            value={value}
            minimumDate={minimumDate}
            mode="datetime"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(_, selected) => {
              if (Platform.OS !== "ios") setOpen(false);
              if (selected) onChange(selected);
            }}
          />
          {Platform.OS === "ios" ? (
            <Button
              title="Done"
              variant="ghost"
              onPress={() => setOpen(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Toggle({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-pill px-3 ${
        selected ? "bg-ink" : "bg-surface-alt"
      }`}
    >
      <Text className={selected ? "text-inverse" : "text-ink-soft"}>{label}</Text>
    </Pressable>
  );
}

export function TargetPicker({
  towerIds,
  flatIds,
  onTowerIdsChange,
  onFlatIdsChange,
}: {
  towerIds: string[];
  flatIds: string[];
  onTowerIdsChange: (ids: string[]) => void;
  onFlatIdsChange: (ids: string[]) => void;
}) {
  const [towerSearch, setTowerSearch] = useState("");
  const [flatSearch, setFlatSearch] = useState("");
  const towers = useAdminTowersPage({ search: towerSearch, limit: 50 });
  const flats = useAdminFlatsPage({
    search: flatSearch,
    limit: 50,
    enabled: flatSearch.trim().length > 0,
  });
  const toggle = (values: string[], id: string, update: (ids: string[]) => void) =>
    update(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  return (
    <View className="gap-2">
      <Text className="text-label text-ink">
        Audience {towerIds.length || flatIds.length ? "(targeted)" : "(all residents)"}
      </Text>
      <Text className="text-caption text-ink-muted">Towers</Text>
      <Field label="Find towers" value={towerSearch} onChangeText={setTowerSearch} />
      <View className="flex-row flex-wrap gap-2">
        {towers.data?.rows.map((tower) => (
          <Toggle
            key={tower.id}
            label={tower.name}
            selected={towerIds.includes(tower.id)}
            onPress={() => toggle(towerIds, tower.id, onTowerIdsChange)}
          />
        ))}
      </View>
      <Text className="text-caption text-ink-muted">Specific flats</Text>
      <Field label="Find specific flats" value={flatSearch} onChangeText={setFlatSearch} placeholder="Tower or flat number" />
      <View className="flex-row flex-wrap gap-2">
        {flats.data?.rows.map((flat) => (
          <Toggle
            key={flat.id}
            label={`${flat.tower?.name ?? "—"} ${flat.number}`}
            selected={flatIds.includes(flat.id)}
            onPress={() => toggle(flatIds, flat.id, onFlatIdsChange)}
          />
        ))}
      </View>
    </View>
  );
}
