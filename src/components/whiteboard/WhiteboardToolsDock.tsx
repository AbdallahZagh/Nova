import { Pressable, View, type ReactNode } from "react-native";
import { PenIcon } from "@/components/whiteboard/BoardToolIcons";

type WhiteboardToolsDockProps = {
  open: boolean;
  accent: string;
  onOpen: () => void;
  children: ReactNode;
};

export function WhiteboardToolsDock({
  open,
  accent,
  onOpen,
  children,
}: WhiteboardToolsDockProps) {
  if (!open) {
    return (
      <Pressable
        accessibilityLabel="Open tools"
        onPress={onOpen}
        className="absolute bottom-3 left-3 z-20 size-12 items-center justify-center rounded-full shadow-lg"
        style={{ backgroundColor: accent }}
      >
        <PenIcon color="#ffffff" size={20} />
      </Pressable>
    );
  }

  return <View className="absolute bottom-3 left-2 right-2 z-20">{children}</View>;
}
