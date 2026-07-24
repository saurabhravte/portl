import { Badge, Button, Card, EmptyState, Field } from "@/components/ui";
import { AdminRoute, mutationFeedback } from "@/features/admin/adminUi";
import {
  openCctvFeed,
  useCctvCameras,
  useRemoveCctvCamera,
  useSaveCctvCamera,
} from "@/features/cctv/hooks";
import { useGates } from "@/features/guards/hooks";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

export default function CctvRoute() {
  const cameras = useCctvCameras();
  const gates = useGates();
  const save = useSaveCctvCamera();
  const remove = useRemoveCctvCamera();
  const [name, setName] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [streamKind, setStreamKind] = useState<"hls" | "embed" | "snapshot">("hls");
  const [gateId, setGateId] = useState<string | undefined>();

  return (
    <AdminRoute
      title="CCTV cameras"
      description="Register HLS, embed, or snapshot URLs for society gates. Guards can open feeds from the gate screen."
    >
      <Card>
        <Field label="Camera name" value={name} onChangeText={setName} placeholder="Main gate cam 1" />
        <Field
          label="Stream URL"
          value={streamUrl}
          onChangeText={setStreamUrl}
          placeholder="https://…"
          autoCapitalize="none"
        />
        <Text className="text-caption text-ink-muted">Stream kind</Text>
        <View className="flex-row flex-wrap gap-2">
          {(["hls", "embed", "snapshot"] as const).map((kind) => (
            <Button
              key={kind}
              title={kind.toUpperCase()}
              variant={streamKind === kind ? "primary" : "ghost"}
              selected={streamKind === kind}
              onPress={() => setStreamKind(kind)}
            />
          ))}
        </View>
        <Text className="text-caption text-ink-muted">Linked gate (optional)</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            title="None"
            variant={!gateId ? "primary" : "ghost"}
            selected={!gateId}
            onPress={() => setGateId(undefined)}
          />
          {gates.data?.filter((g) => g.is_active).map((gate) => (
            <Button
              key={gate.id}
              title={gate.name}
              variant={gateId === gate.id ? "primary" : "ghost"}
              selected={gateId === gate.id}
              onPress={() => setGateId(gate.id)}
            />
          ))}
        </View>
        <Button
          title="Add camera"
          disabled={name.trim().length < 2 || streamUrl.trim().length < 8}
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              { name, streamUrl, streamKind, gateId },
              mutationFeedback("Camera added", () => {
                setName("");
                setStreamUrl("");
                setGateId(undefined);
              }),
            )
          }
        />
      </Card>

      {!cameras.data?.length ? <EmptyState title="No cameras configured" /> : null}
      {cameras.data?.map((camera) => (
        <Card key={camera.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{camera.name}</Text>
            <Badge label={camera.stream_kind.toUpperCase()} />
          </View>
          <Text className="text-caption text-ink-muted">
            {camera.gate?.name ?? "No gate"} · {camera.is_active ? "Active" : "Inactive"}
          </Text>
          <Button
            title="Open feed"
            variant="secondary"
            onPress={() =>
              void openCctvFeed(camera.stream_url).catch((error) =>
                Alert.alert("Couldn’t open feed", error instanceof Error ? error.message : ""),
              )
            }
          />
          <Button
            title={camera.is_active ? "Deactivate" : "Reactivate"}
            variant="ghost"
            onPress={() =>
              save.mutate({
                id: camera.id,
                name: camera.name,
                streamUrl: camera.stream_url,
                streamKind: camera.stream_kind,
                gateId: camera.gate_id ?? undefined,
                isActive: !camera.is_active,
              })
            }
          />
          <Button
            title="Remove"
            variant="deny"
            loading={remove.isPending}
            onPress={() => remove.mutate(camera.id, mutationFeedback("Camera removed"))}
          />
        </Card>
      ))}
    </AdminRoute>
  );
}
