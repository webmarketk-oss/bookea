export default function Filters() {
    return (
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="🔍 Rechercher un prospect..."
            className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
          />
  
          <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <option>Toutes les sources</option>
            <option>Facebook</option>
            <option>Google Ads</option>
            <option>Instagram</option>
            <option>Site Web</option>
          </select>
  
          <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <option>Toutes les campagnes</option>
            <option>Soldes Été</option>
            <option>Laser</option>
            <option>Cryolipolyse</option>
          </select>
  
          <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <option>Tous les commerciaux</option>
            <option>Samantha</option>
            <option>Marie</option>
          </select>
  
          <button className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium transition hover:bg-slate-50">
            Filtres
          </button>
        </div>
      </div>
    );
  }