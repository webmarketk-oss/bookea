import { Check } from "lucide-react";

export function FeatureTicks({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 grid gap-2.5 text-sm font-medium text-slate-700">
      {items.map((point) => (
        <li key={point} className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
          <span>{point}</span>
        </li>
      ))}
    </ul>
  );
}
