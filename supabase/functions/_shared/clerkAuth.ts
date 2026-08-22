// Shared by every Edge Function that verifies a caller's Clerk session JWT
// directly against Clerk's own JWKS, rather than via Supabase's
// /auth/v1/user — that endpoint looks up Supabase's own auth.users table,
// which Clerk-authenticated users never have a row in under third-party
// auth, and Supabase's platform-level JWT handling has a documented
// incompatibility with Clerk's RS256 tokens ("signing method RS256 is
// invalid"). Verifying against Clerk's JWKS sidesteps both.
//
// Lives under _shared/ so each importing function still bundles and
// cold-starts independently (Supabase's standard pattern for code shared
// across functions) — this only removes the risk of the two call sites'
// verification logic silently drifting apart, not the independent deploys.

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

// Not a secret — the same value already ships in the client bundle as
// EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Keep in sync if the Clerk instance
// ever changes.
const CLERK_PUBLISHABLE_KEY = "pk_test_dW5pcXVlLW1hcm1vc2V0LTEwLmNsZXJrLmFjY291bnRzLmRldiQ";

function clerkJwksUrl(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  const domain = atob(encoded).replace(/\$$/, "");
  return `https://${domain}/.well-known/jwks.json`;
}

// Created once per warm instance — createRemoteJWKSet caches the fetched
// keys internally, so this does not refetch on every request.
const clerkJwks = createRemoteJWKSet(new URL(clerkJwksUrl(CLERK_PUBLISHABLE_KEY)));

export type ClerkAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Verifies the Authorization header of `req` and returns the Clerk user id
// on success, or a ready-to-return 401 Response on failure.
export async function verifyClerkRequest(req: Request, logTag: string): Promise<ClerkAuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn(`[${logTag}] rejected: missing or malformed Authorization header`);
    return { ok: false, response: jsonResponse({ error: "Missing Authorization header" }, 401) };
  }
  const sessionToken = authHeader.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(sessionToken, clerkJwks);
    if (typeof payload.sub !== "string") {
      throw new Error("token has no sub claim");
    }
    return { ok: true, userId: payload.sub };
  } catch (err) {
    console.warn(`[${logTag}] rejected: Clerk JWT verification failed`, err instanceof Error ? err.message : err);
    return { ok: false, response: jsonResponse({ error: "Invalid session" }, 401) };
  }
}
