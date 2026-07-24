import { duePayableAmount, dueLateFeeAmount, formatMoney } from "@/lib/money";
import { useMyDefaulterFlag } from "@/features/community/extras";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HeroCard,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  useClaimDue,
  useDues,
  useSocietyPayment,
  type DueRow,
} from "@/features/community/hooks";
import { PaymentSuccessReceipt } from "@/features/payments/PaymentSuccessReceipt";
import {
  buildReceiptFromDue,
  type ReceiptData,
} from "@/features/payments/receipt";
import {
  isRazorpayAvailable,
  payDueWithRazorpay,
} from "@/features/payments/razorpay";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useThemeColors } from "@/theme/useThemeColors";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

function dueAmountLabel(due: DueRow): string {
  const late = dueLateFeeAmount(due);
  if (late <= 0) return formatMoney(due.amount);
  return `${formatMoney(due.amount)} + late ${formatMoney(late)}`;
}

export default function Payments() {
  const { data, error, isError, isLoading, isRefetching, refetch } = useDues();
  const { data: society } = useSocietyPayment();
  const claim = useClaimDue();
  const defaulter = useMyDefaulterFlag();
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);
  const colors = useThemeColors();
  const qc = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const outstanding = data?.filter((d) => d.status === "due") ?? [];
  const awaiting = data?.filter((d) => d.status === "claimed") ?? [];
  const history =
    data?.filter((d) => d.status === "paid" || d.status === "waived") ?? [];
  const totalDue = outstanding.reduce((sum, d) => sum + duePayableAmount(d), 0);
  const nextDue = outstanding[0];

  const openReceipt = (
    due: DueRow,
    extras?: {
      paymentId?: string | null;
      orderId?: string | null;
      paidAt?: string | null;
      societyName?: string | null;
      paymentMethod?: string;
    },
  ) => {
    setReceipt(
      buildReceiptFromDue(due, {
        societyName: extras?.societyName ?? society?.name ?? null,
        ...extras,
      }),
    );
  };

  const startPayment = async (due: DueRow) => {
    setPaying(due.id);
    try {
      const result = await payDueWithRazorpay({
        supabase,
        due,
        user: { name: profile?.name, phone: profile?.phone },
        colors,
        upi: society?.upiId
          ? { upiId: society.upiId, payeeName: society.name }
          : null,
      });
      if (result.status === "paid") {
        await qc.invalidateQueries({ queryKey: ["dues"] });
        openReceipt(
          { ...due, status: "paid", paid_at: result.paidAt },
          {
            paymentId: result.paymentId,
            orderId: result.orderId,
            paidAt: result.paidAt,
            societyName: result.societyName ?? society?.name,
            paymentMethod: "Razorpay",
          },
        );
      }
    } finally {
      setPaying(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        <View className="gap-4 p-4 pb-8">
          <Text className="text-display text-ink">Payments</Text>

          {defaulter.data ? (
            <Card className="border-deny">
              <Text className="text-label text-deny">Overdue flag</Text>
              <Text className="text-body text-ink-soft">
                Your {defaulter.data.period} maintenance due is flagged (
                {defaulter.data.reason.replace(/_/g, " ")}). Pay to clear it.
              </Text>
            </Card>
          ) : null}

          {isLoading && (
            <>
              <Skeleton height={110} />
              <Skeleton />
            </>
          )}

          {!isLoading && isError && (
            <QueryErrorState
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
              title="Couldn’t load your dues"
            />
          )}

          {/* ── Outstanding dues hero ── */}
          {!isLoading && !isError && nextDue ? (
            <HeroCard>
              <Text className="text-caption text-on-primary opacity-80">
                Outstanding Dues
              </Text>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-display text-on-primary">
                    {formatMoney(totalDue)}
                  </Text>
                  <Text className="text-caption text-on-primary opacity-80">
                    {outstanding.length > 1
                      ? `${outstanding.length} pending periods`
                      : nextDue.period}
                  </Text>
                  {dueLateFeeAmount(nextDue) > 0 && outstanding.length === 1 ? (
                    <Text className="text-caption text-on-primary opacity-70">
                      Includes late fee {formatMoney(dueLateFeeAmount(nextDue))}
                    </Text>
                  ) : null}
                </View>
                <Button
                  title={paying === nextDue.id ? "Opening…" : "Pay Now"}
                  loading={paying === nextDue.id}
                  onPress={() => void startPayment(nextDue)}
                  className="rounded-pill bg-surface px-5"
                  variant="secondary"
                />
              </View>
              {!isRazorpayAvailable() ? (
                <Text className="text-caption text-on-primary opacity-70">
                  Pays via your UPI app
                  {society?.upiId ? "" : " (ask your admin to enable payments)"}.
                </Text>
              ) : null}
            </HeroCard>
          ) : null}

          {!isLoading && !isError && !nextDue && !awaiting.length ? (
            <Card>
              <Text className="text-title text-ink">You're all settled ✅</Text>
              <Text className="text-body text-ink-soft">
                No outstanding maintenance dues right now.
              </Text>
            </Card>
          ) : null}

          {/* ── Additional pending periods ── */}
          {outstanding.slice(1).map((d) => (
            <Card key={d.id}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-label text-ink">{d.period}</Text>
                  <Text className="text-body text-ink-soft">
                    {dueAmountLabel(d)}
                  </Text>
                </View>
                <Button
                  title="Pay"
                  size="sm"
                  loading={paying === d.id}
                  onPress={() => void startPayment(d)}
                />
              </View>
            </Card>
          ))}

          {/* ── Awaiting confirmation ── */}
          {awaiting.map((d) => (
            <Card key={d.id}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-label text-ink">{d.period}</Text>
                  <Text className="text-body text-ink-soft">
                    {dueAmountLabel(d)}
                  </Text>
                </View>
                <Badge label="Awaiting confirmation" tone="warn" />
              </View>
              <Text className="text-caption text-ink-muted">
                You marked this paid — your admin will confirm it shortly.
              </Text>
            </Card>
          ))}

          {/* ── Manual "I've paid" for offline payments ── */}
          {nextDue ? (
            <Button
              title="Paid by cash/cheque? Notify admin"
              variant="ghost"
              loading={claim.isPending}
              onPress={() =>
                Alert.alert(
                  "Mark as paid?",
                  `This tells your admin you've paid ${formatMoney(duePayableAmount(nextDue))} for ${nextDue.period}. It shows as paid only after they confirm.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "I've paid",
                      onPress: () =>
                        claim.mutate(
                          {
                            id: nextDue.id,
                            note: "Claimed by resident in Portl",
                          },
                          {
                            onError: (e: any) =>
                              Alert.alert("Could not update", e.message),
                          },
                        ),
                    },
                  ],
                )
              }
            />
          ) : null}

          {/* ── Payment history ── */}
          {history.length ? (
            <>
              <SectionTitle>Payment history</SectionTitle>
              {history.map((d) => (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    d.status === "paid"
                      ? `View receipt for ${d.period}`
                      : `${d.period} waived`
                  }
                  disabled={d.status !== "paid"}
                  onPress={() => {
                    if (d.status === "paid") openReceipt(d);
                  }}
                  className="active:opacity-80"
                >
                  <Card>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-label text-ink">
                          {d.period} Maintenance
                        </Text>
                        <Text className="text-caption text-ink-muted">
                          {d.paid_at
                            ? `Paid on ${format(new Date(d.paid_at), "dd MMM yyyy")}`
                            : d.status === "waived"
                              ? "Waived by society"
                              : dueAmountLabel(d)}
                        </Text>
                        {d.status === "paid" ? (
                          <Text className="mt-1 text-caption text-primary">
                            View invoice
                          </Text>
                        ) : null}
                      </View>
                      <Badge
                        label={d.status === "waived" ? "Waived" : "Paid"}
                        tone={d.status === "waived" ? "neutral" : "approve"}
                      />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}

          {!isLoading && !isError && !data?.length ? (
            <EmptyState
              title="No dues yet"
              hint="Maintenance charges raised by your society will show here."
            />
          ) : null}
        </View>
      </ScrollView>

      <PaymentSuccessReceipt
        visible={!!receipt}
        receipt={receipt}
        onClose={() => setReceipt(null)}
      />
    </Screen>
  );
}
