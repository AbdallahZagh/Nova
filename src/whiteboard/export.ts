import { Platform } from "react-native";
import { getApiErrorMessage } from "@/api/apiClient";
import { downloadWhiteboardExportApi } from "@/api/whiteboards";

export type WhiteboardExportFormat = "pdf" | "zip" | "png";

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

function mimeFor(format: WhiteboardExportFormat) {
  if (format === "pdf") return "application/pdf";
  if (format === "zip") return "application/zip";
  return "image/png";
}

export async function saveWhiteboardExport(
  id: string,
  format: WhiteboardExportFormat,
  pageId?: string,
) {
  const file = await downloadWhiteboardExportApi(id, format, pageId);
  const FileSystem = await import("expo-file-system/legacy");
  const base64 = toBase64(file.buffer);

  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted) {
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        file.filename,
        mimeFor(format),
      );
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return file.filename;
    }
  }

  const path = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}${file.filename}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return file.filename;
}

export function exportErrorMessage(error: unknown) {
  return getApiErrorMessage(error, "Save the board as images first.");
}
