import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

let nextInstanceId = 0;

/**
 * TEMPORARY DEBUG ([mount-dbg]): remove once the AppShell remount cause is known.
 * Gives every component instance an id, so the log tells a real remount (new
 * id) apart from an effect re-running on the same, still-mounted instance.
 */
export function useMountDebug(name: string) {
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = ++nextInstanceId;
  const renderCount = useRef(0);
  renderCount.current += 1;
  const id = idRef.current;
  console.log(`[mount-dbg] ${name}#${id} render #${renderCount.current}`);

  useEffect(() => {
    console.log(`[mount-dbg] ${name}#${id} mounted`, document.visibilityState);
    return () => console.log(`[mount-dbg] ${name}#${id} unmounted`);
  }, [name, id]);
}

/** TEMPORARY DEBUG ([mount-dbg]): logs TanStack Router lifecycle events (loads/navigations re-running). */
export function useRouterEventsDebug() {
  const router = useRouter();
  useEffect(() => {
    const types = ["onBeforeNavigate", "onBeforeLoad", "onLoad", "onResolved", "onRendered"] as const;
    const unsubs = types.map((t) =>
      router.subscribe(t, (e) => {
        console.log(`[mount-dbg] router ${t}`, {
          to: e.toLocation.href,
          pathChanged: e.pathChanged,
          hrefChanged: e.hrefChanged,
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [router]);
}
