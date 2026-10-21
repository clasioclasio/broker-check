import express, { type Express, type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method) && req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Межсайтовая отправка запрещена." }); return;
  }
  next();
});
app.use(cookieParser(process.env.SESSION_SECRET));
app.use((req, res, next) => {
  if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
    const origin = req.get("origin");
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0]?.trim();
    if (origin) {
      try {
        if (new URL(origin).host !== host) { res.status(403).json({ error: "Межсайтовая отправка запрещена." }); return; }
      } catch { res.status(403).json({ error: "Некорректный источник запроса." }); return; }
    }
  }
  next();
});
app.use("/api/leads/import", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "24kb" }));

app.use("/api", router);
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err?.type === "entity.too.large" ? 413 : err instanceof SyntaxError ? 400 : 500;
  req.log.error({ status }, "API request failed");
  res.status(status).json({ error: status === 500 ? "Не удалось сохранить данные. Попробуйте позже." : "Некорректный запрос." });
};
app.use(errorHandler);

export default app;
