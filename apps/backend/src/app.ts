import { env } from "./config/env.js";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./modules/auth/auth.routes.js";
import { AuthError } from "./modules/auth/auth.service.js";
import { requireAuth } from "./middleware/auth.middleware.js";

export const app: Express = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use("/api/auth", authRouter);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ userId: req.auth!.userId });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (error instanceof AuthError) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? error.status
    : undefined;

  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ message: "Invalid request" });
    return;
  }

  // Never return database errors or log credentials/request bodies.
  console.error("Request failed", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({ message: "Something went wrong" });
};

app.use(errorHandler);
