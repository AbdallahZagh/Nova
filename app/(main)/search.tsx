import { Text, View } from "react-native";

export default function SearchScreen() {
  return (
    <View className="flex-1 bg-main p-5 dark:bg-dark-main">
      <Text className="text-[26px] font-black text-primary dark:text-dark-primary">Search</Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-muted dark:text-dark-muted">
        Workspace search will connect to the global search API here.
      </Text>
    </View>
  );
}
