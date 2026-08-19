import StatusBadge from "./status-badge";
import { Prospect } from "./types";

interface ProspectRowProps {
  prospect: Prospect;
  selected?: boolean;
  onClick?: () => void;
}

export default function ProspectRow({
  prospect,
  selected = false,
  onClick,
}: ProspectRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b transition hover:bg-slate-50 ${
        selected ? "bg-blue-50" : ""
      }`}
    >
      <td className="px-4 py-4">
        <input type="checkbox" />
      </td>

      <td className="px-4 py-4 whitespace-nowrap">
        {prospect.createdAt}
      </td>

      <td className="px-4 py-4">
        <div className="font-semibold text-slate-900">
          {prospect.firstName} {prospect.lastName}
        </div>
      </td>

      <td className="px-4 py-4">
        {prospect.phone}
      </td>

      <td className="px-4 py-4">
        {prospect.campaign}
      </td>

      <td className="px-4 py-4">
        {prospect.treatment}
      </td>

      <td className="px-4 py-4">
        {prospect.source}
      </td>

      <td className="px-4 py-4">
        <StatusBadge status={prospect.status} />
      </td>

      <td className="px-4 py-4">
        {prospect.nextContact}
      </td>

      <td className="px-4 py-4">
        {prospect.commercial}
      </td>

      <td className="px-4 py-4 text-center">
        {prospect.comments}
      </td>

      <td className="px-4 py-4 text-center">
        ⋮
      </td>
    </tr>
  );
}