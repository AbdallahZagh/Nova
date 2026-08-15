import { Text } from "react-native";
import { findMentionUser, splitMentionText, type MentionUser } from "@/mentions";
import { openUserProfile } from "@/components/UserProfileLink";

export function MentionText({
  content,
  users,
  className,
}: {
  content: string;
  users?: MentionUser[];
  className?: string;
}) {
  return (
    <Text className={className}>
      {splitMentionText(content).map((part, index) => {
        if (!part.mention) {
          return <Text key={`${part.text}-${index}`}>{part.text}</Text>;
        }
        const user = findMentionUser(users, part.text);
        return (
          <Text
            key={`${part.text}-${index}`}
            className="font-black text-accent dark:text-dark-accent"
            onPress={user ? () => openUserProfile(user.id) : undefined}
          >
            {part.text}
          </Text>
        );
      })}
    </Text>
  );
}
