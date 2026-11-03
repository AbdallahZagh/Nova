import { Suspense } from "react";
import { ConnectConsent } from "./connect-consent";

export const metadata = {
  title: "Connect an agent — Nova",
};

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectConsent />
    </Suspense>
  );
}
