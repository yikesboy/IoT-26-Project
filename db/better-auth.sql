CREATE TABLE "user" (
  "id"            TEXT        NOT NULL,
  "name"          TEXT        NOT NULL,
  "email"         TEXT        NOT NULL,
  "emailVerified" BOOLEAN     NOT NULL,
  "image"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY ("id"),
  UNIQUE ("email")
);

CREATE TABLE "session" (
  "id"        TEXT        NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token"     TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT        NOT NULL,

  PRIMARY KEY ("id"),
  UNIQUE ("token"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id"                    TEXT        NOT NULL,
  "accountId"             TEXT        NOT NULL,
  "providerId"            TEXT        NOT NULL,
  "userId"                TEXT        NOT NULL,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"             TIMESTAMPTZ NOT NULL,

  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "verification" (
  "id"         TEXT        NOT NULL,
  "identifier" TEXT        NOT NULL,
  "value"      TEXT        NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY ("id")
);

CREATE INDEX SESSION_USERID_IDX
ON "session" ("userId");

CREATE INDEX ACCOUNT_USERID_IDX
ON "account" ("userId");

CREATE INDEX VERIFICATION_IDENTIFIER_IDX
ON "verification" ("identifier");
