// Mints a short-lived Google Drive access token for the calling user.
// Runs server-side only — this is the one place CLERK_SECRET_KEY is used.
// The client never sees it.

import { verifyClerkRequest } from "../_shared/clerkAuth.ts";

Deno.serve(async (req: Request) => {
  console.log("[drive-token] request received");

  const auth = await verifyClerkRequest(req, "drive-token");
  if (!auth.ok) return auth.response;
  const clerkUserId = auth.userId;
  console.log(`[drive-token] verified caller: ${clerkUserId}`);

  const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY")!;
  const tokenRes = await fetch(
    `https://api.clerk.com/v1/users/${clerkUserId}/oauth_access_tokens/google`,
    { headers: { Authorization: `Bearer ${clerkSecretKey}` } },
  );
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    console.warn(`[drive-token] Clerk token request failed: ${tokenRes.status}`, body);
    // Don't forward Clerk's raw response body to the client — it's already
    // logged above for debugging; the caller only needs to know it failed.
    return new Response(JSON.stringify({ error: "Failed to reach Google account" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
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
