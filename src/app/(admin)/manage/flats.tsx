import { Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
  SearchAndPagination,
  useAdminCursorPager,
} from "@/features/admin/adminUi";
import {
  useAdminFlatsPage,
  useBulkImportFlats,
  useFlatMutations,
  useAdminTowersPage,
} from "@/features/admin/hooks";
import { validateFlatImport } from "@/features/admin/importValidation";
import * as Crypto from "expo-crypto";
import React, { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";

type Occupancy = "all" | "occupied" | "vacant";

export default function FlatsRoute() {
  const [towerSearch, setTowerSearch] = useState("");
  const towers = useAdminTowersPage({ search: towerSearch, limit: 50 });
  const { create, remove } = useFlatMutations();
  const [newTowerId, setNewTowerId] = useState("");
  const [towerFilter, setTowerFilter] = useState("");
  const [number, setNumber] = useState("");
  const [search, setSearch] = useState("");
  const [occupancy, setOccupancy] = useState<Occupancy>("all");
  const resetKey = `${search.trim()}:${towerFilter}:${occupancy}`;
  const pager = useAdminCursorPager(resetKey);
  const flats = useAdminFlatsPage({
    search,
    after: pager.cursor,
    limit: 10,
    filters: {
      tower_id: towerFilter || undefined,
      occupancy_status: occupancy === "all" ? undefined : occupancy,
    },
  });
  const rows = flats.data?.rows ?? [];
  const total = flats.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  return (
    <AdminRoute title="Flats" description="Add homes individually or validate a paste-based import before submitting it.">
      <Card className="gap-2">
        <Text className="text-label text-ink">Add one flat</Text>
        <Field label="Find tower" value={towerSearch} onChangeText={setTowerSearch} />
        <FilterChips
          label="Tower"
          value={newTowerId}
          options={(towers.data?.rows ?? []).map((tower) => ({ value: tower.id, label: tower.name }))}
          onChange={setNewTowerId}
        />
        <Field label="Flat number" value={number} onChangeText={setNumber} placeholder="1203" />
        <Button
          title="Add flat"
          loading={create.isPending}
          disabled={!newTowerId || !number.trim()}
          onPress={() =>
            create.mutate(
              { towerId: newTowerId, number: number.trim() },
              mutationFeedback("Flat added", () => setNumber("")),
            )
          }
        />
      </Card>
      <BulkImport />
      <FilterChips
        label="Occupancy"
        value={occupancy}
        options={[
          { value: "all", label: "All" },
          { value: "occupied", label: "Occupied" },
          { value: "vacant", label: "Vacant" },
        ]}
        onChange={setOccupancy}
      />
      <FilterChips
        label="Tower filter"
        value={towerFilter}
        options={[
          { value: "", label: "All towers" },
          ...(towers.data?.rows ?? []).map((tower) => ({ value: tower.id, label: tower.name })),
        ]}
        onChange={setTowerFilter}
      />
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={pageCount}
        resultCount={total}
        onPageChange={(page) =>
          page > pager.page ? pager.next(flats.data?.next_cursor) : pager.previous()
        }
        placeholder="Search tower or flat number"
      />
      {flats.isLoading ? <Skeleton /> : null}
      {flats.isError ? (
        <QueryErrorState
          error={flats.error}
          onRetry={() => void flats.refetch()}
          isRetrying={flats.isRefetching}
        />
      ) : null}
      {!flats.isLoading && !flats.isError && !rows.length ? (
        <EmptyState title="No matching flats" hint="Adjust the search or filters." />
      ) : null}
      {rows.map((flat) => (
        <Card key={flat.id}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-label text-ink">
                {flat.tower?.name ? `${flat.tower.name} · ` : ""}
                {flat.number}
              </Text>
              <Text className="text-caption capitalize text-ink-muted">{flat.occupancy_status}</Text>
            </View>
            <Button
              title={`Delete flat ${flat.number}`}
              variant="ghost"
              onPress={() =>
                Alert.alert("Delete flat?", "This cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () =>
                      remove.mutate({ id: flat.id }, mutationFeedback("Flat deleted")),
                  },
                ])
              }
            />
          </View>
        </Card>
      ))}
    </AdminRoute>
  );
}

function BulkImport() {
  const bulk = useBulkImportFlats();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof bulk.mutateAsync>> | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());
  const validation = useMemo(() => validateFlatImport(text), [text]);
  if (!open) {
    return <Button title="Open bulk import" variant="ghost" onPress={() => setOpen(true)} />;
  }
  return (
    <Card className="gap-2">
      <Text className="text-label text-ink">Bulk import preview</Text>
      <Text className="text-caption text-ink-muted">
        One flat per line as Tower,Flat. Missing towers are created by the existing import flow.
      </Text>
      <Field
        label="Import rows"
        value={text}
        onChangeText={(value) => {
          setText(value);
          setPreview(null);
          setIdempotencyKey(Crypto.randomUUID());
        }}
        multiline
        placeholder={"A,101\nA,102\nB,201"}
        className="min-h-28 pt-3"
      />
      <Text accessibilityLiveRegion="polite" className="text-caption text-ink-muted">
        {validation.rows.length} valid · {validation.issues.length} need attention
      </Text>
      {preview ? (
        <Text accessibilityLiveRegion="polite" className="text-caption text-ink-muted">
          Server preview: {preview.success_count} accepted · {preview.failure_count} failed
        </Text>
      ) : null}
      {validation.issues.slice(0, 5).map((issue) => (
        <Text key={`${issue.line}-${issue.message}`} accessibilityRole="alert" className="text-caption text-deny">
          Line {issue.line}: {issue.message}
        </Text>
      ))}
      {validation.issues.length > 5 ? (
        <Text className="text-caption text-deny">And {validation.issues.length - 5} more issues.</Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button title="Cancel" variant="ghost" className="grow" onPress={() => setOpen(false)} />
        <Button
          title={preview?.status === "validated" ? `Apply ${validation.rows.length} flats` : "Validate with server"}
          className="grow"
          loading={bulk.isPending}
          disabled={!validation.rows.length || !!validation.issues.length}
          onPress={() =>
            bulk.mutate(
              {
                rows: validation.rows,
                idempotencyKey: preview?.status === "validated"
                  ? `${idempotencyKey}:apply`
                  : `${idempotencyKey}:preview`,
                dryRun: preview?.status !== "validated",
              },
              {
                onSuccess: (result) => {
                  if (result.dry_run) {
                    setPreview(result);
                    if (result.failure_count) {
                      Alert.alert("Import needs attention", `${result.failure_count} row(s) failed server validation.`);
                    }
                    return;
                  }
                  setText("");
                  setPreview(null);
                  setIdempotencyKey(Crypto.randomUUID());
                  setOpen(false);
                  Alert.alert("Import applied", `${result.created_flats} flats and ${result.created_towers} towers created.`);
                },
                onError: (error) =>
                  Alert.alert(
                    "Import failed",
                    error instanceof Error ? error.message : "Please try again.",
                  ),
              },
            )
          }
        />
      </View>
    </Card>
  );
}
