/** Authenticated app route that redirects to a short-lived presigned S3 URL. */
export function invoicePdfViewPath(invoiceId: number): string {
  return `/api/invoices/${invoiceId}/pdf/view`;
}
