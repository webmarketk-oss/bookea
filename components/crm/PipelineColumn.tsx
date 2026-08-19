import LeadCard from "./LeadCard";

type PipelineColumnProps = {
  title: string;
  count: number;
};

export default function PipelineColumn({
  title,
  count,
}: PipelineColumnProps) {
  return (
    <div className="min-h-[600px] rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>

        <span className="rounded-full bg-white px-2 py-1 text-sm font-medium text-slate-600">
          {count}
        </span>
      </div>

      <div className="space-y-3">
        <LeadCard
          name="Sophie Martin"
          treatment="Épilation Laser"
          priority="Très chaud"
          date="Aujourd'hui"
        />

        <LeadCard
          name="Julie Bernard"
          treatment="Cryolipolyse"
          priority="Chaud"
          date="Demain"
        />
      </div>
    </div>
  );
}