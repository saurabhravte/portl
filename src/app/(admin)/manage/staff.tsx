import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
  SearchAndPagination,
  useAdminCursorPager,
} from "@/features/admin/adminUi";
import {
  useAdminProvidersPage,
  useAdminStaffPage,
  useStaffMutations,
} from "@/features/admin/hooks";
import {
  type ServiceProviderRow,
  useSaveServiceProvider,
} from "@/features/community/hooks";
import {
  useStaffAttendanceMutations,
  useStaffOnDuty,
} from "@/features/staff/hooks";
import { format } from "date-fns";
import React, { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";

type Directory = "staff" | "providers" | "attendance";

export default function StaffRoute() {
  const [directory, setDirectory] = useState<Directory>("staff");
  return (
    <AdminRoute title="Staff & providers" description="Manage society staff, attendance, and verified service listings.">
      <FilterChips
        label="Directory"
        value={directory}
        options={[
          { value: "staff", label: "Society staff" },
          { value: "attendance", label: "Attendance" },
          { value: "providers", label: "Service providers" },
        ]}
        onChange={setDirectory}
      />
      {directory === "staff" ? (
        <StaffDirectory />
      ) : directory === "attendance" ? (
        <StaffAttendancePanel />
      ) : (
        <ProviderDirectory />
      )}
    </AdminRoute>
  );
}

function StaffAttendancePanel() {
  const onDuty = useStaffOnDuty();
  const { checkIn, checkOut } = useStaffAttendanceMutations();
  const [code, setCode] = useState("");
  const rows = onDuty.data ?? [];

  return (
    <>
      <Card className="gap-2">
        <Text className="text-label text-ink">Check in by code</Text>
        <Text className="text-caption text-ink-muted">
          Staff codes look like S123456. Guards and admins can check people in or out.
        </Text>
        <Field
          label="Check-in code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="S000000"
        />
        <Button
          title="Check in"
          loading={checkIn.isPending}
          disabled={code.trim().length < 4}
          onPress={() =>
            checkIn.mutate(
              { code: code.trim(), method: "code" },
              {
                onSuccess: (result) => {
                  setCode("");
                  Alert.alert(
                    result.alreadyIn ? "Already on duty" : "Checked in",
                    `${result.staffName} · ${result.category}`,
                  );
                },
                onError: (error: unknown) =>
                  Alert.alert(
                    "Check-in failed",
                    error instanceof Error ? error.message : "Unknown error",
                  ),
              },
            )
          }
        />
      </Card>
      {onDuty.isLoading ? <Skeleton /> : null}
      {onDuty.isError ? (
        <QueryErrorState
          error={onDuty.error}
          onRetry={() => void onDuty.refetch()}
          isRetrying={onDuty.isRefetching}
        />
      ) : null}
      {!onDuty.isLoading && !onDuty.isError && !rows.length ? (
        <EmptyState title="Nobody on duty" hint="Check staff in with their code." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.attendance_id}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-label text-ink">{row.staff_name}</Text>
              <Text className="text-caption text-ink-muted">
                {row.category} · since{" "}
                {format(new Date(row.checked_in_at), "dd MMM, hh:mm a")}
              </Text>
            </View>
            <Button
              title="Check out"
              variant="secondary"
              loading={checkOut.isPending}
              onPress={() =>
                checkOut.mutate(
                  { id: row.attendance_id },
                  mutationFeedback("Checked out"),
                )
              }
            />
          </View>
        </Card>
      ))}
    </>
  );
}

