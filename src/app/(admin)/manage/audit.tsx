import { Badge, Button, Card, EmptyState, QueryErrorState, Skeleton } from "@/components/ui";
import { AdminRoute, FilterChips, mutationFeedback, SearchAndPagination } from "@/features/admin/adminUi";
import {
  useAdminAuditPage,
  useAuditExports,
  useCreateAuditExport,
} from "@/features/admin/hooks";
import { useArtifactUrl } from "@/features/privacy/hooks";
import { format } from "date-fns";
import React, { useEffect, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";

type Cursor = { created_at: string; id: string };
type Action = "" | "insert" | "update" | "delete";

export default function AuditRoute() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<Action>("");
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null]);
  const resetKey = `${search.trim()}:${action}`;
  useEffect(() => setCursors([null]), [resetKey]);
  const page = cursors.length;
  const audit = useAdminAuditPage({
    search,
    action,
    after: cursors[cursors.length - 1],
    limit: 20,
  });
  const createExport = useCreateAuditExport();
  const exports = useAuditExports();
  const artifactUrl = useArtifactUrl();
  const total = audit.data?.total_count ?? 0;

  const openArtifact = (artifactId: string) =>
    artifactUrl.mutate(
      { artifactId },
      {
        onSuccess: (data) => void Linking.openURL(data.url),
        onError: () => Alert.alert("Export unavailable", "It may have expired."),
      },
    );

  return (
    <AdminRoute title="Administrative audit" description="Immutable, sanitized changes with private CSV or JSON exports.">
      <FilterChips
        label="Action"
        value={action}
        options={[
          { value: "", label: "All" },
          { value: "insert", label: "Created" },
          { value: "update", label: "Updated" },
          { value: "delete", label: "Deleted" },
        ]}
        onChange={setAction}
      />
      <SearchAndPagination
        search={search}
        onSearchChange={setSearch}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / 20))}
        resultCount={total}
        onPageChange={(nextPage) => {
          if (nextPage > page && audit.data?.next_cursor) {
            setCursors((current) => [...current, audit.data!.next_cursor]);
          } else if (nextPage < page) {
            setCursors((current) => current.slice(0, -1));
          }
        }}
      />
      <View className="flex-row gap-2">
        {(["csv", "json"] as const).map((exportFormat) => (
          <Button
            key={exportFormat}
            title={`Export ${exportFormat.toUpperCase()}`}
            variant="secondary"
            className="grow"
            loading={createExport.isPending}
            onPress={() =>
              createExport.mutate(
                { format: exportFormat, filters: action ? { action } : undefined },
                mutationFeedback("Export queued"),
              )
            }
          />
        ))}
      </View>
      {exports.data?.map((job) => {
        const artifact = job.artifact as unknown as { id: string; status: string } | null;
        return (
          <Card key={job.id}>
            <View className="flex-row items-center justify-between">
              <Text className="text-caption text-ink-muted">
                {job.format.toUpperCase()} · {format(new Date(job.created_at), "d MMM, h:mm a")}
              </Text>
              <Badge label={job.status} tone={job.status === "ready" ? "approve" : "neutral"} />
            </View>
            {job.status === "ready" && artifact?.id ? (
              <Button title="Download export" variant="ghost" onPress={() => openArtifact(artifact.id)} />
            ) : null}
          </Card>
        );
      })}
      {audit.isLoading ? <Skeleton /> : null}
      {audit.isError ? <QueryErrorState error={audit.error} onRetry={() => void audit.refetch()} /> : null}
      {!audit.isLoading && !audit.data?.rows.length ? <EmptyState title="No audit events" /> : null}
      {audit.data?.rows.map((event) => (
        <Card key={event.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-label text-ink">{event.target_type}</Text>
            <Badge label={event.action} tone={event.action === "delete" ? "deny" : "neutral"} />
          </View>
          <Text className="text-caption text-ink-muted">
            {format(new Date(event.created_at), "d MMM yyyy, h:mm a")} · {event.actor_role ?? "system"}
          </Text>
          <Text className="text-caption text-ink-muted">Correlation {event.correlation_id}</Text>
          <Text className="text-caption text-ink-soft" numberOfLines={4}>
            {JSON.stringify(event.after_state ?? event.before_state)}
          </Text>
        </Card>
      ))}
    </AdminRoute>
  );
}
