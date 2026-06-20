import { Text, View } from "react-native";

export default function NotificationsScreen() {
  return (
    <View className="flex-1 bg-main p-5 dark:bg-dark-main">
      <Text className="text-[26px] font-black text-primary dark:text-dark-primary">Notifications</Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-muted dark:text-dark-muted">
        Notification history and unread state will appear here.
      </Text>
    </View>
  );
}
