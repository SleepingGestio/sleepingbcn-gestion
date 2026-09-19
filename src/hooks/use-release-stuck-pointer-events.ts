import { useEffect } from "react";

// Any Radix overlay that can legitimately hold `pointer-events: none` on <body>.
const OPEN_OVERLAY = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(",");

// Longer than the dialogs' exit animation, so a dialog that is still closing
// (or one about to open right after) is never fought with.
const SETTLE_MS = 150;

/**
 * Safety net for Radix dialogs: DismissableLayer saves body's previous
 * pointer-events when the first modal layer mounts and restores it when the
 * last one unmounts. If a dialog opens while another is still animating out,
 * the saved value is already "none" and body stays unclickable forever.
 *
 * Watches body's style/children and, once things settle, clears a leftover
 * `pointer-events: none` when no overlay is open. Mount once, high up.
 */
export function useReleaseStuckPointerEvents() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // TEMPORARY DEBUG: remove once the stuck pointer-events cause is known.
    const state = () => ({
      inline: document.body.style.pointerEvents,
      computed: getComputedStyle(document.body).pointerEvents,
      styleAttr: document.body.getAttribute("style"),
      dataScrollLocked: document.body.getAttribute("data-scroll-locked"),
    });
    console.log("[stuck-pe] hook mounted", state());

    const check = () => {
      timer = undefined;
      const st = state();
      if (document.body.style.pointerEvents !== "none") {
        console.log("[stuck-pe] check: inline pointer-events is not 'none', nothing to do", st);
        return;
      }
      const open = document.querySelector(OPEN_OVERLAY);
      if (open) {
        console.log("[stuck-pe] check: open overlay found, not clearing", open, st);
        return;
      }
      console.log("[stuck-pe] check: clearing stuck pointer-events", st);
      document.body.style.pointerEvents = "";
      console.log("[stuck-pe] check: after clearing", state());
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, SETTLE_MS);
    };

    const observer = new MutationObserver((records) => {
      console.log(
        "[stuck-pe] observer fired",
        records.map((r) => `${r.type}${r.attributeName ? `:${r.attributeName}` : ""}`),
        state(),
      );
      schedule();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"], childList: true });
    schedule();

    return () => {
      console.log("[stuck-pe] hook unmounted");
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
