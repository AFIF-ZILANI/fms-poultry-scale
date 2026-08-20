// Mints a short-lived Google Drive access token for the calling user.
// Runs server-side only — this is the one place CLERK_SECRET_KEY is used.
// The client never sees it.

Deno.serve(async (req: Request) => {
  console.log("[drive-token] request received");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("[drive-token] rejected: missing Authorization header");
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify the caller via the existing Clerk<->Supabase third-party auth
  // integration: forward the caller's JWT to Supabase's own auth endpoint
  // and let it tell us who's making this request. This avoids re-verifying
  // the JWT signature by hand — Supabase already knows how to do this
  // because of the existing Clerk integration.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) {
    const body = await userRes.text().catch(() => "");
    console.warn(`[drive-token] rejected: /auth/v1/user returned ${userRes.status}`, body);
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { id: clerkUserId } = (await userRes.json()) as { id: string };
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
