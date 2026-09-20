import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// TEMPORARY DEBUG ([auth-dbg]): counts getRouter() calls to spot a second QueryClient.
let routerCalls = 0;

export const getRouter = () => {
  console.log("[auth-dbg] getRouter called", ++routerCalls, typeof window === "undefined" ? "server" : "client");
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
