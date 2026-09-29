import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().min(1, "Business name is required"),
  businessType: z.string().optional(),
  fullName: z.string().optional(),
  acceptTerms: z.literal("yes", { error: "Please agree to the Terms of Service and Privacy Policy to create an account" }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
