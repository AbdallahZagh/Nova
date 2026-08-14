import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
  type ScrollViewProps,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { getPalette } from "@/theme/colors";

type BottomDrawerProps = PropsWithChildren<{
  visible: boolean;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  closeDisabled?: boolean;
  dragEnabled?: boolean;
  scroll?: boolean;
  maxHeight?: string | number;
  keyboardMaxHeight?: string | number;
  minHeight?: string | number;
  contentClassName?: string;
  contentContainerClassName?: string;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  scrollViewProps?: Omit<
    ScrollViewProps,
    "children" | "contentContainerClassName" | "contentContainerStyle"
  >;
  onClose: () => void;
}>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function BottomDrawer({
  visible,
  title,
  subtitle,
  footer,
  closeDisabled,
  dragEnabled = true,
  scroll = true,
  maxHeight = "88%",
  keyboardMaxHeight = "74%",
  minHeight = "34%",
  contentClassName = "",
  contentContainerClassName = "gap-5 px-5 pb-5",
  contentContainerStyle,
  scrollViewProps,
  onClose,
  children,
}: BottomDrawerProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [windowHeight, setWindowHeight] = useState(
    Dimensions.get("window").height,
  );
  const [drawerHeight, setDrawerHeight] = useState<number | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [userResized, setUserResized] = useState(false);
  const gestureStartHeight = useRef(0);
  const activeHeightRef = useRef(0);
  const minimumHeightRef = useRef(0);
  const normalHeightRef = useRef(0);
  const maximumHeightRef = useRef(0);
  const closeDisabledRef = useRef(Boolean(closeDisabled));
  const dragEnabledRef = useRef(dragEnabled);
  const closeRef = useRef(onClose);

  const resolveHeight = useCallback(
    (value: string | number, fallbackRatio: number) => {
      if (typeof value === "number") return value;
      if (value.endsWith("%")) {
        const ratio = Number(value.replace("%", "")) / 100;
        return Number.isFinite(ratio)
          ? windowHeight * ratio
          : windowHeight * fallbackRatio;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : windowHeight * fallbackRatio;
    },
    [windowHeight],
  );

  const topGap = Math.max(insets.top, 12) + 8;
  const screenHeight = Dimensions.get("screen").height;
  const windowAlreadyResized = windowHeight < screenHeight - 80;
  const keyboardInset = windowAlreadyResized ? 0 : keyboardHeight;
  const availableHeight = Math.max(180, windowHeight - keyboardInset - topGap);
  const minimumHeight = Math.min(resolveHeight(minHeight, 0.34), availableHeight);
  const normalHeight = Math.min(resolveHeight(maxHeight, 0.88), availableHeight);
  const maximumHeight = Math.min(
    resolveHeight(
      keyboardHeight > 0 ? keyboardMaxHeight : "96%",
      keyboardHeight > 0 ? 0.74 : 0.96,
    ),
    availableHeight,
  );
  const chromeHeight = 52 + (title ? 64 : 0) + (footer ? 72 : 0);
  const fitHeight =
    contentHeight > 0
      ? clamp(contentHeight + chromeHeight, minimumHeight, normalHeight)
      : normalHeight;
  const activeHeight = clamp(
    drawerHeight ?? fitHeight,
    minimumHeight,
    maximumHeight,
  );

  useEffect(() => {
    activeHeightRef.current = activeHeight;
    minimumHeightRef.current = minimumHeight;
    normalHeightRef.current = normalHeight;
    maximumHeightRef.current = maximumHeight;
    closeDisabledRef.current = Boolean(closeDisabled);
    dragEnabledRef.current = dragEnabled;
    closeRef.current = onClose;
  }, [
    activeHeight,
    closeDisabled,
    dragEnabled,
    maximumHeight,
    minimumHeight,
    normalHeight,
    onClose,
  ]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      setDrawerHeight(null);
      setContentHeight(0);
      setUserResized(false);
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setWindowHeight(window.height);
      setDrawerHeight(null);
      setUserResized(false);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (visible && !userResized) {
      setDrawerHeight(fitHeight);
    }
  }, [fitHeight, userResized, visible]);

  useEffect(() => {
    if (!visible || drawerHeight === null) return;
    setDrawerHeight((height) =>
      height === null ? height : clamp(height, minimumHeight, maximumHeight),
    );
  }, [drawerHeight, maximumHeight, minimumHeight, visible]);

  const close = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => dragEnabledRef.current,
        onStartShouldSetPanResponderCapture: () => dragEnabledRef.current,
        onPanResponderGrant: () => {
          gestureStartHeight.current = activeHeightRef.current;
        },
        onMoveShouldSetPanResponder: (_, gesture) =>
          dragEnabledRef.current &&
          Math.abs(gesture.dy) > 3 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          dragEnabledRef.current &&
          Math.abs(gesture.dy) > 3 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (!dragEnabledRef.current) return;
          setUserResized(true);
          const nextHeight = gestureStartHeight.current - gesture.dy;
          setDrawerHeight(clamp(nextHeight, 0, maximumHeightRef.current));
        },
        onPanResponderRelease: (_, gesture) => {
          if (!dragEnabledRef.current) return;

          if (Math.abs(gesture.dy) < 8) {
            setUserResized(true);
            setDrawerHeight((height) => {
              const current = height ?? normalHeightRef.current;
              return current >
                (normalHeightRef.current + maximumHeightRef.current) / 2
                ? normalHeightRef.current
                : maximumHeightRef.current;
            });
            return;
          }

          const finalHeight = gestureStartHeight.current - gesture.dy;
          setUserResized(true);
          if (
            finalHeight < minimumHeightRef.current * 0.72 &&
            !closeDisabledRef.current
          ) {
            closeRef.current();
            return;
          }

          setDrawerHeight(
            clamp(
              finalHeight,
              minimumHeightRef.current,
              maximumHeightRef.current,
            ),
          );
        },
      }),
    [],
  );

  const header = title ? (
    <View className="flex-row items-start justify-between gap-4 px-5 pb-2">
      <View className="flex-1">
        <Text className="text-[22px] font-black text-primary dark:text-dark-primary">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        disabled={closeDisabled}
        onPress={close}
        className="h-10 w-10 items-center justify-center rounded-full bg-glass-button active:opacity-75 disabled:opacity-50 dark:bg-dark-glass-button"
      >
        <Ionicons name="close-outline" size={22} color={palette.muted} />
      </Pressable>
    </View>
  ) : null;

  const bottomPad = keyboardInset > 0 ? 12 : Math.max(insets.bottom, 12);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 justify-end bg-black/45">
        <TouchableWithoutFeedback onPress={close}>
          <View className="flex-1" />
        </TouchableWithoutFeedback>
        <View
          className={`rounded-t-[28px] border border-glass bg-sidebar shadow-2xl shadow-black/40 dark:border-dark-glass dark:bg-dark-sidebar ${contentClassName}`}
          style={{ height: activeHeight, marginBottom: keyboardInset }}
        >
          <View
            className="items-center px-8 pt-3"
            {...(dragEnabled ? panResponder.panHandlers : {})}
          >
            <View
              accessibilityRole="adjustable"
              accessibilityLabel="Resize drawer"
              className="h-7 w-full items-center justify-center"
            >
              <View className="h-1.5 w-12 rounded-full bg-glass dark:bg-dark-glass" />
            </View>
          </View>
          {header}
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              {...scrollViewProps}
              style={{ flex: 1 }}
              onContentSizeChange={(width, height) => {
                setContentHeight(height);
                scrollViewProps?.onContentSizeChange?.(width, height);
              }}
              contentContainerClassName={contentContainerClassName}
              contentContainerStyle={contentContainerStyle}
            >
              {children}
            </ScrollView>
          ) : (
            <View
              className={contentContainerClassName}
              style={{ flex: 1 }}
              onLayout={(event) => {
                setContentHeight(event.nativeEvent.layout.height);
              }}
            >
              {children}
            </View>
          )}
          {footer ? (
            <View className="px-5 pt-2" style={{ paddingBottom: bottomPad }}>
              {footer}
            </View>
          ) : (
            <View style={{ height: bottomPad }} />
          )}
        </View>
      </View>
    </Modal>
  );
}
