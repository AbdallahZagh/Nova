import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { usePathname } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import { createSupportTicketApi } from "@/api/system";
import { BottomDrawer } from "@/components/BottomDrawer";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SelectField } from "@/components/SelectField";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

type ReportProblemModalProps = {
  visible: boolean;
  onClose: () => void;
};

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function ReportProblemModal({ visible, onClose }: ReportProblemModalProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const pathname = usePathname();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [file, setFile] = useState<{ uri: string; name: string; type: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setBody("");
    setPriority("NORMAL");
    setFile(null);
  }, [visible]);

  const pickScreenshot = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showSnackbar({
        variant: "error",
        title: "Permission needed",
        message: "Allow photo access to attach a screenshot.",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      name: asset.fileName ?? "screenshot.jpg",
      type: asset.mimeType ?? "image/jpeg",
    });
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      showSnackbar({
        variant: "error",
        title: "Details required",
        message: "Add a title and description.",
      });
      return;
    }
    setLoading(true);
    try {
      await createSupportTicketApi({
        title: title.trim(),
        body: body.trim(),
        category: "BUG",
        priority,
        route: pathname,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version,
        file: file ?? undefined,
      });
      showSnackbar({
        variant: "success",
        title: "Report sent",
        message: "Thanks — we’ll look into it.",
      });
      onClose();
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not send report",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomDrawer
      visible={visible}
      title="Report a problem"
      subtitle="Send details and an optional screenshot to Super Admins."
      closeDisabled={loading}
      minHeight="52%"
      maxHeight="90%"
      contentContainerClassName="gap-5 px-5 pb-6"
      onClose={onClose}
      footer={
        <PrimaryButton
          label="Send report"
          loading={loading}
          disabled={loading}
          onPress={() => void submit()}
        />
      }
    >
      <FormField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="What’s going wrong?"
        editable={!loading}
      />
      <FormField
        label="Details"
        value={body}
        onChangeText={setBody}
        placeholder="What happened, and what did you expect?"
        multiline
        textAlignVertical="top"
        className="min-h-[120px]"
        editable={!loading}
      />
      <SelectField
        label="Priority"
        value={priority}
        options={PRIORITY_OPTIONS}
        onChange={setPriority}
        title="Priority"
        subtitle="Urgent reports notify Super Admins immediately."
        disabled={loading}
      />
      <View className="gap-[7px]">
        <Text className="text-[13px] font-bold text-muted dark:text-dark-muted">
          Screenshot
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach screenshot"
          disabled={loading}
          onPress={() => void pickScreenshot()}
          className="min-h-[50px] flex-row items-center gap-3 rounded-nova border border-glass bg-glass-button px-3.5 py-3 active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-button"
        >
          <Ionicons name="image-outline" size={18} color={palette.accent} />
          <Text
            numberOfLines={1}
            className={`flex-1 text-[15px] font-black ${
              file
                ? "text-primary dark:text-dark-primary"
                : "text-muted dark:text-dark-muted"
            }`}
          >
            {file ? file.name : "Attach a screenshot"}
          </Text>
          <Ionicons
            name={file ? "checkmark-circle" : "add-outline"}
            size={18}
            color={file ? palette.accent : palette.muted}
          />
        </Pressable>
      </View>
    </BottomDrawer>
  );
}
