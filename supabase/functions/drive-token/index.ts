// Mints a short-lived Google Drive access token for the calling user.
// Runs server-side only — this is the one place CLERK_SECRET_KEY is used.
// The client never sees it.

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

// The caller's session JWT is verified directly against Clerk's own public
// keys — NOT via Supabase's /auth/v1/user. That endpoint looks up a row in
// Supabase's own auth.users table, which Clerk-authenticated users never
// have under third-party auth, and independently, Supabase's platform-level
// JWT handling has a documented incompatibility with Clerk's RS256 tokens
// ("signing method RS256 is invalid"). Verifying against Clerk's JWKS
// sidesteps both: it only depends on Clerk, which issued the token.
//
// Clerk's JWKS lives at https://<frontend-api-domain>/.well-known/jwks.json.
// The publishable key encodes that domain (base64 after the pk_test_/
// pk_live_ prefix, trailing "$" stripped) — it is not a secret, the same
// value already ships in the client bundle as
// EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Keep this constant in sync with that
// value if the Clerk instance ever changes.
const CLERK_PUBLISHABLE_KEY = "pk_test_dW5pcXVlLW1hcm1vc2V0LTEwLmNsZXJrLmFjY291bnRzLmRldiQ";

function clerkJwksUrl(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  const domain = atob(encoded).replace(/\$$/, "");
  return `https://${domain}/.well-known/jwks.json`;
}

// Created once per warm instance — createRemoteJWKSet caches the fetched
// keys internally, so this does not refetch on every request.
const clerkJwks = createRemoteJWKSet(new URL(clerkJwksUrl(CLERK_PUBLISHABLE_KEY)));

Deno.serve(async (req: Request) => {
  console.log("[drive-token] request received");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[drive-token] rejected: missing or malformed Authorization header");
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sessionToken = authHeader.slice("Bearer ".length);

  let clerkUserId: string;
  try {
    const { payload } = await jwtVerify(sessionToken, clerkJwks);
    if (typeof payload.sub !== "string") {
      throw new Error("token has no sub claim");
    }
    clerkUserId = payload.sub;
  } catch (err) {
    console.warn("[drive-token] rejected: Clerk JWT verification failed", err);
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  console.log(`[drive-token] verified caller: ${clerkUserId}`);

  const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY")!;
  const tokenRes = await fetch(
    `https://api.clerk.com/v1/users/${clerkUserId}/oauth_access_tokens/google`,
    { headers: { Authorization: `Bearer ${clerkSecretKey}` } },
  );
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    console.warn(`[drive-token] Clerk token request failed: ${tokenRes.status}`, body);
    return new Response(
      JSON.stringify({ error: `Clerk token request failed: ${tokenRes.status} ${body}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  const tokens = (await tokenRes.json()) as { token: string }[];
  const accessToken = tokens[0]?.token;
  if (!accessToken) {
    console.warn(`[drive-token] no Google token for ${clerkUserId} — not connected, or missing drive.appdata scope`);
    return new Response(
      JSON.stringify({ error: "No Google account connected, or it lacks the drive.appdata scope" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[drive-token] returning access token for ${clerkUserId}`);
  return new Response(JSON.stringify({ accessToken }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
