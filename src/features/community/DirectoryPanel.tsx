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
import { useServiceProviders, useStaff } from "@/features/community/hooks";
import {
  useProviderRatings,
  useRateProvider,
} from "@/features/community/extras";
import { useSessionStore } from "@/stores/session";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";

export function DirectoryPanel() {
  const { data, error, isError, isLoading, isRefetching, refetch } = useStaff();
  const [search, setSearch] = useState("");
  const providers = useServiceProviders(search);

  if (isLoading) return <Skeleton />;
  if (isError)
    return (
      <QueryErrorState
        error={error}
        onRetry={() => void refetch()}
        isRetrying={isRefetching}
      />
    );

  return (
    <>
      <SectionTitle>Society staff</SectionTitle>
      {!data?.length ? (
        <EmptyState
          title="No society staff listed"
          hint="Society employees will show here."
        />
      ) : null}
      {data?.map((s) => (
        <Card key={s.id}>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-label text-ink">{s.name}</Text>
              <Text className="text-caption text-ink-muted">{s.category}</Text>
            </View>
            {s.phone ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Call ${s.name} at ${s.phone}`}
                onPress={() => Linking.openURL(`tel:${s.phone}`)}
              >
                <Badge label={`Call ${s.phone}`} tone="ink" />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
      <SectionTitle>Verified service providers</SectionTitle>
      <Field
        label="Search providers"
        value={search}
        onChangeText={setSearch}
        placeholder="Name, e.g. Ramesh"
      />
      {providers.isError ? (
        <QueryErrorState
          error={providers.error}
          onRetry={() => void providers.refetch()}
          isRetrying={providers.isRefetching}
        />
      ) : null}
      {!providers.isLoading && !providers.data?.length ? (
        <EmptyState
          title="No providers found"
          hint="Try another name or ask the society team to verify a provider."
        />
      ) : null}
      {providers.data?.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} />
      ))}
    </>
  );
}

function ProviderCard({
  provider,
}: {
  provider: {
    id: string;
    name: string;
    category: string;
    phone: string | null;
    photo_url: string | null;
    description: string | null;
    is_verified: boolean;
    is_available: boolean;
    availability_text: string | null;
  };
}) {
  const role = useSessionStore((s) => s.profile?.role);
  const summary = useProviderRatings(provider.id);
  const rate = useRateProvider();
  const avg = summary.data?.avg;
  const count = summary.data?.count ?? 0;

  return (
    <Card>
      <View className="flex-row gap-3">
        {provider.photo_url ? (
          <Image
            source={{ uri: provider.photo_url }}
            className="h-14 w-14 rounded-md bg-surface-alt"
            contentFit="cover"
          />
        ) : null}
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-label text-ink">{provider.name}</Text>
            {provider.is_verified ? (
              <Badge label="Verified" tone="approve" />
            ) : (
              <Badge label="Unverified" tone="neutral" />
            )}
            {count > 0 ? (
              <Badge
                label={`${avg?.toFixed?.(1) ?? avg}★ (${count})`}
                tone="ink"
              />
            ) : null}
          </View>
          <Text className="text-caption text-ink-muted">
            {provider.category} ·{" "}
            {provider.is_available ? "Available" : "Unavailable"}
          </Text>
          {provider.availability_text ? (
            <Text className="text-caption text-ink-muted">
              {provider.availability_text}
            </Text>
          ) : null}
          {provider.description ? (
            <Text className="text-body text-ink-soft">{provider.description}</Text>
          ) : null}
        </View>
      </View>
      {provider.phone && provider.is_available ? (
        <Button
          title={`Call ${provider.name}`}
          variant="secondary"
          onPress={() => Linking.openURL(`tel:${provider.phone}`)}
        />
      ) : null}
      {role === "resident" ? (
        <View className="flex-row flex-wrap gap-2">
          {[5, 4, 3, 2, 1].map((stars) => (
            <Button
              key={stars}
              title={`${stars}★`}
              size="sm"
              variant="ghost"
              loading={rate.isPending}
              onPress={() =>
                rate.mutate(
                  { providerId: provider.id, rating: stars },
                  {
                    onSuccess: () =>
                      Alert.alert("Thanks", "Your rating was saved."),
                    onError: (e: Error) =>
                      Alert.alert("Couldn’t rate", e.message),
                  },
                )
              }
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
