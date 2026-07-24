import { Button, Card, QueryErrorState, SectionTitle, Skeleton } from "@/components/ui";
import {
  useArtifactUrl,
  useCancelAccountDeletion,
  usePrivacyStatus,
  useRequestAccountDeletion,
  useRequestPersonalExport,
} from "@/features/privacy/hooks";
import {
  confirmSensitiveAction,
  localAuthFailureMessage,
} from "@/lib/localAuth";
import { format } from "date-fns";
import React from "react";
import { Alert, Linking, Text } from "react-native";

export function PrivacyControls({ onDeletionRequested }: { onDeletionRequested: () => Promise<void> }) {
  const status = usePrivacyStatus();
  const requestExport = useRequestPersonalExport();
  const requestDeletion = useRequestAccountDeletion();
  const cancelDeletion = useCancelAccountDeletion();
  const artifactUrl = useArtifactUrl();
  const exportRequest = status.data?.exportRequest;
  const deletion = status.data?.deletionRequest;
  const artifact = exportRequest?.artifact as unknown as
    | { id: string; status: string; expires_at: string | null }
    | null;

  const download = () => {
    if (!artifact?.id) return;
    artifactUrl.mutate(
      { artifactId: artifact.id },
      {
        onSuccess: (data) => void Linking.openURL(data.url),
        onError: () => Alert.alert("Download unavailable", "Request a new export or try again."),
      },
    );
  };

  return (
    <Card>
      <SectionTitle>Privacy and account</SectionTitle>
      {status.isLoading ? <Skeleton height={48} /> : null}
      {status.isError ? (
        <QueryErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : null}
      <Text className="text-caption text-ink-muted">
        Exports are private, expire automatically, and exclude credentials and push tokens.
      </Text>
      <Button
        title={exportRequest?.status === "ready" ? "Download my data" : "Request my data"}
        variant="secondary"
        loading={requestExport.isPending || artifactUrl.isPending}
        disabled={exportRequest?.status === "pending" || exportRequest?.status === "processing"}
        onPress={exportRequest?.status === "ready" ? download : () => requestExport.mutate({})}
      />
      {exportRequest ? (
        <Text className="text-caption text-ink-muted">
          Export: {exportRequest.status}
          {artifact?.expires_at
            ? ` · expires ${format(new Date(artifact.expires_at), "d MMM, h:mm a")}`
            : ""}
        </Text>
      ) : null}
      {deletion?.status === "pending" || deletion?.status === "held" ? (
        <>
          <Text className="text-caption text-deny">
            Deletion {deletion.status === "held" ? "is paused by a legal hold" : `is scheduled after ${format(new Date(deletion.execute_after), "d MMM yyyy")}`}.
          </Text>
          {deletion.status === "pending" ? (
            <Button
              title="Cancel account deletion"
              variant="ghost"
              loading={cancelDeletion.isPending}
              onPress={() => cancelDeletion.mutate({})}
            />
          ) : null}
        </>
      ) : (
        <Button
          title="Delete my account"
          variant="ghost"
          loading={requestDeletion.isPending}
          onPress={() =>
            Alert.alert(
              "Request account deletion?",
              "Push and signed-in device sessions are revoked immediately. You can cancel during your society’s configured grace period.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Request deletion",
                  style: "destructive",
                  onPress: () => {
                    void (async () => {
                      const auth = await confirmSensitiveAction(
                        "Confirm account deletion request",
                      );
                      if (!auth.ok) {
                        Alert.alert("Deletion blocked", localAuthFailureMessage(auth));
                        return;
                      }
                      requestDeletion.mutate(
                        {},
                        {
                          onSuccess: () => void onDeletionRequested(),
                          onError: (error) =>
                            Alert.alert(
                              "Couldn’t request deletion",
                              error instanceof Error ? error.message : "Please try again.",
                            ),
                        },
                      );
                    })();
                  },
                },
              ],
            )
          }
        />
      )}
    </Card>
  );
}
