import { Text } from "react-native";
import { splitMentionText } from "@/mentions";

export function MentionText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <Text className={className}>
      {splitMentionText(content).map((part, index) =>
        part.mention ? (
          <Text
            key={`${part.text}-${index}`}
            className="font-black text-accent dark:text-dark-accent"
          >
            {part.text}
          </Text>
        ) : (
          <Text key={`${part.text}-${index}`}>{part.text}</Text>
        ),
      )}
    </Text>
  );
}
