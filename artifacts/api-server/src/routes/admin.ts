import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AdminLoginBody } from "@workspace/api-zod";
import rateLimit from "express-rate-limit";

const router = Router();
const sessions = new Map<string, number>();
const TTL = 8 * 60 * 60 * 1000;
const digest = (value: string) => createHash("sha256").update(value).digest();
const tokenKey = (value: string) => digest(value).toString("hex");
// Compatibility with the imported collector, with a server-enforced expiry.
export const validTokens = {
  has(token: string) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
    const key = tokenKey(token);
    const expiry = sessions.get(key);
    if (!expiry || expiry <= Date.now()) { sessions.delete(key); return false; }
    return true;
  },
};
export const isAdmin = (req: Request) => validTokens.has(req.cookies?.admin_token);
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  if (!isAdmin(req)) { res.status(401).json({ error: "Войдите в админ-панель." }); return; }
  next();
}
const limiter = rateLimit({
  windowMs: 15 * 60000, limit: 5, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Слишком много попыток. Повторите через 15 минут." },
});
const options = () => ({
  httpOnly: true, sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production", path: "/api",
});
router.post("/admin/login", limiter, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    res.status(503).json({ error: "Вход ещё не настроен. Владелец проекта должен задать ADMIN_USERNAME и ADMIN_PASSWORD в секретах сервера." }); return;
  }
  const input = AdminLoginBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Введите логин и пароль." }); return; }
  const usernameMatch = timingSafeEqual(digest(input.data.username), digest(username));
  const passwordMatch = timingSafeEqual(digest(input.data.password), digest(password));
  if (!usernameMatch || !passwordMatch) {
    res.status(401).json({ error: "Неверный логин или пароль." }); return;
  }
  for (const [key, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
  if (sessions.size >= 200) {
    res.status(503).json({ error: "Превышен лимит активных сеансов. Выйдите из другой вкладки или повторите позже." }); return;
  }
  const previous = req.cookies?.admin_token;
  if (typeof previous === "string") sessions.delete(tokenKey(previous));
  const token = randomBytes(32).toString("hex");
  sessions.set(tokenKey(token), Date.now() + TTL);
  res.cookie("admin_token", token, { ...options(), maxAge: TTL });
  res.json({ ok: true, role: "admin" });
});
router.post("/admin/logout", (req, res) => {
  const token = req.cookies?.admin_token;
  if (typeof token === "string") sessions.delete(tokenKey(token));
  res.clearCookie("admin_token", options());
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});
router.get("/admin/me", requireAdmin, (_req, res) => { res.json({ ok: true, role: "admin" }); });
export default router;
