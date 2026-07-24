import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  QueryErrorState,
  Screen,
  SectionTitle,
} from "@/components/ui";
import {
  useCreatePreApproval,
  useMyPreApprovals,
  usePreApprovalEvents,
  useRevokePreApproval,
  type PreApprovalRow,
} from "@/features/preapprovals/hooks";
import { getPreApprovalStatus } from "@/features/productWorkflows/logic";
import { sharePass } from "@/features/preapprovals/share";
import { PendingApprovalsPanel } from "@/features/visitors/PendingApprovalsPanel";
import { VisitorHistoryScreen } from "@/features/visitors/HistoryScreen";
import { useFlatApprovals, type VisitorType } from "@/features/visitors/hooks";
import { color } from "@/theme/tokens";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { addHours, format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

const types: VisitorType[] = ["guest", "delivery", "cab", "service"];

type VisitorsTab = "pending" | "preapproved" | "history";

function parseTab(value: string | string[] | undefined): VisitorsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "preapproved" || raw === "history" || raw === "pending")
    return raw;
  return "pending";
}

export default function VisitorRequests() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<VisitorsTab>(() => parseTab(params.tab));
  const pending = useFlatApprovals();
  const pendingCount = pending.data?.length ?? 0;

  useEffect(() => {
    setTab(parseTab(params.tab));
  }, [params.tab]);

  const selectTab = (next: VisitorsTab) => {
    setTab(next);
    router.setParams({ tab: next });
  };

  return (
    <Screen>
      <View className="gap-3 px-4 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-display text-ink">Visitor Requests</Text>
          {tab !== "history" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open visitor history"
              onPress={() => selectTab("history")}
              className="rounded-pill bg-surface-alt px-3 py-2 border border-border active:opacity-80"
            >
              <Text className="text-caption font-semibold text-ink-soft">
                History
              </Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip
            label={pendingCount ? `Pending (${pendingCount})` : "Pending"}
            selected={tab === "pending"}
            onPress={() => selectTab("pending")}
          />
          <Chip
            label="Pre-Approved"
            selected={tab === "preapproved"}
            onPress={() => selectTab("preapproved")}
          />
          <Chip
            label="History"
            selected={tab === "history"}
            onPress={() => selectTab("history")}
          />
        </ScrollView>
      </View>

      {tab === "pending" ? (
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={pending.isRefetching}
              onRefresh={() => void pending.refetch()}
            />
          }
        >
          <View className="gap-3 p-4 pb-8">
            <PendingApprovalsPanel />
          </View>
        </ScrollView>
      ) : null}

      {tab === "preapproved" ? <PreApprovedTab /> : null}

      {tab === "history" ? (
        <View className="flex-1 px-4 pb-4">
          <VisitorHistoryScreen embedded />
        </View>
      ) : null}
    </Screen>
  );
}