function StaffDirectory() {
  const { create, deactivate } = useStaffMutations();
  const { checkIn } = useStaffAttendanceMutations();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const pager = useAdminCursorPager(search.trim());
  const staff = useAdminStaffPage({ search, after: pager.cursor, limit: 10 });
  const rows = staff.data?.rows ?? [];
  const total = staff.data?.total_count ?? 0;
  return (
    <>
      <Card className="gap-2">
        <Text className="text-label text-ink">Add staff member</Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Ramesh" />
        <Field label="Category" value={category} onChangeText={setCategory} placeholder="Plumber" />
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button
          title="Add staff"
          loading={create.isPending}
          disabled={!name.trim() || !category.trim()}
          onPress={() =>
            create.mutate(
              { name: name.trim(), category: category.trim(), phone: phone.trim() || undefined },
              mutationFeedback("Staff member added", () => {
                setName("");
                setCategory("");
                setPhone("");
              }),
            )
          }
        />
      </Card>
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={Math.max(1, Math.ceil(total / 10))}
        resultCount={total}
        onPageChange={(page) => page > pager.page ? pager.next(staff.data?.next_cursor) : pager.previous()}
        placeholder="Search staff name, category, or phone"
      />
      {staff.isLoading ? <Skeleton /> : null}
      {staff.isError ? (
        <QueryErrorState
          error={staff.error}
          onRetry={() => void staff.refetch()}
          isRetrying={staff.isRefetching}
        />
      ) : null}
      {!staff.isLoading && !staff.isError && !rows.length ? (
        <EmptyState title="No matching staff" />
      ) : null}
      {rows.map((item) => (
        <Card key={item.id}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-label text-ink">{item.name}</Text>
              <Text className="text-caption text-ink-muted">
                {item.category}
                {item.phone ? ` · ${item.phone}` : ""}
              </Text>
              {item.checkin_code ? (
                <Text className="text-caption text-ink-muted">
                  Code {item.checkin_code}
                </Text>
              ) : null}
            </View>
            <Badge label={item.is_active ? "Active" : "Inactive"} tone={item.is_active ? "approve" : "neutral"} />
          </View>
          <View className="flex-row gap-2">
            <Button
              title="Check in"
              variant="secondary"
              className="grow"
              loading={checkIn.isPending}
              onPress={() =>
                checkIn.mutate(
                  { staffId: item.id, method: "manual" },
                  mutationFeedback("Staff checked in"),
                )
              }
            />
            <Button
              title="Remove"
              variant="ghost"
              className="grow"
              onPress={() =>
                Alert.alert("Remove staff member?", "They will no longer appear in the directory.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () =>
                      deactivate.mutate(
                        { id: item.id },
                        mutationFeedback("Staff member removed"),
                      ),
                  },
                ])
              }
            />
          </View>
        </Card>
      ))}
    </>
  );
}

function ProviderDirectory() {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const save = useSaveServiceProvider();
  const pager = useAdminCursorPager(search.trim());
  const providers = useAdminProvidersPage<ServiceProviderRow>({
    search,
    after: pager.cursor,
    limit: 10,
  });
  const rows = providers.data?.rows ?? [];
  const total = providers.data?.total_count ?? 0;
  return (
    <>
      <Card className="gap-2">
        <Text className="text-label text-ink">Add verified provider</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Category" value={category} onChangeText={setCategory} placeholder="Electrician" />
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button
          title="Add provider"
          loading={save.isPending}
          disabled={!name.trim() || !category.trim()}
          onPress={() =>
            save.mutate(
              {
                name: name.trim(),
                category: category.trim(),
                phone: phone.trim() || null,
                is_verified: true,
                is_available: true,
              },
              mutationFeedback("Provider added", () => {
                setName("");
                setCategory("");
                setPhone("");
              }),
            )
          }
        />
      </Card>
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={Math.max(1, Math.ceil(total / 10))}
        resultCount={total}
        onPageChange={(page) => page > pager.page ? pager.next(providers.data?.next_cursor) : pager.previous()}
        placeholder="Search providers (server-backed)"
      />
      {providers.isLoading ? <Skeleton /> : null}
      {providers.isError ? (
        <QueryErrorState
          error={providers.error}
          onRetry={() => void providers.refetch()}
          isRetrying={providers.isRefetching}
        />
      ) : null}
      {!providers.isLoading && !providers.isError && !rows.length ? (
        <EmptyState title="No matching providers" />
      ) : null}
      {rows.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} />
      ))}
    </>
  );
}

function ProviderCard({ provider }: { provider: ServiceProviderRow }) {
  const save = useSaveServiceProvider();
  const status = useMemo(() => (provider.is_available ? "Available" : "Unavailable"), [provider.is_available]);
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-label text-ink">{provider.name}</Text>
          <Text className="text-caption text-ink-muted">
            {provider.category}
            {provider.phone ? ` · ${provider.phone}` : ""}
          </Text>
        </View>
        <Badge label={status} tone={provider.is_available ? "approve" : "neutral"} />
      </View>
      <Button
        title={`Mark ${provider.name} ${provider.is_available ? "unavailable" : "available"}`}
        variant="ghost"
        loading={save.isPending}
        onPress={() =>
          save.mutate(
            { id: provider.id, name: provider.name, category: provider.category, is_available: !provider.is_available },
            mutationFeedback("Provider availability updated"),
          )
        }
      />
    </Card>
  );
}
