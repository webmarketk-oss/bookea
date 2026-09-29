import { CreditCard } from "lucide-react";
import { paymentToneStyles, type PaymentTone } from "@/lib/client-balance";
import { cn } from "@/lib/utils";

export function PaymentStatusMark({
  tone,
  className,
  label,
}: {
  tone: PaymentTone;
  className?: string;
  label?: boolean;
}) {
  const styles = paymentToneStyles[tone];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 font-black",
        styles.icon,
        className,
      )}
      title={styles.label}
      aria-label={styles.label}
    >
      <CreditCard className="h-3.5 w-3.5" />
      <span className="text-[11px] leading-none">€</span>
      {label ? (
        <span className="ml-0.5 text-[10px] font-bold leading-none">
          {styles.label}
        </span>
      ) : null}
    </span>
  );
}

export function PaymentStatusBadge({
  tone,
  amountLabel,
}: {
  tone: PaymentTone;
  amountLabel?: string;
}) {
  const styles = paymentToneStyles[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
        styles.badge,
      )}
    >
      <CreditCard className="h-3.5 w-3.5" />
      <span>€</span>
      {styles.label}
      {amountLabel ? ` · ${amountLabel}` : ""}
    </span>
  );
}
