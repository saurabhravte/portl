import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
  SearchAndPagination,
  useAdminCursorPager,
} from "@/features/admin/adminUi";
import {
  type AdminProfileRow,
  useAdminFlatsPage,
  useAdminProfilesPage,
  useUpdateProfile,
} from "@/features/admin/hooks";
import type { Role } from "@/stores/session";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

type RoleFilter = "all" | Role;

export default function MembersRoute() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const pager = useAdminCursorPager(`${search.trim()}:${role}`);
  const profiles = useAdminProfilesPage({
    search,
    after: pager.cursor,
    limit: 10,
    filters: { role: role === "all" ? undefined : role },
  });
  const rows = profiles.data?.rows ?? [];
  const total = profiles.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  return (
    <AdminRoute title="Members" description="Search signed-up members and update role or flat assignment.">
      <FilterChips
        label="Role"
        value={role}
        options={[
          { value: "all", label: "All" },
          { value: "resident", label: "Residents" },
          { value: "guard", label: "Guards" },
          { value: "admin", label: "Admins" },
        ]}
        onChange={setRole}
      />
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={pageCount}
        resultCount={total}
        onPageChange={(page) =>
          page > pager.page ? pager.next(profiles.data?.next_cursor) : pager.previous()
        }
        placeholder="Search name, phone, role, or flat"
      />
      {profiles.isLoading ? <Skeleton /> : null}
      {profiles.isError ? (
        <QueryErrorState
          error={profiles.error}
          onRetry={() => void profiles.refetch()}
          isRetrying={profiles.isRefetching}
        />
      ) : null}
      {!profiles.isLoading && !profiles.isError && !rows.length ? (
        <EmptyState title="No matching members" />
      ) : null}
      {rows.map((profile) => (
        <MemberCard key={profile.id} profile={profile} />
      ))}
    </AdminRoute>
  );
}

function MemberCard({ profile }: { profile: AdminProfileRow }) {
  const update = useUpdateProfile();
  const [open, setOpen] = useState(false);
  const [flatSearch, setFlatSearch] = useState("");
  const flats = useAdminFlatsPage({
    search: flatSearch,
    limit: 8,
    enabled: open && flatSearch.trim().length > 0,
  });
  const flatMatches = flats.data?.rows ?? [];
  return (
    <Card className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Collapse" : "Edit"} ${profile.name}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-label text-ink">{profile.name}</Text>
            <Text className="text-caption text-ink-muted">
              {profile.phone ?? "No phone"} · {profile.flat?.number ? `Flat ${profile.flat.number}` : "No flat"}
            </Text>
          </View>
          <Badge label={profile.role} tone={profile.role === "admin" ? "ink" : "neutral"} />
        </View>
      </Pressable>
      {open ? (
        <View className="gap-2">
          <FilterChips
            label="Role"
            value={profile.role}
            options={[
              { value: "resident", label: "Resident" },
              { value: "guard", label: "Guard" },
              { value: "admin", label: "Admin" },
            ]}
            onChange={(role) =>
              update.mutate({ id: profile.id, role }, mutationFeedback("Member role updated"))
            }
          />
          <Field
            label="Find flat"
            value={flatSearch}
            onChangeText={setFlatSearch}
            placeholder="Tower or flat number"
          />
          <Button
            title="Remove flat assignment"
            variant="ghost"
            disabled={!profile.flat}
            onPress={() =>
              update.mutate(
                { id: profile.id, flatId: null },
                mutationFeedback("Flat assignment removed"),
              )
            }
          />
          {flatMatches.map((flat) => (
            <Button
              key={flat.id}
              title={`Assign ${flat.tower?.name ? `${flat.tower.name} · ` : ""}${flat.number}`}
              variant={profile.flat?.id === flat.id ? "secondary" : "ghost"}
              disabled={profile.flat?.id === flat.id}
              onPress={() =>
                update.mutate(
                  { id: profile.id, flatId: flat.id },
                  mutationFeedback("Flat assignment updated", () => setFlatSearch("")),
                )
              }
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
