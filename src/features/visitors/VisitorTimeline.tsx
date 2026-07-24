import { format } from "date-fns";
import React from "react";
import { Text, View } from "react-native";

type Status = "pending" | "approved" | "denied" | "expired";

/**
 * Compact vertical timeline for a visitor request (#11).
 * Renders the states we can derive from the request itself:
 * Arrived → Approved/Denied/Expired (and a "leave at gate" note when set).
 * Entry/exit at the gate lives in gate_logs and is shown on the history screen.
 */
export function VisitorTimeline({
  createdAt,
  status,
  decidedAt,
  handling,
}: {
  createdAt: string;
  status: Status;
  decidedAt?: string | null;
  handling?: string | null;
}) {
  const steps: { label: string; at?: string | null; done: boolean; tone: string }[] = [
    { label: "Arrived at gate", at: createdAt, done: true, tone: "bg-primary" },
  ];

  if (status === "approved") {
    steps.push({ label: "Approved", at: decidedAt, done: true, tone: "bg-approve" });
    if (handling === "leave_at_gate") {
      steps.push({ label: "Leave at gate", done: true, tone: "bg-accent" });
    }
  } else if (status === "denied") {
    steps.push({ label: "Denied", at: decidedAt, done: true, tone: "bg-deny" });
  } else if (status === "expired") {
    steps.push({ label: "Expired unanswered", at: decidedAt, done: true, tone: "bg-ink-muted" });
  } else {
    steps.push({ label: "Awaiting your response", done: false, tone: "bg-ink-muted" });
  }

  return (
    <View className="gap-3 py-1">
      {steps.map((s, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <View className={`h-3 w-3 rounded-full ${s.done ? s.tone : "bg-border"}`} />
          <View className="flex-1 flex-row items-center justify-between">
            <Text className={`text-body ${s.done ? "text-ink" : "text-ink-muted"}`}>
              {s.label}
            </Text>
            {s.at ? (
              <Text className="text-caption text-ink-muted">
                {format(new Date(s.at), "h:mm a")}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
