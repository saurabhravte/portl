import { Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  mutationFeedback,
  SearchAndPagination,
  useAdminCursorPager,
} from "@/features/admin/adminUi";
import { useAdminTowersPage, useTowerMutations } from "@/features/admin/hooks";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

export default function TowersRoute() {
  const { create, remove } = useTowerMutations();
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const pager = useAdminCursorPager(search.trim());
  const query = useAdminTowersPage({ search, after: pager.cursor, limit: 10 });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  return (
    <AdminRoute title="Towers" description="Maintain the building structure used by flats and members.">
      <Card className="gap-2">
        <Field label="New tower" value={name} onChangeText={setName} placeholder="Tower A" />
        <Button
          title="Add tower"
          loading={create.isPending}
          disabled={!name.trim()}
          onPress={() =>
            create.mutate(
              { name: name.trim() },
              mutationFeedback("Tower added", () => setName("")),
            )
          }
        />
      </Card>
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={pageCount}
        resultCount={total}
        onPageChange={(page) =>
          page > pager.page ? pager.next(query.data?.next_cursor) : pager.previous()
        }
        placeholder="Search towers"
      />
      {query.isLoading ? <Skeleton /> : null}
      {query.isError ? (
        <QueryErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          isRetrying={query.isRefetching}
        />
      ) : null}
      {!query.isLoading && !query.isError && !rows.length ? (
        <EmptyState title={search ? "No matching towers" : "No towers yet"} />
      ) : null}
      {rows.map((tower) => (
        <Card key={tower.id}>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-label text-ink">{tower.name}</Text>
              <Text className="text-caption text-ink-muted">{tower.flat_count} flats</Text>
            </View>
            <Button
              title={`Delete ${tower.name}`}
              variant="ghost"
              onPress={() =>
                Alert.alert(
                  "Delete tower?",
                  `This also removes flats in ${tower.name}. This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        remove.mutate(
                          { id: tower.id },
                          mutationFeedback("Tower deleted"),
                        ),
                    },
                  ],
                )
              }
            />
          </View>
        </Card>
      ))}
    </AdminRoute>
  );
}
