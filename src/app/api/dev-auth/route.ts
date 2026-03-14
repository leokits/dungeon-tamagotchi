import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const DEV_EMAIL = "dev@dungeon-tamagotchi.local";

/**
 * Dev-only auth bypass.
 * Creates a test user and generates a magic link for instant login.
 * Only works in development (NODE_ENV !== 'production').
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Find or create the dev test user
  const { data: listData } = await supabase.auth.admin.listUsers();
  let testUser = listData?.users?.find((u) => u.email === DEV_EMAIL);

  if (!testUser) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: DEV_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: "Dev Player" },
    });
    if (error || !created.user) {
      return NextResponse.json({ error: error?.message || "Failed to create dev user" }, { status: 500 });
    }
    testUser = created.user;
  }

  // Generate a magic link — the action_link goes to Supabase which verifies and
  // redirects to /auth/handle-hash (a client page that processes the hash tokens)
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: DEV_EMAIL,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/handle-hash`,
    },
  });

  if (linkError || !linkData) {
    return NextResponse.json({ error: linkError?.message || "Failed to generate auth link" }, { status: 500 });
  }

  return NextResponse.json({
    action_link: linkData.properties?.action_link,
    email: DEV_EMAIL,
  });
}
