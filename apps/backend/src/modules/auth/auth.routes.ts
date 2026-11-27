import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";
import { ACCESS_TOKEN_LIFETIME_SECONDS } from "../../utils/tokens.js";
import { signupSchema, loginSchema } from "./auth.schema.js";
import { signup, login } from "./auth.service.js";

export const authRouter:Router = Router();

authRouter.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

authRouter.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
}));

// authRouter.use((req, res, next) => {
//   const origin = req.get("origin");
//   if (origin && origin !== env.WEB_ORIGIN) {
//     res.status(403).json({ message: "Origin not allowed" });
//     return;
//   }
//   next();
// });

authRouter.post("/register", async (req, res) => {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: "Invalid signup details",
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const user = await signup(result.data);
  res.status(201).json({ message: "Account created. Please log in.", user });
});

authRouter.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: "Check your email and password",
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const resultData = await login(result.data);
  res.cookie("refreshToken", resultData.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    expires: resultData.expiresAt,
  });
  res.status(200).json({
    message: "Logged in successfully",
    user: resultData.user,
    accessToken: resultData.accessToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
  });
});