function PreApprovedTab() {
  const router = useRouter();
  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useMyPreApprovals();
  const create = useCreatePreApproval();
  const [name, setName] = useState("");
  const [vtype, setVtype] = useState<VisitorType>("guest");
  const [validFrom, setValidFrom] = useState(() => new Date());
  const [validTo, setValidTo] = useState(() => addHours(new Date(), 12));

  const onCreate = () => {
    if (!name.trim()) {
      Alert.alert("Add a name", "Who are you expecting?");
      return;
    }
    create.mutate(
      {
        visitorName: name.trim(),
        type: vtype,
        validFrom,
        validTo,
      },
      {
        onSuccess: () => {
          setName("");
          setValidFrom(new Date());
          setValidTo(addHours(new Date(), 12));
        },
        onError: (error: any) =>
          Alert.alert("Could not create pass", error.message),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        <View className="gap-4 p-4 pb-8">
          <Text className="text-title text-ink">Expecting someone?</Text>
          <Button
            title="Create a group / event pass"
            variant="secondary"
            onPress={() => router.push("/(resident)/group-pass" as any)}
          />
          <Card>
            <Field
              label="Guest name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Asha Verma"
            />
            <View className="flex-row flex-wrap gap-2">
              {types.map((t) => (
                <Button
                  key={t}
                  title={t[0].toUpperCase() + t.slice(1)}
                  variant={vtype === t ? "primary" : "ghost"}
                  selected={vtype === t}
                  onPress={() => setVtype(t)}
                />
              ))}
            </View>
            <DateTimeField
              label="Valid from"
              value={validFrom}
              onChange={(next) => {
                setValidFrom(next);
                if (next >= validTo) setValidTo(addHours(next, 1));
              }}
            />
            <DateTimeField
              label="Valid until"
              value={validTo}
              minimumDate={validFrom}
              onChange={setValidTo}
            />
            <View className="flex-row flex-wrap gap-2">
              {[2, 12, 24, 72].map((hours) => (
                <Button
                  key={hours}
                  title={`${hours}h`}
                  variant="ghost"
                  onPress={() => setValidTo(addHours(validFrom, hours))}
                />
              ))}
            </View>
            <Button
              title="Create gate pass"
              onPress={onCreate}
              loading={create.isPending}
            />
          </Card>

          <ExpectedToday data={data} />
          <SectionTitle>Active passes</SectionTitle>
          {isLoading ? <View className="h-24 rounded-lg bg-surface-alt" /> : null}
          {!isLoading && isError ? (
            <QueryErrorState
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
              title="Couldn’t load guest passes"
            />
          ) : null}
          {!isLoading && !isError && !data?.length && (
            <EmptyState
              title="No passes yet"
              hint="A pass gives your guest a 6-digit code — they walk straight in, no call needed."
              actionLabel="Refresh"
              onAction={() => void refetch()}
            />
          )}
          {data?.map((pa) => (
            <PassCard key={pa.id} pass={pa} />
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DateTimeField({
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
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setMode(null);
    if (event.type === "set" && selected) onChange(selected);
  };
  return (
    <View className="gap-2">
      <Text className="text-label text-ink">{label}</Text>
      <View className="flex-row gap-2">
        <Button
          title={format(value, "d MMM yyyy")}
          variant="secondary"
          className="grow"
          onPress={() => setMode("date")}
        />
        <Button
          title={format(value, "h:mm a")}
          variant="secondary"
          className="grow"
          onPress={() => setMode("time")}
        />
      </View>
      {mode ? (
        <View className="gap-2">
          <DateTimePicker
            value={value}
            mode={mode}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={minimumDate}
            onChange={handleChange}
          />
          {Platform.OS === "ios" ? (
            <Button
              title="Done"
              variant="secondary"
              onPress={() => setMode(null)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ExpectedToday({ data }: { data: PreApprovalRow[] | undefined }) {
  if (!data?.length) return null;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const today = data.filter((p) => {
    if (p.revoked_at || p.used_at) return false;
    const from = new Date(p.valid_from);
    const to = new Date(p.valid_to);
    return from < dayEnd && to >= dayStart; // window overlaps today
  });
  if (!today.length) return null;
  return (
    <Card>
      <SectionTitle>Expected today</SectionTitle>
      {today.map((p) => (
        <View key={p.id} className="flex-row items-center justify-between py-1">
          <Text className="text-body text-ink">{p.visitor_name}</Text>
          <Text className="text-caption text-ink-muted">
            {format(new Date(p.valid_from), "h:mm a")}–{format(new Date(p.valid_to), "h:mm a")}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const statusMeta = {
  active: { label: "Active", tone: "ink" as const },
  scheduled: { label: "Scheduled", tone: "neutral" as const },
  used: { label: "Used", tone: "approve" as const },
  expired: { label: "Expired", tone: "deny" as const },
  revoked: { label: "Revoked", tone: "deny" as const },
};

function PassCard({ pass }: { pass: PreApprovalRow }) {
  const [details, setDetails] = useState(false);
  const status = getPreApprovalStatus(pass);
  const meta = statusMeta[status];
  const events = usePreApprovalEvents(details ? pass.id : null);
  const revoke = useRevokePreApproval();
  const share = () =>
    void sharePass({ code: pass.code, visitorName: pass.visitor_name });

  return (
    <Card className="items-center">
      <View className="w-full flex-row items-center justify-between">
        <Text className="text-title text-ink">{pass.visitor_name}</Text>
        <Badge label={meta.label} tone={meta.tone} />
      </View>
      <Text className="text-caption text-ink-muted">
        {format(new Date(pass.valid_from), "d MMM, h:mm a")} –{" "}
        {format(new Date(pass.valid_to), "d MMM, h:mm a")}
      </Text>
      {status === "active" || status === "scheduled" ? (
        <>
          <QRCode
            value={pass.code}
            size={120}
            color={color.ink}
            backgroundColor={color.surface}
          />
          <Text className="text-display tracking-[6px] text-ink">{pass.code}</Text>
          <View className="w-full flex-row gap-2">
            <Button title="Share" variant="secondary" className="grow" onPress={share} />
            <Button
              title="Revoke"
              variant="deny"
              className="grow"
              loading={revoke.isPending}
              onPress={() =>
                Alert.alert("Revoke this pass?", "The code will stop working immediately.", [
                  { text: "Keep pass", style: "cancel" },
                  {
                    text: "Revoke",
                    style: "destructive",
                    onPress: () =>
                      revoke.mutate(
                        { id: pass.id, reason: "Revoked by resident" },
                        {
                          onError: (error: any) =>
                            Alert.alert("Could not revoke", error.message),
                        },
                      ),
                  },
                ])
              }
            />
          </View>
        </>
      ) : null}
      {pass.revoke_reason ? (
        <Text className="text-caption text-ink-muted">{pass.revoke_reason}</Text>
      ) : null}
      <Button
        title={details ? "Hide history" : "Details & history"}
        variant="ghost"
        onPress={() => setDetails((current) => !current)}
      />
      {details ? (
        <View className="w-full gap-1 border-t border-border pt-2">
          {events.isLoading ? (
            <Text className="text-caption text-ink-muted">Loading…</Text>
          ) : null}
          {events.data?.map((event) => (
            <Text key={event.id} className="text-caption text-ink-muted">
              {format(new Date(event.created_at), "d MMM, h:mm a")} · {event.event}
              {event.detail ? ` · ${event.detail}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
