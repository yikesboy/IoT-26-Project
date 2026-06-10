import { betterAuth } from "better-auth";
import { PostgresJSDialect } from "kysely-postgres-js";
import sql from "../db";
import { genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export const auth = betterAuth({
  baseURL: process.env["BASE_URL"] || "http://localhost:3000",
  database: {
    dialect: new PostgresJSDialect({
      postgres: sql,
    }),
    type: "postgres",
  },
  secret: process.env["AUTH_SECRET"],
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "default",
          clientId: process.env["AUTH_CLIENT_ID"]!,
          clientSecret: process.env["AUTH_CLIENT_SECRET"],
          discoveryUrl: process.env["AUTH_DISCOVERY_URL"],
          authorizationUrl: process.env["AUTH_AUTHORIZATION_ENDPOINT"],
          tokenUrl: process.env["AUTH_TOKEN_ENDPOINT"],
          userInfoUrl: process.env["AUTH_USERINFO_ENDPOINT"],
          scopes: ["openid", "profile", "email"],
        },
      ],
    }),
    tanstackStartCookies(),
  ],
});
