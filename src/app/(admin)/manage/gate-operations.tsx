import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Skeleton } from "@/components/ui";
import { AdminRoute, mutationFeedback } from "@/features/admin/adminUi";
import {
  useAdminOverride,
  useGateActions,
  useGateBoard,
} from "@/features/visitors/hooks";
import { canAdminOverride } from "@/features/productWorkflows/batch4Logic";
import {
  confirmSensitiveAction,
  localAuthFailureMessage,
} from "@/lib/localAuth";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

export default function AdminGateOperations() {
  const board = useGateBoard();
  const override = useAdminOverride();
  const { markEntry, markExit } = useGateActions();
  const [reason, setReason] = useState("");
  return (
    <AdminRoute title="Live gate operations" description="Monitor arrivals and use the audited override only for pending or expired requests.">
      <Field
        label="Override reason"
        value={reason}
        onChangeText={setReason}
        placeholder="At least 5 characters"
      />
      {board.isLoading ? <Skeleton /> : null}
      {board.isError ? <QueryErrorState error={board.error} onRetry={() => void board.refetch()} /> : null}
      <Text className="text-title text-ink">Recent requests</Text>
      {!board.data?.pending.length ? <EmptyState title="No recent gate requests" /> : null}
      {board.data?.pending.map((request) => (
        <Card key={request.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{request.visitor.name}</Text>
            <Badge label={request.status} tone={request.status === "approved" ? "approve" : request.status === "denied" ? "deny" : "neutral"} />
          </View>
          <Text className="text-body text-ink-soft">
            Flat {request.visitor.flat?.number ?? "—"} · {formatDistanceToNow(new Date(request.created_at))} ago
          </Text>
          {request.status === "approved" ? (
            <Button title="Mark entry" variant="approve" loading={markEntry.isPending} onPress={() => markEntry.mutate({ requestId: request.id })} />
          ) : null}
          {canAdminOverride(request.status) ? (
            <Button
              title="Admit with admin override"
              variant="deny"
              disabled={reason.trim().length < 5}
              loading={override.isPending}
              onPress={async () => {
                const auth = await confirmSensitiveAction("Confirm admin gate override");
                if (!auth.ok) {
                  Alert.alert("Override blocked", localAuthFailureMessage(auth));
                  return;
                }
                override.mutate(
                  { requestId: request.id, reason: reason.trim() },
                  mutationFeedback("Override recorded", () => setReason("")),
                );
              }}
            />
          ) : null}
        </Card>
      ))}
      <Text className="text-title text-ink">Inside now</Text>
      {!board.data?.inside.length ? <EmptyState title="Nobody is inside" /> : null}
      {board.data?.inside.map((log) => (
        <Card key={log.id}>
          <Text className="text-title text-ink">{log.visitor.name}</Text>
          <Text className="text-caption text-ink-muted">Flat {log.visitor.flat?.number ?? "—"}</Text>
          <Button title="Mark exit" variant="secondary" loading={markExit.isPending} onPress={() => markExit.mutate({ logId: log.id })} />
        </Card>
      ))}
    </AdminRoute>
  );
}
