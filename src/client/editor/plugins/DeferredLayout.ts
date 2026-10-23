import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import Extension from "../lib/Extension";

// Most time to spend laying out blocks per idle step, so that typing right
// after opening a document isn't held up by it noticeably. Each step has a
// fixed cost too (changing the rule restyles every block), so the steps
// shouldn't be much shorter either.
const STEP_MS = 50;

// Lets a long document appear without laying out every block first.
//
// While a document is loading, its top-level blocks get `content-visibility:
// auto`, so the browser skips layout and paint of the ones off screen (laying
// out a long document all at once is most of what opening it costs). Skipped
// blocks only count with an estimated height, though, which would make the
// scrollbar jump as they scroll into view. So once the document is on screen,
// the blocks are handed back to normal layout a batch at a time while the
// webview is idle, and when all of them are the rule is removed altogether:
// from then on the editor lays out exactly as it would without it.
//
// The rule lives in a <style> element of its own and selects blocks by
// position, so the editor's DOM, which ProseMirror owns, is never touched.
export default class DeferredLayout extends Extension {
  get name() {
    return "deferred_layout";
  }

  get plugins() {
    return [
      new Plugin({
        view: (view: EditorView) => {
          const style = document.createElement("style");
          document.head.appendChild(style);

          // Blocks before this (1-based) index are laid out normally.
          let laidOut = 1;
          // Blocks to lay out in the next step, adjusted to take up to STEP_MS.
          let batch = 100;
          let started = false;
          let done = false;

          const render = () => {
            style.textContent = `.ProseMirror > :nth-child(n + ${laidOut}) {
              content-visibility: auto;
              contain-intrinsic-size: auto 3em;
              overflow-clip-margin: 64px;
            }`;
          };

          const finish = () => {
            done = true;
            style.remove();
          };

          const idle = (callback: () => void) =>
            typeof window.requestIdleCallback === "function"
              ? window.requestIdleCallback(callback, { timeout: 200 })
              : window.setTimeout(callback, 16);

          const step = () => {
            if (done || view.isDestroyed) return;
            const begin = performance.now();
            laidOut += batch;
            if (laidOut > view.dom.childElementCount) {
              finish();
              return;
            }
            render();
            // Lay the batch out now, while idle, rather than in the next frame.
            void view.dom.offsetHeight;
            const took = performance.now() - begin;
            if (took < STEP_MS / 2) batch *= 2;
            else if (took > STEP_MS) batch = Math.max(10, Math.floor(batch / 2));
            idle(step);
          };

          // Start handing blocks back after the first frame has been shown.
          const start = () => {
            started = true;
            requestAnimationFrame(() => {
              window.setTimeout(() => idle(step), 0);
            });
          };

          render();
          // The editor mounts empty and receives the document afterwards;
          // whatever it holds first is what needs to load quickly.
          if (view.state.doc.content.size > 2) start();

          return {
            update: (view, prevState) => {
              if (!started && view.state.doc !== prevState.doc) start();
            },
            // A step still pending sees `done` and stops.
            destroy: finish,
          };
        },
      }),
    ];
  }
}
