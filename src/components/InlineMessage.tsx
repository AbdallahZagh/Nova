import { Text, View } from "react-native";

type InlineMessageProps = {
  message?: string;
  variant?: "error" | "success" | "info";
};

export function InlineMessage({
  message,
  variant = "error",
}: InlineMessageProps) {
  if (!message) return null;

  const containerTone =
    variant === "success"
      ? "border-success bg-success/10 dark:border-dark-success dark:bg-dark-success/10"
      : variant === "info"
        ? "border-accent bg-accent/10 dark:border-dark-accent dark:bg-dark-accent/10"
        : "border-danger bg-danger/10 dark:border-dark-danger dark:bg-dark-danger/10";
  const textTone =
    variant === "success"
      ? "text-success dark:text-dark-success"
      : variant === "info"
        ? "text-accent dark:text-dark-accent"
        : "text-danger dark:text-dark-danger";

  return (
    <View className={`rounded-nova border px-3 py-2.5 ${containerTone}`}>
      <Text className={`text-[13px] leading-[18px] ${textTone}`}>{message}</Text>
    </View>
  );
}
