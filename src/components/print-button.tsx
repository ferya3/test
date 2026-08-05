"use client";

export function PrintButton() {
  // The browser's own print dialog also covers "save as PDF" on every platform,
  // which is what people actually want from an invoice.
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
