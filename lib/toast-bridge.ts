export type ToastBridgeOpts = {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
};

type ToastHandler = (opts: ToastBridgeOpts) => void;

let toastHandler: ToastHandler | null = null;

export function setToastHandler(handler: ToastHandler | null) {
  toastHandler = handler;
}

export function showToast(opts: ToastBridgeOpts) {
  toastHandler?.(opts);
}
