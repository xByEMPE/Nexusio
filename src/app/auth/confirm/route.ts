import { NextResponse, type NextRequest } from "next/server";
import { inspectionsEnabled } from "@/lib/inspections/flag";
import { safeNext } from "@/lib/auth/safe-next";
import { publicOrigin } from "@/lib/http/public-origin";
import { createSessionClient } from "@/services/supabase/server";

/** Enlace de invitación: canjea el token y envía a elegir contraseña. */
export async function GET(request: NextRequest) {
  if (!inspectionsEnabled()) return new NextResponse(null, { status: 404 });
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const next = safeNext(searchParams.get("next"), "/auth/set-password");

  // Detrás del proxy, request.nextUrl.origin es la dirección interna (0.0.0.0:3000): usa el origen público.
  const origin = publicOrigin(request);
  const redirectTo = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  const fail = () => redirectTo(new URL("/admin/login?error=invite", origin));

  if (!tokenHash || searchParams.get("type") !== "invite") return fail();
  const sb = await createSessionClient();
  if (!sb) return fail();
  const { error } = await sb.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
  if (error) return fail();

  // Las cookies de sesión que fija verifyOtp (cookies() de next/headers) las fusiona Next en la respuesta.
  let target = new URL(next, origin);
  if (target.origin !== origin) target = new URL("/auth/set-password", origin);
  return redirectTo(target);
}
