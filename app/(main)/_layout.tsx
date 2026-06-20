import { Stack } from "expo-router";
import { AppFrame } from "@/components/AppFrame";

export default function MainLayout() {
  return (
    <AppFrame>
      <Stack screenOptions={{ headerShown: false }} />
    </AppFrame>
  );
}
