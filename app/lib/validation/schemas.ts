import { z } from 'zod';

const ENQUIRY_TYPES = [
  'general',
  'table',
  'private-hire',
  'group',
  'birthday',
  'corporate',
  'other',
] as const;

export const ContactSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name is too long.')
    .transform((v) => v.trim()),

  email: z
    .string()
    .email('Enter a valid email address.')
    .max(254)
    .transform((v) => v.trim().toLowerCase()),

  phone: z
    .string()
    .max(40)
    .default('')
    .transform((v) => v.trim())
    .refine(
      (v) => !v || /^[0-9+()\-\s]{7,40}$/.test(v),
      'Use a valid phone number or leave it blank.',
    ),

  enquiry: z.enum(ENQUIRY_TYPES, {
    errorMap: () => ({ message: 'Choose a valid enquiry type.' }),
  }),

  date: z
    .string()
    .max(10)
    .default('')
    .transform((v) => v.trim())
    .refine(
      (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'Use a valid date (YYYY-MM-DD) or leave it blank.',
    ),

  message: z
    .string()
    .min(10, 'Write a longer message so we can help properly.')
    .max(2000, 'Message is too long.')
    .transform((v) => v.trim()),

  // Honeypot — must be empty
  website: z.string().max(120).default(''),

  turnstileToken: z.string().min(1, 'Captcha token is required.').max(2048),
});

export type ContactInput = z.input<typeof ContactSchema>;
export type ContactData = z.output<typeof ContactSchema>;

export const ValidateEmailSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address.')
    .max(254)
    .transform((v) => v.trim().toLowerCase()),

  turnstileToken: z.string().max(2048).default(''),
});

export type ValidateEmailInput = z.input<typeof ValidateEmailSchema>;
export type ValidateEmailData = z.output<typeof ValidateEmailSchema>;
