import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getApiErrorMessage } from "@/api/apiClient";
import { downloadWhiteboardExportApi } from "@/api/whiteboards";

export type WhiteboardExportFormat = "pdf" | "zip" | "png";

const DOWNLOAD_DIR_KEY = "nova.whiteboard.downloadDir";
const ANDROID_DOWNLOADS_TREE =
  "content://com.android.externalstorage.documents/tree/primary%3ADownload";

function toBase64(data: ArrayBuffer | ArrayBufferView | string) {
  if (typeof data === "string") {
    return data;
  }
  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const chunk = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mimeFor(filename: string, format: WhiteboardExportFormat) {
  if (filename.endsWith(".pdf") || format === "pdf") return "application/pdf";
  if (filename.endsWith(".zip") || format === "zip") return "application/zip";
  return "image/png";
}

async function writeToDirectory(
  FileSystem: typeof import("expo-file-system/legacy"),
  directoryUri: string,
  filename: string,
  mime: string,
  base64: string,
) {
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    filename,
    mime,
  );
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function androidDownloadDirectory(
  FileSystem: typeof import("expo-file-system/legacy"),
  forcePicker = false,
) {
  const stored = forcePicker
    ? null
    : await SecureStore.getItemAsync(DOWNLOAD_DIR_KEY);
  if (stored) return stored;

  const permissions =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
      ANDROID_DOWNLOADS_TREE,
    );
  if (!permissions.granted) {
    throw new Error("Allow access to Downloads to save the file.");
  }
  await SecureStore.setItemAsync(DOWNLOAD_DIR_KEY, permissions.directoryUri);
  return permissions.directoryUri;
}

export async function saveWhiteboardExport(
  id: string,
  format: WhiteboardExportFormat,
  pageIds?: string[],
) {
  const file = await downloadWhiteboardExportApi(id, format, pageIds);
  const FileSystem = await import("expo-file-system/legacy");
  const base64 = toBase64(file.buffer);
  const mime = mimeFor(file.filename, format);

  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    try {
      const directoryUri = await androidDownloadDirectory(FileSystem);
      await writeToDirectory(
        FileSystem,
        directoryUri,
        file.filename,
        mime,
        base64,
      );
      return file.filename;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Allow access to Downloads")) throw error;
      await SecureStore.deleteItemAsync(DOWNLOAD_DIR_KEY);
      const directoryUri = await androidDownloadDirectory(FileSystem, true);
      await writeToDirectory(
        FileSystem,
        directoryUri,
        file.filename,
        mime,
        base64,
      );
      return file.filename;
    }
  }

  const folder =
    `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}Download/`;
  const folderInfo = await FileSystem.getInfoAsync(folder);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  }
  await FileSystem.writeAsStringAsync(`${folder}${file.filename}`, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return file.filename;
}

export function exportErrorMessage(error: unknown) {
  return getApiErrorMessage(error, "Save the selected pages as images first.");
}
