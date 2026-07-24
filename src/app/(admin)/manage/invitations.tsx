import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import { AuthMethodPicker } from "@/features/auth/AuthMethodPicker";
import {
  isValidIdentity,
  type IdentityType,
} from "@/features/auth/identity";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
  SearchAndPagination,
  useAdminCursorPager,
} from "@/features/admin/adminUi";
import { useAdminFlatsPage, useAdminInvitesPage, useInviteMutations } from "@/features/admin/hooks";
import type { Role } from "@/stores/session";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

type InviteStatus = "all" | "pending" | "joined";

export default function InvitationsRoute() {
  const { create, revoke } = useInviteMutations();
  const [identityType, setIdentityType] = useState<IdentityType>("phone");
  const [identityValue, setIdentityValue] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("resident");
  const [flatId, setFlatId] = useState<string | null>(null);
  const [flatSearch, setFlatSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InviteStatus>("all");
  const flats = useAdminFlatsPage({
    search: flatSearch,
    limit: 6,
    enabled: flatSearch.trim().length > 0,
  });
  const flatMatches = flats.data?.rows ?? [];
  const selectedFlat = flatMatches.find((flat) => flat.id === flatId);
  const pager = useAdminCursorPager(`${search.trim()}:${status}`);
  const invites = useAdminInvitesPage({
    search,
    after: pager.cursor,
    limit: 10,
    filters: { status: status === "all" ? undefined : status },
  });
  const rows = invites.data?.rows ?? [];
  const total = invites.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const validIdentity = isValidIdentity(identityType, identityValue);

  return (
    <AdminRoute title="Invitations" description="Invite a verified phone number or email address.">
      <Card className="gap-2">
        <Text className="text-label text-ink">New invitation</Text>
        <AuthMethodPicker
          value={identityType}
          onChange={(next) => {
            setIdentityType(next);
            setIdentityValue("");
          }}
          disabled={create.isPending}
        />
        <Field
          label={identityType === "phone" ? "Phone" : "Email"}
          value={identityValue}
          onChangeText={setIdentityValue}
          keyboardType={identityType === "phone" ? "phone-pad" : "email-address"}
          autoCapitalize="none"
          placeholder={identityType === "phone" ? "+91…" : "name@example.com"}
        />
        <Field label="Name (optional)" value={name} onChangeText={setName} />
        <FilterChips
          label="Role"
          value={role}
          options={[
            { value: "resident", label: "Resident" },
            { value: "guard", label: "Guard" },
            { value: "admin", label: "Admin" },
          ]}
          onChange={(next) => {
            setRole(next);
            if (next !== "resident") setFlatId(null);
          }}
        />
        {role === "resident" ? (
          <>
            <Field
              label="Flat"
              value={
                selectedFlat
                  ? `${selectedFlat.tower?.name ?? ""} ${selectedFlat.number}`.trim()
                  : flatSearch
              }
              onChangeText={(value) => {
                setFlatId(null);
                setFlatSearch(value);
              }}
              placeholder="Search tower or flat"
            />
            {flatMatches.map((flat) => (
              <Button
                key={flat.id}
                title={`Select ${flat.tower?.name ? `${flat.tower.name} · ` : ""}${flat.number}`}
                variant="ghost"
                onPress={() => setFlatId(flat.id)}
              />
            ))}
          </>
        ) : null}
        <Button
          title="Send invitation"
          loading={create.isPending}
          disabled={!validIdentity || (role === "resident" && !flatId)}
          onPress={() =>
            create.mutate(
              {
                identityType,
                identityValue,
                name: name.trim(),
                role,
                flatId,
              },
              mutationFeedback("Invitation sent", () => {
                setIdentityValue("");
                setName("");
                setFlatId(null);
                setFlatSearch("");
              }),
            )
          }
        />
      </Card>
      <FilterChips
        label="Status"
        value={status}
        options={[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "joined", label: "Joined" },
        ]}
        onChange={setStatus}
      />
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={pageCount}
        resultCount={total}
        onPageChange={(page) =>
          page > pager.page ? pager.next(invites.data?.next_cursor) : pager.previous()
        }
        placeholder="Search name, identity, role, or flat"
      />
      {invites.isLoading ? <Skeleton /> : null}
      {invites.isError ? (
        <QueryErrorState
          error={invites.error}
          onRetry={() => void invites.refetch()}
          isRetrying={invites.isRefetching}
        />
      ) : null}
      {!invites.isLoading && !invites.isError && !rows.length ? (
        <EmptyState title="No matching invitations" />
      ) : null}
      {rows.map((invite) => (
        <Card key={invite.id}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-label text-ink">
                {invite.name ?? invite.identity_value}
              </Text>
              <Text className="text-caption text-ink-muted">
                {invite.identity_value} · {invite.role}
                {invite.flat ? ` · Flat ${invite.flat.number}` : ""}
              </Text>
            </View>
            {invite.claimed_by ? (
              <Badge label="Joined" tone="approve" />
            ) : (
              <Button
                title={`Revoke invitation for ${invite.name ?? invite.identity_value}`}
                variant="ghost"
                onPress={() =>
                  Alert.alert("Revoke invitation?", "The recipient will no longer be able to claim it.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Revoke",
                      style: "destructive",
                      onPress: () =>
                        revoke.mutate(
                          { id: invite.id },
                          mutationFeedback("Invitation revoked"),
                        ),
                    },
                  ])
                }
              />
            )}
          </View>
        </Card>
      ))}
    </AdminRoute>
  );
}
