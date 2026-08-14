import { Stack } from "expo-router";
import { AppFrame } from "@/components/AppFrame";
import { WhiteboardLeaveProvider } from "@/whiteboard/WhiteboardLeaveContext";

export default function MainLayout() {
  return (
    <WhiteboardLeaveProvider>
      <AppFrame>
        <Stack screenOptions={{ headerShown: false }} />
      </AppFrame>
    </WhiteboardLeaveProvider>
  );
}
