import { create } from "zustand";

export type SnackbarVariant = "success" | "error" | "info" | "warning";

type SnackbarState = {
  visible: boolean;
  title: string;
  message: string;
  variant: SnackbarVariant;
  showSnackbar: (payload: {
    title: string;
    message?: string;
    variant?: SnackbarVariant;
  }) => void;
  hideSnackbar: () => void;
};

export const useSnackbarStore = create<SnackbarState>((set) => ({
  visible: false,
  title: "",
  message: "",
  variant: "info",
  showSnackbar: ({ title, message = "", variant = "info" }) =>
    set({ visible: true, title, message, variant }),
  hideSnackbar: () => set({ visible: false }),
}));
