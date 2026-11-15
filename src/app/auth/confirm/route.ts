import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createSessionClient } from "@/services/supabase/server";

/** Enlace de invitación: canjea el token y envía a elegir contraseña. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const next = safeNext(searchParams.get("next"), "/auth/set-password");

  const fail = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "?error=invite";
    return NextResponse.redirect(url);
  };

  if (!tokenHash || searchParams.get("type") !== "invite") return fail();
  const sb = await createSessionClient();
  if (!sb) return fail();
  const { error } = await sb.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
  if (error) return fail();

  const target = new URL(next, request.nextUrl.origin);
  const res = NextResponse.redirect(target);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
