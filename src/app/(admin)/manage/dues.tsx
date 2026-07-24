import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import { dueLateFeeAmount, duePayableAmount, formatMoney } from "@/lib/money";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
  SearchAndPagination,
  useAdminCursorPager,
} from "@/features/admin/adminUi";
import {
  useAdminDuesPage,
  useDueClaimActions,
  useDueMutations,
  useSocietySettings,
  useUpdateLateFeeSettings,
} from "@/features/admin/hooks";
import { format } from "date-fns";
import React, { useEffect, useState } from "react";
import { Switch, Text, View, Alert } from "react-native";

type DueStatus = "all" | "due" | "claimed" | "paid" | "waived";

export default function DuesRoute() {
  const { raiseForAll, markPaid, waiveLateFee, applyLateFeesNow } = useDueMutations();
  const claims = useDueClaimActions();
  const settings = useSocietySettings();
  const updateLateFees = useUpdateLateFeeSettings();
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DueStatus>("all");
  const [lateEnabled, setLateEnabled] = useState(false);
  const [graceDays, setGraceDays] = useState("0");
  const [flatFee, setFlatFee] = useState("0");
  const [percentFee, setPercentFee] = useState("0");
  const [dueDay, setDueDay] = useState("10");
  const pager = useAdminCursorPager(`${search.trim()}:${status}`);
  const dues = useAdminDuesPage({
    search,
    after: pager.cursor,
    limit: 10,
    filters: { status: status === "all" ? undefined : status },
  });
  const rows = dues.data?.rows ?? [];
  const total = dues.data?.total_count ?? 0;
  const parsedAmount = Number(amount);
  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  useEffect(() => {
    if (!settings.data) return;
    setLateEnabled(!!settings.data.lateFeeEnabled);
    setGraceDays(String(settings.data.lateFeeGraceDays ?? 0));
    setFlatFee(String(settings.data.lateFeeAmount ?? 0));
    setPercentFee(String(settings.data.lateFeePercent ?? 0));
    setDueDay(String(settings.data.duesDueDay ?? 10));
  }, [settings.data]);

  const parsedGrace = Number(graceDays);
  const parsedFlat = Number(flatFee);
  const parsedPercent = Number(percentFee);
  const parsedDueDay = Number(dueDay);
  const validLatePolicy =
    Number.isInteger(parsedGrace) &&
    parsedGrace >= 0 &&
    parsedGrace <= 90 &&
    Number.isFinite(parsedFlat) &&
    parsedFlat >= 0 &&
    Number.isFinite(parsedPercent) &&
    parsedPercent >= 0 &&
    parsedPercent <= 100 &&
    Number.isInteger(parsedDueDay) &&
    parsedDueDay >= 1 &&
    parsedDueDay <= 28;

  return (
    <AdminRoute title="Maintenance dues" description="Raise charges, configure late fees, review payment claims, and filter the dues ledger.">
      <Card className="gap-2">
        <Text className="text-label text-ink">Raise for all flats</Text>
        <Field label="Period" value={period} onChangeText={setPeriod} placeholder="2026-07" />
        <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        {!validPeriod && period ? (
          <Text accessibilityRole="alert" className="text-caption text-deny">
            Use a valid period in YYYY-MM format.
          </Text>
        ) : null}
        {!validAmount && amount ? (
          <Text accessibilityRole="alert" className="text-caption text-deny">
            Amount must be greater than zero.
          </Text>
        ) : null}
        <Button
          title="Raise dues"
          loading={raiseForAll.isPending}
          disabled={!validPeriod || !validAmount}
          onPress={() =>
            raiseForAll.mutate(
              { period, amount: parsedAmount },
              mutationFeedback("Dues raised", () => setAmount("")),
            )
          }
        />
      </Card>

      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-label text-ink">Auto late fees</Text>
          <Switch value={lateEnabled} onValueChange={setLateEnabled} />
        </View>
        <Text className="text-caption text-ink-muted">
          After the due day plus grace days, a late fee is applied automatically (base amount never changes).
        </Text>
        <Field
          label="Due day of month (1–28)"
          value={dueDay}
          onChangeText={setDueDay}
          keyboardType="number-pad"
        />
        <Field
          label="Grace days"
          value={graceDays}
          onChangeText={setGraceDays}
          keyboardType="number-pad"
        />
        <Field
          label="Flat late fee (₹)"
          value={flatFee}
          onChangeText={setFlatFee}
          keyboardType="decimal-pad"
        />
        <Field
          label="Percent of base (%)"
          value={percentFee}
          onChangeText={setPercentFee}
          keyboardType="decimal-pad"
        />
        <Button
          title="Save late-fee policy"
          loading={updateLateFees.isPending}
          disabled={!validLatePolicy || settings.isLoading}
          onPress={() =>
            updateLateFees.mutate(
              {
                lateFeeEnabled: lateEnabled,
                lateFeeGraceDays: parsedGrace,
                lateFeeAmount: parsedFlat,
                lateFeePercent: parsedPercent,
                duesDueDay: parsedDueDay,
              },
              mutationFeedback("Late-fee policy saved"),
            )
          }
        />
        <Button
          title="Apply late fees now"
          variant="secondary"
          loading={applyLateFeesNow.isPending}
          onPress={() =>
            applyLateFeesNow.mutate(undefined, {
              onSuccess: (result) =>
                Alert.alert(
                  "Late fees run",
                  `Applied ${result.applied}, skipped ${result.skipped}.`,
                ),
              onError: (error: unknown) =>
                Alert.alert(
                  "Couldn’t complete action",
                  error instanceof Error ? error.message : "Unknown error",
                ),
            })
          }
        />
      </Card>

      <FilterChips
        label="Status"
        value={status}
        options={[
          { value: "all", label: "All" },
          { value: "due", label: "Due" },
          { value: "claimed", label: "Claimed" },
          { value: "paid", label: "Paid" },
          { value: "waived", label: "Waived" },
        ]}
        onChange={setStatus}
      />
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={pager.page}
        pageCount={Math.max(1, Math.ceil(total / 10))}
        resultCount={total}
        onPageChange={(page) => page > pager.page ? pager.next(dues.data?.next_cursor) : pager.previous()}
        placeholder="Search flat, period, status, or note"
      />
      {dues.isLoading ? <Skeleton /> : null}
      {dues.isError ? (
        <QueryErrorState
          error={dues.error}
          onRetry={() => void dues.refetch()}
          isRetrying={dues.isRefetching}
        />
      ) : null}
      {!dues.isLoading && !dues.isError && !rows.length ? (
        <EmptyState title="No matching dues" />
      ) : null}
      {rows.map((due) => {
        const late = dueLateFeeAmount(due);
        const payable = duePayableAmount(due);
        return (
          <Card key={due.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-label text-ink">
                  Flat {due.flat?.number ?? "—"} · {due.period}
                </Text>
                <Text className="text-caption text-ink-muted">
                  {late > 0
                    ? `${formatMoney(due.amount)} + late ${formatMoney(late)} = ${formatMoney(payable)}`
                    : formatMoney(due.amount)}
                </Text>
                {due.due_on ? (
                  <Text className="text-caption text-ink-muted">
                    Due {format(new Date(due.due_on), "dd MMM yyyy")}
                    {due.late_fee_waived_at ? " · late fee waived" : ""}
                  </Text>
                ) : null}
              </View>
              <Badge
                label={due.status}
                tone={due.status === "paid" ? "approve" : due.status === "claimed" ? "ink" : "neutral"}
              />
            </View>
            {due.payment_note ? <Text className="text-caption text-ink-muted">{due.payment_note}</Text> : null}
            {due.status === "claimed" ? (
              <View className="flex-row gap-2">
                <Button
                  title="Confirm paid"
                  variant="approve"
                  className="grow"
                  loading={claims.confirm.isPending}
                  onPress={() =>
                    claims.confirm.mutate({ id: due.id }, mutationFeedback("Payment confirmed"))
                  }
                />
                <Button
                  title="Reject claim"
                  variant="ghost"
                  className="grow"
                  loading={claims.reject.isPending}
                  onPress={() =>
                    claims.reject.mutate({ id: due.id }, mutationFeedback("Payment claim rejected"))
                  }
                />
              </View>
            ) : null}
            {due.status === "due" ? (
              <Button
                title="Mark paid (offline)"
                variant="secondary"
                loading={markPaid.isPending}
                onPress={() =>
                  markPaid.mutate({ id: due.id }, mutationFeedback("Due marked paid"))
                }
              />
            ) : null}
            {(late > 0 || (!!due.late_fee_applied_at && !due.late_fee_waived_at)) &&
            !due.late_fee_waived_at &&
            (due.status === "due" || due.status === "claimed") ? (
              <Button
                title="Waive late fee"
                variant="ghost"
                loading={waiveLateFee.isPending}
                onPress={() =>
                  waiveLateFee.mutate({ id: due.id }, mutationFeedback("Late fee waived"))
                }
              />
            ) : null}
          </Card>
        );
      })}
    </AdminRoute>
  );
}
