import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { InviteIdentityField } from "@/features/auth/InviteIdentityField";
import {
  type IdentityType,
  isValidIdentity,
} from "@/features/auth/identity";
import {
  useHouseholdInvites,
  useInviteHouseholdMember,
} from "@/features/community/hooks";
import {
  useCancelHouseholdInvite,
  useFlatMembers,
  useRemoveFlatMember,
} from "@/features/household/hooks";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

export function HouseholdPanel() {
  const members = useFlatMembers();
  const removeMember = useRemoveFlatMember();
  const invitesQuery = useHouseholdInvites();
  const cancelInvite = useCancelHouseholdInvite();
  const invite = useInviteHouseholdMember();
  const [identityType, setIdentityType] = useState<IdentityType>("phone");
  const [identityValue, setIdentityValue] = useState("");
  const [name, setName] = useState("");

  const pending = (invitesQuery.data ?? []).filter((i) => !i.claimed_by);

  return (
    <Card>
      <SectionTitle>Family & household</SectionTitle>
      <Text className="text-caption text-ink-muted">
        People linked to your flat can approve visitors and manage shared passes.
      </Text>

      {members.isLoading ? <Skeleton height={48} /> : null}
      {members.isError ? (
        <QueryErrorState
          error={members.error}
          onRetry={() => void members.refetch()}
          isRetrying={members.isRefetching}
        />
      ) : null}
      {!members.isLoading && !members.data?.length ? (
        <EmptyState title="No members listed yet" />
      ) : null}
      {members.data?.map((member) => (
        <View
          key={member.id}
          className="flex-row items-center justify-between gap-2 border-b border-border py-2"
        >
          <View className="flex-1">
            <Text className="text-body text-ink">
              {member.name}
              {member.isSelf ? " (you)" : ""}
            </Text>
            <Text className="text-caption text-ink-muted">
              {member.phone ?? member.email ?? "No contact on file"}
            </Text>
          </View>
          {member.isSelf ? (
            <Badge label="You" tone="approve" />
          ) : (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              loading={removeMember.isPending}
              onPress={() =>
                Alert.alert(
                  "Remove from flat?",
                  `${member.name} will lose access to this flat’s approvals and passes.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () =>
                        removeMember.mutate(member.id, {
                          onError: (e) =>
                            Alert.alert(
                              "Couldn’t remove",
                              e instanceof Error ? e.message : "",
                            ),
                        }),
                    },
                  ],
                )
              }
            />
          )}
        </View>
      ))}

      <Text className="mt-2 text-caption text-ink-muted">Invite someone new</Text>
      <InviteIdentityField
        type={identityType}
        value={identityValue}
        onTypeChange={(type) => {
          setIdentityType(type);
          setIdentityValue("");
        }}
        onValueChange={setIdentityValue}
        disabled={invite.isPending}
      />
      <Field label="Name (optional)" value={name} onChangeText={setName} />
      <Button
        title="Send invite"
        variant="secondary"
        loading={invite.isPending}
        disabled={!isValidIdentity(identityType, identityValue)}
        onPress={() =>
          invite.mutate(
            { identityType, identityValue, name },
            {
              onSuccess: () => {
                setIdentityValue("");
                setName("");
              },
              onError: (e: any) => Alert.alert("Could not invite", e.message),
            },
          )
        }
      />

      {pending.length ? (
        <>
          <Text className="mt-2 text-caption text-ink-muted">Pending invites</Text>
          {pending.map((i) => (
            <View
              key={i.id}
              className="flex-row items-center justify-between gap-2 py-1"
            >
              <Text className="flex-1 text-body text-ink-soft">
                {i.name ?? i.identity_value}
              </Text>
              <Badge label="Invited" />
              <Button
                title="Cancel"
                variant="ghost"
                size="sm"
                loading={cancelInvite.isPending}
                onPress={() =>
                  cancelInvite.mutate(i.id, {
                    onError: (e) =>
                      Alert.alert(
                        "Couldn’t cancel",
                        e instanceof Error ? e.message : "",
                      ),
                  })
                }
              />
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}
