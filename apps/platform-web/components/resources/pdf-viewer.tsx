"use client";

import { useEffect, useRef, useState } from "react";

type ViewerStatus =
  | { kind: "loading" }
  | { kind: "ready"; pages: number }
  | { kind: "error"; message: string };

/**
 * In-app PDF preview. The PDF is fetched from the entitlement-checked inline
 * route (same origin, credentials included, never cached) and rendered page by
 * page onto canvases with pdf.js, fitted to the container width. Nothing is
 * embedded through a frame or an object element (iOS Safari cannot scroll a
 * framed PDF and the app's CSP forbids objects), nothing is stored in the
 * browser, and no storage URL is involved. If rendering is not possible, the
 * viewer says so and offers the same PDF inline in a new tab and the download.
 */
export function PdfViewer({ src, title }: Readonly<{ src: string; title: string }>) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const renderedWidth = useRef(0);
  const [status, setStatus] = useState<ViewerStatus>({ kind: "loading" });
  const [rendered, setRendered] = useState(0);
  const [renderKey, setRenderKey] = useState(0);

  // Render once at the first measured width, then again only when the width
  // moves by 48px or more (rotation, a real window resize). Smaller moves are
  // ignored on purpose: the scrollbar that appears once pages are drawn takes
  // about 17px, and re-rendering for it would clear the pages and loop.
  useEffect(() => {
    const element = pagesRef.current;
    if (!element) return;
    const consider = (width: number) => {
      if (renderedWidth.current !== 0 && Math.abs(width - renderedWidth.current) < 48) return;
      renderedWidth.current = Math.max(1, width);
      setRenderKey((key) => key + 1);
    };
    if (typeof ResizeObserver === "undefined") {
      consider(element.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => consider(entries[0]?.contentRect.width ?? element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = pagesRef.current;
    if (!container || renderKey === 0) return;
    let cancelled = false;
    let worker: Worker | null = null;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    setStatus({ kind: "loading" });
    setRendered(0);
    container.replaceChildren();
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // A same-origin module worker (worker-src 'self'); no eval, no WebAssembly.
        worker = new Worker(new URL("./pdf-worker.ts", import.meta.url), { type: "module" });
        pdfjs.GlobalWorkerOptions.workerPort = worker;
        const task = pdfjs.getDocument({ url: src, withCredentials: true, useWasm: false });
        loadingTask = task;
        const pdf = await task.promise;
        if (cancelled) return;
        setStatus({ kind: "ready", pages: pdf.numPages });
        const width = Math.max(240, container.clientWidth);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${number} of ${pdf.numPages}: ${title}`);
          canvas.dataset.pdfPage = String(number);
          const wrapper = document.createElement("div");
          wrapper.className = "pdf-viewer-page";
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);
          if (!canvas.getContext("2d")) throw new Error("This browser cannot draw the PDF pages.");
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          setRendered(number);
        }
      } catch (error) {
        if (!cancelled) setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
      loadingTask?.destroy().catch(() => undefined);
      worker?.terminate();
    };
  }, [src, title, renderKey]);

  return <section className="pdf-viewer" aria-label="PDF preview" data-viewer-state={status.kind}>
    <p className="pdf-viewer-status" role="status" aria-live="polite">
      {status.kind === "loading" ? "Loading the PDF…"
        : status.kind === "ready" ? (rendered < status.pages ? `Showing page ${rendered} of ${status.pages}…` : `${status.pages} ${status.pages === 1 ? "page" : "pages"}`)
        : "The PDF could not be shown here."}
    </p>
    {status.kind === "error" ? <div className="pdf-viewer-fallback" role="alert">
      <p>{status.message}</p>
      <p><a href={src} target="_blank" rel="noreferrer">Open the PDF in a new tab</a> or use Download PDF above.</p>
    </div> : null}
    <div className="pdf-viewer-pages" ref={pagesRef} data-page-count={status.kind === "ready" ? status.pages : undefined} />
  </section>;
}
