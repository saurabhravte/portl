import { BackControl, Button, Field, Screen } from "@/components/ui";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

export interface AdminCursor {
  sort: string;
  id: string;
}

export function useAdminCursorPager(resetKey: string) {
  const [cursors, setCursors] = useState<(AdminCursor | null)[]>([null]);
  useEffect(() => setCursors([null]), [resetKey]);
  const page = cursors.length;
  return {
    page,
    cursor: cursors[cursors.length - 1],
    previous: () => setCursors((current) => current.length > 1 ? current.slice(0, -1) : current),
    next: (cursor: AdminCursor | null | undefined) => {
      if (cursor) setCursors((current) => [...current, cursor]);
    },
  };
}

export function AdminRoute({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Screen>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="gap-3 p-4 pb-10">
          <BackControl
            label="Manage"
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(admin)/manage" as never)
            }
          />
          <Text accessibilityRole="header" className="text-display text-ink">
            {title}
          </Text>
          {description ? <Text className="text-body text-ink-soft">{description}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-1">
      <Text className="text-caption text-ink-muted">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
        <View accessibilityRole="radiogroup" className="flex-row gap-2">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={`${label}: ${option.label}`}
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(option.value)}
                className={`min-h-11 justify-center rounded-pill px-3 ${
                  selected ? "bg-ink" : "bg-surface-alt"
                }`}
              >
                <Text className={`text-caption ${selected ? "text-inverse" : "text-ink-soft"}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function SearchAndPagination({
  search,
  onSearchChange,
  page,
  pageCount,
  resultCount,
  onPageChange,
  placeholder = "Search…",
}: {
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  pageCount: number;
  resultCount: number;
  onPageChange: (page: number) => void;
  placeholder?: string;
}) {
  return (
    <View className="gap-2">
      <Field
        label="Search"
        accessibilityLabel={placeholder}
        value={search}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        returnKeyType="search"
      />
      <View className="flex-row items-center justify-between">
        <Text accessibilityLiveRegion="polite" className="text-caption text-ink-muted">
          {resultCount} result{resultCount === 1 ? "" : "s"} · page {page} of {pageCount}
        </Text>
        <View className="flex-row gap-2">
          <Button
            title="Previous"
            variant="ghost"
            disabled={page <= 1}
            onPress={() => onPageChange(page - 1)}
          />
          <Button
            title="Next"
            variant="ghost"
            disabled={page >= pageCount}
            onPress={() => onPageChange(page + 1)}
          />
        </View>
      </View>
    </View>
  );
}

function message(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Please try again.";
}

export function mutationFeedback(successTitle: string, onSuccess?: () => void) {
  return {
    onSuccess: () => {
      onSuccess?.();
      Alert.alert(successTitle);
    },
    onError: (error: unknown) => Alert.alert("Couldn’t complete action", message(error)),
  };
}

export function mutationError(error: unknown) {
  Alert.alert("Couldn’t complete action", message(error));
}
