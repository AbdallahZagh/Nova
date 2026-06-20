import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/useAuthStore";

export default function IndexRoute() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  return <Redirect href={accessToken && user ? "/(main)" : "/(auth)/login"} />;
}

