import { z } from 'zod';

/** Request/response shapes shared by the mobile app and the API. */

export const centsSchema = z.number().int().safe();
export const positiveCentsSchema = centsSchema.positive();
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 currency code, e.g. USD');
export const idSchema = z.string().min(1);

export const splitInputSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('equal'), participants: z.array(idSchema).min(1) }),
  z.object({
    method: z.literal('exact'),
    shares: z.array(z.object({ userId: idSchema, amount: centsSchema.nonnegative() })).min(1),
  }),
  z.object({
    method: z.literal('percentage'),
    shares: z
      .array(z.object({ userId: idSchema, basisPoints: z.number().int().min(0).max(10_000) }))
      .min(1),
  }),
  z.object({
    method: z.literal('shares'),
    shares: z.array(z.object({ userId: idSchema, units: z.number().int().nonnegative() })).min(1),
  }),
  z.object({
    method: z.literal('items'),
    items: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          amount: positiveCentsSchema,
          userIds: z.array(idSchema).min(1),
        }),
      )
      .min(1),
  }),
]);

export const createExpenseSchema = z.object({
  groupId: idSchema,
  description: z.string().trim().min(1).max(120),
  amount: positiveCentsSchema,
  payerId: idSchema,
  date: z.iso.datetime(),
  split: splitInputSchema,
  notes: z.string().max(1000).optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  currency: currencySchema,
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const createSettlementSchema = z.object({
  groupId: idSchema,
  fromUserId: idSchema,
  toUserId: idSchema,
  amount: positiveCentsSchema,
  date: z.iso.datetime(),
  note: z.string().max(280).optional(),
});
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(60),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
