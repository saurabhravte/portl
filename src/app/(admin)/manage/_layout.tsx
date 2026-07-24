import { color } from "@/theme/tokens";
import { Stack } from "expo-router";

export default function ManageLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.paper },
      }}
    />
  );
}
