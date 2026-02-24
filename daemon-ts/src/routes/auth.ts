/**
 * Auth Routes — proxy auth requests to Cloud Backend + daemon session management.
 *
 * POST /api/v1/auth/register     → Cloud Backend (intercept: store session)
 * POST /api/v1/auth/login        → Cloud Backend (intercept: store session + fetch LLM creds)
 * POST /api/v1/auth/refresh      → Cloud Backend (intercept: update stored tokens)
 * GET  /api/v1/auth/credentials  → Cloud Backend (JWT required)
 * GET  /api/v1/auth/session      → Return session info (no tokens)
 * GET  /api/v1/auth/token        → Return current access token
 * POST /api/v1/auth/logout       → Clear session + LLM credentials
 */

import { Router, type Request, type Response } from "express";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfig, AMI_DIR } from "../utils/config.js";
import { storeSession, clearSession, getSession, getAuthToken } from "../services/auth-manager.js";
import { createLogger } from "../utils/logging.js";

const logger = createLogger("auth-routes");

export const authRouter = Router();

const SETTINGS_FILE = join(AMI_DIR, "settings.json");

// ===== Helper: fetch LLM credentials and save to settings.json =====

async function fetchAndStoreLLMCredentials(accessToken: string): Promise<void> {
  const cloudUrl = `${getConfig().cloud.api_url}/api/v1/auth/credentials`;
  try {
    const resp = await fetch(cloudUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Failed to fetch LLM credentials");
      return;
    }

    const { api_key } = (await resp.json()) as { api_key?: string };
    if (!api_key) {
      logger.warn("No API key in credentials response");
      return;
    }

    let settings: Record<string, unknown> = {};
    try {
      if (existsSync(SETTINGS_FILE)) {
        settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
      }
    } catch {
      // corrupted file — start fresh
    }

    const creds = (settings.credentials ?? {}) as Record<string, unknown>;
    creds.anthropic = { api_key };
    settings.credentials = creds;

    mkdirSync(AMI_DIR, { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    logger.info("LLM credentials stored in settings.json");
  } catch (err) {
    logger.warn({ err }, "Failed to fetch/store LLM credentials");
  }
}

// ===== Helper: clear LLM credentials from settings.json =====

function clearLLMCredentials(): void {
  try {
    if (!existsSync(SETTINGS_FILE)) return;

    const settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    delete settings.credentials;
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    logger.info("LLM credentials cleared from settings.json");
  } catch (err) {
    logger.warn({ err }, "Failed to clear LLM credentials");
  }
}

// ===== POST /login =====

authRouter.post("/login", async (req: Request, res: Response) => {
  const cloudUrl = `${getConfig().cloud.api_url}/api/v1/auth/login`;

  try {
    const resp = await fetch(cloudUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await resp.json()) as Record<string, unknown>;

    // Intercept successful login → store session + fetch LLM creds
    if (resp.ok && data.access_token) {
      storeSession({
        access_token: data.access_token as string,
        refresh_token: data.refresh_token as string,
        username: (data.username as string) ?? "",
        user_id: (data.user_id as string) ?? "",
        email: (data.email as string) ?? "",
      });

      // Auto-fetch LLM credentials (fire-and-forget)
      fetchAndStoreLLMCredentials(data.access_token as string).catch((err) => {
        logger.warn({ err }, "Background LLM credential fetch failed");
      });
    }

    res.status(resp.status).json(data);
  } catch (err) {
    logger.error({ err }, "Login proxy failed");
    res.status(502).json({ error: "Cloud Backend unreachable" });
  }
});

// ===== POST /register =====

authRouter.post("/register", async (req: Request, res: Response) => {
  const cloudUrl = `${getConfig().cloud.api_url}/api/v1/auth/register`;

  try {
    const resp = await fetch(cloudUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await resp.json()) as Record<string, unknown>;

    // Intercept successful registration → store session + fetch LLM creds
    if (resp.ok && data.access_token) {
      storeSession({
        access_token: data.access_token as string,
        refresh_token: data.refresh_token as string,
        username: (data.username as string) ?? "",
        user_id: (data.user_id as string) ?? "",
        email: (data.email as string) ?? "",
      });

      // Auto-fetch LLM credentials (fire-and-forget)
      fetchAndStoreLLMCredentials(data.access_token as string).catch((err) => {
        logger.warn({ err }, "Background LLM credential fetch failed");
      });
    }

    res.status(resp.status).json(data);
  } catch (err) {
    logger.error({ err }, "Register proxy failed");
    res.status(502).json({ error: "Cloud Backend unreachable" });
  }
});

// ===== POST /refresh =====

authRouter.post("/refresh", async (req: Request, res: Response) => {
  const cloudUrl = `${getConfig().cloud.api_url}/api/v1/auth/refresh`;

  try {
    const resp = await fetch(cloudUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await resp.json()) as Record<string, unknown>;

    // Intercept successful refresh → update stored tokens
    if (resp.ok && data.access_token) {
      // Read existing session to preserve user info
      const existing = getSession();
      storeSession({
        access_token: data.access_token as string,
        refresh_token: (data.refresh_token as string) ?? "",
        username: existing.username ?? "",
        user_id: existing.user_id ?? "",
        email: existing.email ?? "",
      });
    }

    res.status(resp.status).json(data);
  } catch (err) {
    logger.error({ err }, "Refresh proxy failed");
    res.status(502).json({ error: "Cloud Backend unreachable" });
  }
});

// ===== GET /credentials =====

authRouter.get("/credentials", async (req: Request, res: Response) => {
  const cloudUrl = `${getConfig().cloud.api_url}/api/v1/auth/credentials`;

  // Use daemon-managed token if no explicit auth header
  let authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader) {
    const token = await getAuthToken();
    if (token) {
      authHeader = `Bearer ${token}`;
    }
  }

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

// ===== GET /session =====

authRouter.get("/session", (_req: Request, res: Response) => {
  const session = getSession();
  res.json(session);
});

// ===== GET /token =====

authRouter.get("/token", async (_req: Request, res: Response) => {
  const token = await getAuthToken();
  if (token) {
    res.json({ access_token: token });
  } else {
    res.status(401).json({ error: "No active session" });
  }
});

// ===== POST /logout =====

authRouter.post("/logout", (_req: Request, res: Response) => {
  clearSession();
  clearLLMCredentials();
  res.json({ success: true, message: "Logged out" });
});
