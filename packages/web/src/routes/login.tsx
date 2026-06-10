import { authClient } from "@/lib/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    void authClient.signIn.oauth2({
      providerId: "default",
      callbackURL: "/",
    });
  }, []);

  return <></>;
}
