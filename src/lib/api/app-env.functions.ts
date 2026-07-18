import { createServerFn } from "@tanstack/react-start";

export const getAppEnv = createServerFn({ method: "GET" }).handler(async () => {
  return { env: process.env.APP_ENV ?? "production" };
});
