import { z } from 'zod';

export const nativeQualificationResultSchema = z
  .object({
    phase: z.enum(['create', 'resume', 'foreground']),
    platform: z.enum(['android', 'ios']),
    ok: z.boolean(),
    provider: z
      .enum(['android-keystore', 'ios-keychain-this-device-only'])
      .optional(),
    hardwareBacked: z.boolean().nullable().optional(),
    elapsedMs: z.number().nonnegative(),
    userAgent: z.string().max(1000),
    error: z.string().max(1000).optional(),
  })
  .strict();
export type NativeQualificationResult = z.infer<
  typeof nativeQualificationResultSchema
>;
