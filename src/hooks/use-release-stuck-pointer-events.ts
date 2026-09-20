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

    const check = () => {
      timer = undefined;
      if (document.body.style.pointerEvents !== "none") return;
      if (document.querySelector(OPEN_OVERLAY)) return;
      document.body.style.pointerEvents = "";
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, SETTLE_MS);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"], childList: true });
    schedule();

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
