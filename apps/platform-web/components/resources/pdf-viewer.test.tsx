import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfViewer } from "./pdf-viewer";

// pdf.js is replaced by a small fake: two pages, each 612x792 points.
const calls = vi.hoisted(() => ({ getDocument: [] as unknown[], workerPort: null as unknown, terminated: 0, destroyed: 0, rendered: [] as number[] }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { set workerPort(value: unknown) { calls.workerPort = value; }, get workerPort() { return calls.workerPort; } },
  getDocument: (parameters: unknown) => {
    calls.getDocument.push(parameters);
    const page = (number: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
      render: () => { calls.rendered.push(number); return { promise: Promise.resolve() }; }
    });
    return { promise: Promise.resolve({ numPages: 2, getPage: (number: number) => Promise.resolve(page(number)) }), destroy: () => { calls.destroyed += 1; return Promise.resolve(); } };
  }
}));

class FakeWorker { constructor(public url: URL, public options: unknown) {} terminate() { calls.terminated += 1; } }
class FakeResizeObserver {
  constructor(private readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {}
  observe() { this.callback([{ contentRect: { width: 720 } }]); }
  disconnect() {}
}

beforeEach(() => {
  calls.getDocument = []; calls.workerPort = null; calls.terminated = 0; calls.destroyed = 0; calls.rendered = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({}) as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("PdfViewer", () => {
  it("fetches the PDF from the protected inline route with credentials and draws every page onto a labelled canvas", async () => {
    render(<PdfViewer src="/resources/10000000-0000-4000-8000-000000000001/inline" title="Ratios And Rates Practice" />);
    expect(screen.getByRole("status").textContent).toBe("Loading the PDF…");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 pages"));
    const parameters = calls.getDocument[0] as { url: string; withCredentials: boolean; useWasm: boolean };
    expect(parameters.url).toBe("/resources/10000000-0000-4000-8000-000000000001/inline");
    expect(parameters.withCredentials).toBe(true);
    // No WebAssembly and no eval: the app's CSP allows neither.
    expect(parameters.useWasm).toBe(false);
    expect(calls.workerPort).toBeInstanceOf(FakeWorker);
    expect((calls.workerPort as FakeWorker).options).toEqual({ type: "module" });
    expect(String((calls.workerPort as FakeWorker).url)).toMatch(/\/components\/resources\/pdf-worker\.ts/);
    const canvases = screen.getAllByRole("img");
    expect(canvases).toHaveLength(2);
    expect(canvases.map((canvas) => canvas.getAttribute("aria-label"))).toEqual(["Page 1 of 2: Ratios And Rates Practice", "Page 2 of 2: Ratios And Rates Practice"]);
    expect(calls.rendered).toEqual([1, 2]);
    // Nothing is embedded: no frame, no object, no plugin element.
    expect(document.querySelector("iframe, object, embed")).toBeNull();
    expect(document.querySelector(".pdf-viewer-pages")?.getAttribute("data-page-count")).toBe("2");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a rendering failure and offers the same protected PDF inline, never a storage URL", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    render(<PdfViewer src="/resources/10000000-0000-4000-8000-000000000001/inline" title="Percent" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toBe("The PDF could not be shown here.");
    const fallback = screen.getByRole("link", { name: "Open the PDF in a new tab" });
    expect(fallback.getAttribute("href")).toBe("/resources/10000000-0000-4000-8000-000000000001/inline");
    expect(document.body.innerHTML).not.toContain("supabase");
  });

  it("releases the worker and the loading task when it unmounts", async () => {
    const view = render(<PdfViewer src="/resources/10000000-0000-4000-8000-000000000001/inline" title="Percent" />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 pages"));
    view.unmount();
    expect(calls.terminated).toBe(1);
    expect(calls.destroyed).toBe(1);
  });
});
