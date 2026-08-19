type LeadCardProps = {
    name: string;
    treatment: string;
    priority: string;
    date: string;
  };
  
  export default function LeadCard({
    name,
    treatment,
    priority,
    date,
  }: LeadCardProps) {
    return (
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
        <h3 className="font-semibold text-slate-900">{name}</h3>
  
        <p className="mt-1 text-sm text-slate-500">
          {treatment}
        </p>
  
        <div className="mt-4 flex items-center justify-between">
          <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">
            {priority}
          </span>
  
          <span className="text-xs text-slate-500">
            {date}
          </span>
        </div>
      </div>
    );
  }