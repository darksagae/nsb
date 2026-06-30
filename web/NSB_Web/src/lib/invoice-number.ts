export function generateInvoiceNumber(id: number, date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(id).padStart(5, '0');
  return `INV-${dd}${mm}-${seq}`;
}
