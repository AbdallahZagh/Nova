import { Image, Text, View } from "react-native";

const textSizes = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs",
  xl: "text-2xl",
} as const;

const boxSizes = {
  xs: "h-6 w-6",
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-[68px] w-[68px]",
} as const;

function getInitials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

export function UserAvatar({
  name,
  avatarUrl,
  initials,
  size = "md",
  className = "",
}: {
  name?: string | null;
  avatarUrl?: string | null;
  initials?: string | null;
  size?: keyof typeof boxSizes;
  className?: string;
}) {
  const label = (initials || getInitials(name)).slice(0, 2);

  return (
    <View
      className={`${boxSizes[size]} items-center justify-center overflow-hidden rounded-full border border-glass bg-accent dark:border-dark-glass dark:bg-dark-accent ${className}`}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          className="h-full w-full"
          resizeMode="cover"
        />
      ) : (
        <Text className={`${textSizes[size]} font-black text-white`}>{label}</Text>
      )}
    </View>
  );
}
