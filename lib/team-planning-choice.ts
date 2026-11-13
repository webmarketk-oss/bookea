type TeamSide<P, S> = {
  practitioners: P[];
  schedules: S[];
  updatedAt: number;
};

const PLACEHOLDER_TEAM: Array<[string, string]> = [
  ["samantha", "Samantha"],
  ["marie", "Marie L."],
  ["camille", "Camille"],
  ["ines", "Inès"],
  ["aurelie", "Aurélie"],
];

/** L’équipe d’exemple livrée avec Bookea. Ce n’est pas l’équipe d’un centre. */
export function isPlaceholderTeam(
  practitioners: Array<{ id: string; name?: string | null }>,
) {
  if (practitioners.length !== PLACEHOLDER_TEAM.length) {
    return false;
  }
  return PLACEHOLDER_TEAM.every(([id, name]) =>
    practitioners.some(
      (person) => person.id === id && String(person.name || "").trim() === name,
    ),
  );
}

/** Une copie locale plus vieille, ou l’équipe d’exemple, n’écrase pas l’équipe du centre. */
export function shouldWriteRemoteTeam(
  incoming: {
    practitioners: Array<{ id: string; name?: string | null }>;
    updatedAt?: number;
  } | null,
  stored: {
    practitioners: Array<{ id: string; name?: string | null }>;
    updatedAt?: number;
  } | null,
) {
  if (!incoming?.practitioners.length || isPlaceholderTeam(incoming.practitioners)) {
    return false;
  }
  if (!stored?.practitioners.length || isPlaceholderTeam(stored.practitioners)) {
    return true;
  }
  return (incoming.updatedAt || 0) >= (stored.updatedAt || 0);
}

export function pickTeamPlanning<
  P extends { id: string },
  S extends { practitionerId: string },
>(
  local: TeamSide<P, S> | null,
  remote: TeamSide<P, S> | null,
  emptySchedule: (practitioner: P) => S,
  defaults: () => { practitioners: P[]; schedules: S[] },
): TeamSide<P, S> & { source: "local" | "remote" | "default" } {
  const localTeam = local && !isPlaceholderTeam(local.practitioners) ? local : null;
  const remoteTeam = remote && !isPlaceholderTeam(remote.practitioners) ? remote : null;
  const localAt = localTeam?.updatedAt || 0;
  const remoteAt = remoteTeam?.updatedAt || 0;

  if (localTeam && localTeam.practitioners.length > 0 && localAt > remoteAt) {
    return { source: "local", ...align(localTeam, emptySchedule) };
  }

  if (remoteTeam && remoteTeam.practitioners.length > 0) {
    return { source: "remote", ...align(remoteTeam, emptySchedule) };
  }

  if (localTeam && localTeam.practitioners.length > 0) {
    return { source: "local", ...align(localTeam, emptySchedule) };
  }

  const fallback = defaults();
  if (fallback.practitioners.length > 0 && !isPlaceholderTeam(fallback.practitioners)) {
    return {
      source: "default",
      practitioners: fallback.practitioners,
      schedules: fallback.schedules,
      updatedAt: 0,
    };
  }

  return {
    source: "default",
    practitioners: [],
    schedules: [],
    updatedAt: 0,
  };
}

function align<P extends { id: string }, S extends { practitionerId: string }>(
  snapshot: TeamSide<P, S>,
  emptySchedule: (practitioner: P) => S,
): TeamSide<P, S> {
  return {
    practitioners: snapshot.practitioners,
    schedules: snapshot.practitioners.map(
      (practitioner) =>
        snapshot.schedules.find((item) => item.practitionerId === practitioner.id) ??
        emptySchedule(practitioner),
    ),
    updatedAt: snapshot.updatedAt || 0,
  };
}
