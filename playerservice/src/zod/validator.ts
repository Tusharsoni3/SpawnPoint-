import { z, ZodSchema } from "zod";
import StatusCodes from "http-status-codes";
import type { Response, Request, NextFunction } from "express";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Invalid email").nonempty("Email is required"),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .refine((val) => /[A-Z]/.test(val), {
      message: "Needs one uppercase letter",
    })
    .refine((val) => /[a-z]/.test(val), {
      message: "Needs one lowercase letter",
    })
    .refine((val) => /[0-9]/.test(val), { message: "Needs one number" })
    .refine((val) => /[^A-Za-z0-9]/.test(val), {
      message: "Needs one special character",
    }),
});

export const loginSchema = z.object({
  email: z.email("Invalid email").nonempty("Email is required"),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .refine((val) => /[A-Z]/.test(val), {
      message: "Needs one uppercase letter",
    })
    .refine((val) => /[a-z]/.test(val), {
      message: "Needs one lowercase letter",
    })
    .refine((val) => /[0-9]/.test(val), { message: "Needs one number" })
    .refine((val) => /[^A-Za-z0-9]/.test(val), {
      message: "Needs one special character",
    }),
});

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(StatusCodes.CONFLICT).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    req.body = parsed.data;
    next();
  };
}

export const validateSignUp = validateBody(registerSchema);
export const validateLogin = validateBody(loginSchema);
