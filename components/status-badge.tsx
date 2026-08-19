import { ProspectStatus } from "./types";

interface StatusBadgeProps {
  status: ProspectStatus;
}

const statusStyles: Record<ProspectStatus, string> = {
  Nouveau:
    "bg-blue-100 text-blue-700 border border-blue-200",

  "À rappeler":
    "bg-orange-100 text-orange-700 border border-orange-200",

  "RDV pris":
    "bg-purple-100 text-purple-700 border border-purple-200",

  Client:
    "bg-green-100 text-green-700 border border-green-200",

  Perdu:
    "bg-red-100 text-red-700 border border-red-200",
};

export default function StatusBadge({
  status,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}