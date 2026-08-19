const cards = [
    {
      title: "Nouveaux",
      value: 23,
      color: "text-blue-600",
      icon: "🆕",
      info: "+12 aujourd'hui",
    },
    {
      title: "À rappeler",
      value: 17,
      color: "text-orange-500",
      icon: "📞",
      info: "+5 aujourd'hui",
    },
    {
      title: "RDV programmés",
      value: 28,
      color: "text-purple-600",
      icon: "📅",
      info: "+8 aujourd'hui",
    },
    {
      title: "Clients",
      value: 152,
      color: "text-green-600",
      icon: "👥",
      info: "+18 ce mois",
    },
    {
      title: "Perdus",
      value: 12,
      color: "text-red-500",
      icon: "❌",
      info: "-2 ce mois",
    },
  ];
  
  export default function DashboardCards() {
    return (
      <div className="grid gap-5 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">
                {card.title}
              </p>
  
              <span className="text-xl">{card.icon}</span>
            </div>
  
            <h2 className={`mt-4 text-4xl font-bold ${card.color}`}>
              {card.value}
            </h2>
  
            <p className="mt-3 text-sm text-slate-500">
              {card.info}
            </p>
          </div>
        ))}
      </div>
    );
  }