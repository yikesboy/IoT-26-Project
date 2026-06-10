import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

function getUrl(): URL {
  if (import.meta.env.SSR) {
    return new URL("/api/auth", process.env["BASE_URL"] || "http://localhost:3000");
  } else {
    return new URL("/api/auth", import.meta.url);
  }
}

export const authClient = createAuthClient({
  baseURL: getUrl().toString(),
  plugins: [genericOAuthClient()],
});
