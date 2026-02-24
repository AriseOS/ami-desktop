/**
 * Auth Routes — proxy auth requests to Cloud Backend.
 *
 * POST /api/v1/auth/register     → Cloud Backend
 * POST /api/v1/auth/login        → Cloud Backend
 * POST /api/v1/auth/refresh      → Cloud Backend
 * GET  /api/v1/auth/credentials  → Cloud Backend (JWT required)
 */

import { Router, type Request, type Response } from "express";
import { getConfig } from "../utils/config.js";
import { createLogger } from "../utils/logging.js";

const logger = createLogger("auth-routes");

export const authRouter = Router();

async function proxyToCloud(
  req: Request,
  res: Response,
  path: string,
): Promise<void> {
  const cloudUrl = `${getConfig().cloud.api_url}${path}`;

  try {
    const resp = await fetch(cloudUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    logger.error({ err, path }, "Auth proxy failed");
    res.status(502).json({ error: "Cloud Backend unreachable" });
  }
}

// ===== POST /register =====
authRouter.post("/register", (req: Request, res: Response) => {
  proxyToCloud(req, res, "/api/v1/auth/register");
});

// ===== POST /login =====
authRouter.post("/login", (req: Request, res: Response) => {
  proxyToCloud(req, res, "/api/v1/auth/login");
});

// ===== POST /refresh =====
authRouter.post("/refresh", (req: Request, res: Response) => {
  proxyToCloud(req, res, "/api/v1/auth/refresh");
});

// ===== GET /credentials =====
authRouter.get("/credentials", async (req: Request, res: Response) => {
  const cloudUrl = `${getConfig().cloud.api_url}/api/v1/auth/credentials`;
  const authHeader = req.headers["authorization"];

  try {
    const resp = await fetch(cloudUrl, {
      method: "GET",
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });

    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    logger.error({ err }, "Credentials proxy failed");
    res.status(502).json({ error: "Cloud Backend unreachable" });
  }
});
