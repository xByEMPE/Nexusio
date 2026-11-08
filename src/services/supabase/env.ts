import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const ServerEnvSchema = PublicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/** Variables públicas; null si Supabase no está configurado. */
export function readPublicEnv(): PublicEnv | null {
  const parsed = PublicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

/** Variables de servidor (incluye la clave secreta). Nunca llamar desde el cliente. */
export function readServerEnv(): ServerEnv | null {
  if (typeof window !== "undefined") {
    throw new Error("readServerEnv() no puede ejecutarse en el navegador.");
  }
  const parsed = ServerEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return parsed.success ? parsed.data : null;
}
