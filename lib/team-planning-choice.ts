type TeamSide<P, S> = {
  practitioners: P[];
  schedules: S[];
  updatedAt: number;
};

export function pickTeamPlanning<
  P extends { id: string },
  S extends { practitionerId: string },
>(
  local: TeamSide<P, S> | null,
  remote: TeamSide<P, S> | null,
  emptySchedule: (practitioner: P) => S,
  defaults: () => { practitioners: P[]; schedules: S[] },
): TeamSide<P, S> & { source: "local" | "remote" | "default" } {
  const localAt = local?.updatedAt || 0;
  const remoteAt = remote?.updatedAt || 0;

  if (local && local.practitioners.length > 0 && localAt > remoteAt) {
    return { source: "local", ...align(local, emptySchedule) };
  }

  if (remote && remote.practitioners.length > 0) {
    return { source: "remote", ...align(remote, emptySchedule) };
  }

  if (local && local.practitioners.length > 0) {
    return { source: "local", ...align(local, emptySchedule) };
  }

  const fallback = defaults();
  return {
    source: "default",
    practitioners: fallback.practitioners,
    schedules: fallback.schedules,
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
