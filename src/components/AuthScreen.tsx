import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AuthScreenProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

export function AuthScreen({
  eyebrow,
  title,
  subtitle,
  footer,
  children,
}: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      className="flex-1 bg-main dark:bg-dark-main"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-5"
        contentContainerStyle={{
          paddingTop: insets.top + 26,
          paddingBottom: insets.bottom + (keyboardVisible ? 220 : 28),
        }}
      >
        <View className={keyboardVisible ? "flex-1 justify-start" : "flex-1 justify-center"}>
          <View className="mb-8 items-center">
            <Image
              source={require("../../assets/images/icon.png")}
              resizeMode="contain"
              className="h-[78px] w-[78px]"
            />
            <Text className="mt-3 text-[31px] font-black text-primary dark:text-dark-primary">
              Nova
            </Text>
            <Text className="-mt-0.5 text-[11px] font-bold uppercase tracking-[3px] text-accent dark:text-dark-accent">
              Taskflow
            </Text>
          </View>

          <View className="mb-5">
            <Text className="text-xs font-black uppercase tracking-[2px] text-accent dark:text-dark-accent">
              {eyebrow}
            </Text>
            <Text className="mt-2 text-[30px] font-black leading-[35px] text-primary dark:text-dark-primary">
              {title}
            </Text>
            <Text className="mt-2 text-sm leading-[21px] text-muted dark:text-dark-muted">
              {subtitle}
            </Text>
          </View>

          <View className="w-full max-w-[520px] self-center rounded-[24px] border border-glass bg-sidebar p-5 shadow-lg shadow-black/10 dark:border-dark-glass dark:bg-dark-sidebar dark:shadow-black/30">
            {children}
            {footer ? (
              <View className="mt-[22px] w-full items-center justify-center border-t border-glass pt-[18px] dark:border-dark-glass">
                {footer}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
