import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export function NotePin({
  pinned = true,
  size = 16,
  color,
}: {
  pinned?: boolean;
  size?: number;
  color: string;
}) {
  return (
    <MaterialCommunityIcons
      name={pinned ? "pin" : "pin-outline"}
      size={size}
      color={color}
    />
  );
}
