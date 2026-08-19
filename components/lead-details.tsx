export default function LeadDetails() {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
  
        {/* Header */}
        <div className="border-b border-slate-200 p-6">
  
          <div className="flex items-center gap-4">
  
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
              SM
            </div>
  
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Sophie Martin
              </h2>
  
              <p className="text-sm text-slate-500">
                Prospect depuis le 21 juillet 2026
              </p>
            </div>
  
          </div>
  
        </div>
  
        {/* Actions */}
  
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-6">
  
          <button className="rounded-xl bg-blue-600 py-3 font-medium text-white hover:bg-blue-700">
            📞 Appeler
          </button>
  
          <button className="rounded-xl border py-3 hover:bg-slate-50">
            💬 WhatsApp
          </button>
  
          <button className="rounded-xl border py-3 hover:bg-slate-50">
            📅 RDV
          </button>
  
          <button className="rounded-xl border py-3 hover:bg-slate-50">
            ✉️ Email
          </button>
  
        </div>
  
        {/* Informations */}
  
        <div className="space-y-5 p-6">
  
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Téléphone
            </p>
  
            <p className="mt-1 font-medium">
              06 71 22 90 91
            </p>
          </div>
  
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Soin
            </p>
  
            <p className="mt-1 font-medium">
              Épilation Laser
            </p>
          </div>
  
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Source
            </p>
  
            <p className="mt-1 font-medium">
              Facebook Ads
            </p>
          </div>
  
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Campagne
            </p>
  
            <p className="mt-1 font-medium">
              Soldes Été
            </p>
          </div>
  
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Commercial
            </p>
  
            <p className="mt-1 font-medium">
              Samantha
            </p>
          </div>
  
        </div>
  
        {/* Notes */}
  
        <div className="border-t border-slate-200 p-6">
  
          <h3 className="mb-3 font-semibold">
            Dernière note
          </h3>
  
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Cliente intéressée par une épilation jambes complètes.
            Souhaite être rappelée jeudi après-midi.
          </div>
  
        </div>
  
      </div>
    );
  }