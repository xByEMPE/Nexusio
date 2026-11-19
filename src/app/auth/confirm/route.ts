import { NextResponse, type NextRequest } from "next/server";
import { resolveLoginDestination } from "@/app/admin/login/actions";
import { inspectionsEnabled } from "@/lib/inspections/flag";
import { safeNext } from "@/lib/auth/safe-next";
import { publicOrigin } from "@/lib/http/public-origin";
import { createSessionClient } from "@/services/supabase/server";

const RECOVER_DEFAULT = "/auth/set-password?modo=recuperar";

/**
 * Enlaces de correo de Supabase (invitación y recuperación de contraseña): canjea el token de un solo
 * uso y envía a elegir contraseña. Cualquier otro `type` se rechaza.
 */
export async function GET(request: NextRequest) {
  if (!inspectionsEnabled()) return new NextResponse(null, { status: 404 });
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const isRecovery = type === "recovery";
  const defaultNext = isRecovery ? RECOVER_DEFAULT : "/auth/set-password";
  const next = safeNext(searchParams.get("next"), defaultNext);

  // Detrás del proxy, request.nextUrl.origin es la dirección interna (0.0.0.0:3000): usa el origen público.
  const origin = publicOrigin(request);
  const redirectTo = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  const fail = () => redirectTo(new URL(`/admin/login?error=${isRecovery ? "recovery" : "invite"}`, origin));

  if (!tokenHash || (type !== "invite" && type !== "recovery")) return fail();
  const sb = await createSessionClient();
  if (!sb) return fail();
  const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();

  // Cuenta sin acceso (perfil inactivo, sin rol ni membresía): resolveLoginDestination cierra la sesión recién abierta.
  const dest = await resolveLoginDestination();
  if ("error" in dest) return redirectTo(new URL("/admin/login?error=forbidden", origin));

  // Las cookies de sesión que fija verifyOtp (cookies() de next/headers) las fusiona Next en la respuesta.
  let target = new URL(next, origin);
  if (target.origin !== origin) target = new URL(defaultNext, origin);
  return redirectTo(target);
}
