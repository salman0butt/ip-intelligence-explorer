import { z } from "zod";

const runtimeSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
});

const originSchema = z.string().transform((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported origin protocol.");
    }
    return url.origin;
  } catch {
    context.addIssue({
      code: "custom",
      message: "ALLOWED_ORIGINS contains an invalid HTTP(S) origin.",
    });
    return z.NEVER;
  }
});

export function getRuntimeEnvironment(): {
  port: number;
  allowedOrigins: readonly string[];
} {
  const parsed = runtimeSchema.parse({
    PORT: process.env.PORT,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  });
  const values = parsed.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    port: parsed.PORT,
    allowedOrigins: z.array(originSchema).parse(values),
  };
}
