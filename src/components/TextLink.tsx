import { Pressable, Text, type PressableProps } from "react-native";

type TextLinkProps = PressableProps & {
  label: string;
  muted?: boolean;
};

export function TextLink({ label, muted, disabled, ...props }: TextLinkProps) {
  return (
    <Pressable {...props} disabled={disabled} accessibilityRole="button">
      <Text
        className={`text-sm font-bold ${
          muted ? "text-muted dark:text-dark-muted" : "text-accent dark:text-dark-accent"
        } ${disabled ? "opacity-45" : ""}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
