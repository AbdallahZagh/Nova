import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { Platform } from "react-native";

const FORBIDDEN_HEADERS = new Set([
  "user-agent",
  "content-length",
  "origin",
  "referer",
  "connection",
  "host",
  "accept-encoding",
]);

const MAX_ATTEMPTS = 3;
const RETRY_WAIT_MS = [0, 400, 1200];

function requestUrl(config: InternalAxiosRequestConfig) {
  const uri = axios.getUri(config);
  if (/^https?:\/\//i.test(uri)) return uri;
  const base = String(config.baseURL ?? "").replace(/\/$/, "");
  const path = uri.startsWith("/") ? uri : `/${uri}`;
  return `${base}${path}`;
}

function requestHeaders(config: InternalAxiosRequestConfig, method: string) {
  const headers: Record<string, string> = {};
  const raw =
    config.headers && typeof config.headers.toJSON === "function"
      ? config.headers.toJSON()
      : (config.headers as Record<string, unknown> | undefined);

  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value == null) continue;
    const name = key.toLowerCase();
    if (FORBIDDEN_HEADERS.has(name)) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  if (method === "GET" || method === "HEAD") {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  return headers;
}

function requestBody(
  config: InternalAxiosRequestConfig,
  headers: Record<string, string>,
  method: string,
) {
  if (method === "GET" || method === "HEAD" || config.data == null || config.data === "") {
    delete headers["Content-Type"];
    delete headers["content-type"];
    return null;
  }

  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
    return config.data;
  }

  if (typeof config.data === "string") return config.data;
  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  return JSON.stringify(config.data);
}

function parseXhrHeaders(raw: string) {
  const headers: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function parseBody(text: string, contentType: string) {
  if (!text) return null;
  if (contentType.includes("application/json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

type TransportResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network|timeout|abort/i.test(message);
}

function xhrRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: XMLHttpRequestBodyInit | null,
  timeout: number,
  responseType: XMLHttpRequestResponseType,
) {
  return new Promise<TransportResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeout;
    xhr.responseType = responseType === "arraybuffer" ? "arraybuffer" : "text";

    for (const [key, value] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        // Native stacks reject forbidden headers such as User-Agent.
      }
    }

    xhr.onload = () => {
      if (xhr.status === 0) {
        reject(new Error("Network Error"));
        return;
      }
      const responseHeaders = parseXhrHeaders(xhr.getAllResponseHeaders());
      const data =
        xhr.responseType === "arraybuffer"
          ? xhr.response
          : parseBody(String(xhr.responseText ?? ""), responseHeaders["content-type"] ?? "");
      resolve({
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders,
        data,
      });
    };
    xhr.onerror = () => reject(new Error("Network Error"));
    xhr.ontimeout = () => reject(new Error(`timeout of ${timeout}ms exceeded`));
    xhr.onabort = () => reject(new Error("Network Error"));
    xhr.send(body);
  });
}

export const expoFetchAdapter: AxiosAdapter = async (config) => {
  const url = requestUrl(config);
  if (!/^https?:\/\//i.test(url)) {
    throw new AxiosError(
      `Invalid API URL: ${url || "(empty)"}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
    );
  }

  const method = (config.method ?? "get").toUpperCase();
  const headers = requestHeaders(config, method);
  const body = requestBody(config, headers, method);
  const timeout = config.timeout && config.timeout > 0 ? config.timeout : 30_000;
  const responseType = config.responseType === "arraybuffer" ? "arraybuffer" : "text";

  if (__DEV__) {
    console.log(`[Nova API] ${method} ${url}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const delay = RETRY_WAIT_MS[attempt] ?? 1200;
    if (delay) await wait(delay);
    try {
      const response = await xhrRequest(
        url,
        method,
        headers,
        body,
        timeout,
        responseType,
      );

      const axiosResponse = {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config,
        request: { url },
      } as AxiosResponse;

      if (__DEV__) {
        console.log(`[Nova API] ${method} ${url} -> ${response.status}`);
      }

      if (response.status >= 200 && response.status < 300) {
        return axiosResponse;
      }

      throw new AxiosError(
        `Request failed with status code ${response.status}`,
        response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        axiosResponse.request,
        axiosResponse,
      );
    } catch (error) {
      lastError = error;
      if (error instanceof AxiosError) throw error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) break;
      if (__DEV__) {
        console.log(
          `[Nova API] ${method} ${url} retry ${attempt + 1}/${MAX_ATTEMPTS - 1} after ${error instanceof Error ? error.message : "error"}`,
        );
      }
    }
  }

  if (lastError instanceof AxiosError) throw lastError;
  const message = lastError instanceof Error ? lastError.message : "Network Error";
  if (__DEV__) {
    console.log(`[Nova API] ${method} ${url} failed: ${message} (${Platform.OS})`);
  }
  const aborted = /abort|timeout/i.test(message);
  throw new AxiosError(
    message,
    aborted ? AxiosError.ECONNABORTED : AxiosError.ERR_NETWORK,
    config,
  );
};
