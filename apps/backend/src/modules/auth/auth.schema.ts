import { z } from "zod";

const emailInput = z.string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .max(254, "Email address is too long");

// Preserve passwords exactly; enforce bcrypt's input limit without truncating.
const passwordInput = z.string().min(1, "Password is required").refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password is too long. Please choose a shorter password",
);

export const signupSchema = z.object({
  email: emailInput,
  username: z.string().trim().toLowerCase()
    .min(3, "Username must contain at least 3 characters")
    .max(30, "Username must contain at most 30 characters").regex(
    /^[a-z0-9_]+$/,
    "Username can contain letters, numbers, and underscores",
  ),
  password: passwordInput.refine(
    (value) => Array.from(value).length >= 8,
    "Password must contain at least 8 characters",
  ),
});

export const loginSchema = z.object({
  email: emailInput,
  password: passwordInput,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
