export function InvoiceStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  return (
    <span className={`inv-badge inv-badge--${s}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
