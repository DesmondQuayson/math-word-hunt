// The pdf.js worker as a bundled, same-origin module worker (the app's CSP
// allows worker-src 'self'). It re-exports the vendored worker unchanged.
import "pdfjs-dist/build/pdf.worker.mjs";
