import { OfflineBanner } from "@/components/OfflineBanner";
import { PrivateMediaImage } from "@/components/PrivateMediaImage";
import { Badge, Button, Card, Field, Screen } from "@/components/ui";
import { useSocietySettings } from "@/features/admin/hooks";
import { useLookupVehicle, type VehicleLookup } from "@/features/vehicles/hooks";
import { useRecurringMatch } from "@/features/recurring/hooks";
import {
  useLookupWatchlist,
  type WatchlistLookup,
} from "@/features/watchlist/hooks";
import { describeInsights, useVisitorInsights } from "@/features/visitors/insights";
import {
  useFlatSearch,
  useFlatAutoApprovalSettings,
  useRaiseRequest,
  useRecentVisitorSearch,
  useResidentSearch,
  VisitorType,
} from "@/features/visitors/hooks";
import { useT } from "@/lib/i18n";
import { isOnlineNow } from "@/lib/offline";
import { pickAndUploadPhoto } from "@/lib/photos";
import { reportMutationError } from "@/lib/queryState";
import { useSupabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const types: { key: VisitorType; label: string }[] = [
  { key: "delivery", label: "Delivery" },
  { key: "guest", label: "Guest" },
  { key: "cab", label: "Cab" },
  { key: "service", label: "Service" },
];

const typeName: Record<VisitorType, string> = {
  delivery: "Delivery",
  guest: "Guest",
  cab: "Cab",
  service: "Service",
};

/** One-tap brand chips — most gate traffic is a handful of brands (review §5.1). */
const brands: { name: string; type: VisitorType }[] = [
  { name: "Swiggy", type: "delivery" },
  { name: "Zomato", type: "delivery" },
  { name: "Amazon", type: "delivery" },
  { name: "Flipkart", type: "delivery" },
  { name: "Uber", type: "cab" },
  { name: "Ola", type: "cab" },
];

export default function NewVisitor() {
  const t = useT();
  const router = useRouter();
  const supabase = useSupabase();
  const [vtype, setVtype] = useState<VisitorType>("delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [flatTerm, setFlatTerm] = useState("");
  const [flat, setFlat] = useState<{ id: string; number: string } | null>(null);
  const flats = useFlatSearch(flatTerm);
  const residents = useResidentSearch(flatTerm);
  const recent = useRecentVisitorSearch(name);
  const raise = useRaiseRequest();
  const societySettings = useSocietySettings();
  const settings = societySettings.data;
  const flatPolicy = useFlatAutoApprovalSettings(flat?.id);
  const autoTypes = new Set(settings?.autoApproveTypes ?? []);
  const flatOptOut = new Set(flatPolicy.data?.noAutoApproveTypes ?? []);
  const willAutoApprove =
    !!flat && autoTypes.has(vtype) && !flatOptOut.has(vtype);

  // Smart gate helpers (#7 insights, #23 plate lookup, #17 recurring match).
  const insights = useVisitorInsights(phone);
  const insightLine = describeInsights(insights.data);
  const lookup = useLookupVehicle();
  const watchlistLookup = useLookupWatchlist();
  const recurringMatch = useRecurringMatch();
  const [vehicleHit, setVehicleHit] = useState<VehicleLookup | null>(null);
  const [watchHit, setWatchHit] = useState<WatchlistLookup | null>(null);
  const [recurringHit, setRecurringHit] = useState<boolean | null>(null);

  const onCheckPlate = () => {
    if (vehicleNo.trim().length < 3) return;
    lookup.mutate(vehicleNo.trim(), {
      onSuccess: (hit) => {
        setVehicleHit(hit);
        if (!hit) Alert.alert("Not registered", "No vehicle matches that plate.");
      },
      onError: (e) => Alert.alert("Lookup failed", e instanceof Error ? e.message : ""),
    });
  };

  const onCheckWatchlist = () => {
    if (!name.trim() && !phone.trim() && vehicleNo.trim().length < 3) return;
    watchlistLookup.mutate(
      {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
      },
      {
        onSuccess: (hit) => {
          setWatchHit(hit);
          if (hit.blocked) {
            Alert.alert(
              "Blacklisted",
              "This visitor matches an active blacklist entry and cannot be raised.",
            );
          } else if (!hit.matches.length) {
            Alert.alert("Clear", "No blacklist or watchlist match.");
          }
        },
        onError: (e) =>
          Alert.alert("Lookup failed", e instanceof Error ? e.message : ""),
      },
    );
  };

  const onCheckRecurring = () => {
    if (!flat || name.trim().length < 1) return;
    recurringMatch.mutate(
      { flatId: flat.id, name: name.trim() },
      { onSuccess: setRecurringHit },
    );
  };

  const onPhoto = async () => {
    if (!(await isOnlineNow())) {
      Alert.alert(
        "Photo unavailable offline",
        "Visitor photos must be uploaded before going offline. You can still queue this request without a photo.",
      );
      return;
    }
    setUploading(true);
    try {
      const url = await pickAndUploadPhoto(supabase, "visitors");
      if (url) setPhotoUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const applyRecent = (v: NonNullable<typeof recent.data>[number]) => {
    setName(v.name);
    setVtype(v.type);
    if (v.phone) setPhone(v.phone);
    if (v.vehicle_no) setVehicleNo(v.vehicle_no);
    if (v.flat) setFlat({ id: v.flat.id, number: v.flat.number });
  };

  const onRaise = () => {
    if (!name.trim() || !flat) {
      Alert.alert(t("missing_info"), t("missing_info_hint"));
      return;
    }
    if (watchHit?.blocked) {
      Alert.alert(
        "Blacklisted",
        "This visitor matches an active blacklist entry and cannot be raised.",
      );
      return;
    }
    raise.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
        type: vtype,
        flatId: flat.id,
        photoUrl: photoUrl ?? undefined,
      },
      {
        onSuccess: (result) => {
          setName("");
          setPhone("");
          setVehicleNo("");
          setPhotoUrl(null);
          setFlat(null);
          setFlatTerm("");
          setWatchHit(null);
          if ("queued" in result && result.queued) {
            Alert.alert(t("queued_title"), t("queued_hint"));
          } else if ("training" in result && result.training) {
            Alert.alert(t("training_on"), t("sent_hint"));
          } else if ("status" in result && result.status === "approved") {
            Alert.alert(t("auto_approved"), t("auto_approved_hint"));
          } else {
            Alert.alert(t("sent"), t("sent_hint"));
          }
          router.push("/(guard)/gate");
        },
        onError: (error) =>
          Alert.alert("Error", reportMutationError("raise-visitor", error)),
      },
    );
  };

  return (
    <Screen>
      <OfflineBanner />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-display text-ink">{t("new_visitor")}</Text>

        <View className="flex-row flex-wrap gap-2">
          {types.map((ty) => (
            <Button
              key={ty.key}
              title={ty.label}
              size="guard"
              variant={vtype === ty.key ? "primary" : "ghost"}
              selected={vtype === ty.key}
              onPress={() => setVtype(ty.key)}
              className="grow"
            />
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          {brands.map((b) => (
            <Pressable
              key={b.name}
              accessibilityRole="button"
              accessibilityLabel={`Use ${b.name} visitor preset`}
              accessibilityState={{ selected: name === b.name }}
              onPress={() => {
                setName(b.name);
                setVtype(b.type);
              }}
              className={`rounded-pill px-3 py-2 ${name === b.name ? "bg-ink" : "bg-surface-alt"}`}
            >
              <Text
                className={`text-caption ${name === b.name ? "text-inverse" : "text-ink-soft"}`}
              >
                {b.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          label={t("visitor_name")}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setWatchHit(null);
          }}
          placeholder={t("name_placeholder")}
        />

        {recent.isLoading ? (
          <Text className="text-caption text-ink-muted">
            Searching recent visitors…
          </Text>
        ) : recent.isError ? (
          <Button
            title="Retry recent visitor search"
            variant="ghost"
            onPress={() => void recent.refetch()}
          />
        ) : null}
        {name.trim().length >= 2 && !!recent.data?.length && (
          <Card className="p-2">
            {recent.data.map((v) => (
              <Button
                key={v.id}
                title={`↺ ${v.name} · ${typeName[v.type as VisitorType] ?? v.type}${v.flat ? ` · ${t("flat")} ${v.flat.number}` : ""}`}
                variant="ghost"
                onPress={() => applyRecent(v)}
              />
            ))}
          </Card>
        )}

        <Field
          label={t("phone_optional")}
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            setWatchHit(null);
          }}
          keyboardType="phone-pad"
        />
        {insightLine ? (
          <Card className="flex-row items-center justify-between p-3">
            <View className="flex-1">
              <Text className="text-caption text-ink-soft">Seen before</Text>
              <Text className="text-body text-ink">{insightLine}</Text>
            </View>
            {insights.data?.known ? <Badge label="Known" tone="approve" /> : null}
          </Card>
        ) : null}
        <Field
          label={t("vehicle_optional")}
          value={vehicleNo}
          onChangeText={(v) => {
            setVehicleNo(v);
            setVehicleHit(null);
            setWatchHit(null);
          }}
          autoCapitalize="characters"
          placeholder="MP09 AB 1234"
        />
        <View className="flex-row flex-wrap gap-2">
          {vehicleNo.trim().length >= 3 ? (
            <Button
              title="Check plate"
              variant="ghost"
              size="sm"
              loading={lookup.isPending}
              onPress={onCheckPlate}
            />
          ) : null}
          {name.trim() || phone.trim() || vehicleNo.trim().length >= 3 ? (
            <Button
              title="Check watchlist"
              variant="ghost"
              size="sm"
              loading={watchlistLookup.isPending}
              onPress={onCheckWatchlist}
            />
          ) : null}
        </View>
        {watchHit?.matches.length ? (
          <Card className="p-3">
            {watchHit.matches.map((match) => (
              <View key={match.id} className="mb-2 gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-body text-ink">
                    {match.name ?? match.phone ?? match.vehicle_no ?? "Match"}
                  </Text>
                  <Badge
                    label={match.kind}
                    tone={match.kind === "blacklist" ? "deny" : "neutral"}
                  />
                </View>
                <Text className="text-caption text-ink-muted">{match.reason}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {vehicleHit ? (
          <Card className="p-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-body text-ink">
                {vehicleHit.label ?? "Registered"} · Flat {vehicleHit.flat_number}
              </Text>
              {vehicleHit.auto_approve ? <Badge label="Auto-approve" tone="approve" /> : null}
            </View>
            {vehicleHit.flat_number ? (
              <Button
                title={`Find flat ${vehicleHit.flat_number}`}
                size="sm"
                variant="secondary"
                onPress={() => {
                  setFlat(null);
                  setFlatTerm(vehicleHit.flat_number ?? "");
                }}
              />
            ) : null}
          </Card>
        ) : null}
        <Button
          title={photoUrl ? t("change_photo") : t("add_photo")}
          variant="secondary"
          size="guard"
          loading={uploading}
          onPress={onPhoto}
        />
        {photoUrl ? (
          <PrivateMediaImage
            reference={photoUrl}
            style={{ width: "100%", height: 160, borderRadius: 12 }}
            contentFit="cover"
          />
        ) : null}
        <Field
          label={t("flat")}
          value={flat ? flat.number : flatTerm}
          onChangeText={(v) => {
            setFlat(null);
            setFlatTerm(v);
          }}
          placeholder={t("flat_placeholder")}
        />

        {!flat && (flats.isLoading || residents.isLoading) ? (
          <Text className="text-caption text-ink-muted">
            Searching flats and residents…
          </Text>
        ) : !flat && (flats.isError || residents.isError) ? (
          <Button
            title="Retry flat search"
            variant="ghost"
            onPress={() => {
              void flats.refetch();
              void residents.refetch();
            }}
          />
        ) : null}
        {!flat &&
          ((flats.data?.length ?? 0) > 0 ||
            (residents.data?.length ?? 0) > 0) && (
            <Card className="p-2">
              {flats.data?.map((f) => (
                <Button
                  key={f.id}
                  title={`${f.tower?.name ?? ""} ${f.number}`}
                  variant="ghost"
                  onPress={() => setFlat({ id: f.id, number: f.number })}
                />
              ))}
              {residents.data
                ?.filter((r) => r.flat)
                .map((r) => (
                  <Button
                    key={r.id}
                    title={`${r.name} · ${r.flat!.tower?.name ?? ""} ${r.flat!.number}`}
                    variant="ghost"
                    onPress={() =>
                      setFlat({ id: r.flat!.id, number: r.flat!.number })
                    }
                  />
                ))}
            </Card>
          )}

        {(flatPolicy.isError || societySettings.isError) && flat ? (
          <Button
            title="Retry approval settings"
            variant="ghost"
            onPress={() => {
              void flatPolicy.refetch();
              void societySettings.refetch();
            }}
          />
        ) : null}
        {flat && name.trim().length >= 1 ? (
          recurringHit ? (
            <Card className="flex-row items-center justify-between p-3">
              <Text className="text-body text-ink">Matches a recurring pass</Text>
              <Badge label="Expected now" tone="approve" />
            </Card>
          ) : (
            <Button
              title="Check recurring pass"
              variant="ghost"
              size="sm"
              loading={recurringMatch.isPending}
              onPress={onCheckRecurring}
            />
          )
        ) : null}
        <Button
          title={willAutoApprove ? t("auto_submit") : t("ask_resident")}
          size="guard"
          onPress={onRaise}
          loading={raise.isPending}
        />
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
