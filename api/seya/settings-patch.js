function normalizeTreatmentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mergePricing(previous, incoming) {
  if (incoming === undefined) {
    return previous;
  }
  if (incoming === null) {
    return null;
  }
  const base =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? previous
      : {};
  const next =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? incoming
      : {};
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
  const merged = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(next, key) && next[key] !== undefined) {
      merged[key] = next[key];
    } else {
      merged[key] = base[key];
    }
  }
  return merged;
}

function mergeTreatmentBriefLists(remote, incoming, removedNames) {
  const remoteList = Array.isArray(remote) ? remote : [];
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const removed = new Set(
    (Array.isArray(removedNames) ? removedNames : [])
      .map((name) => normalizeTreatmentName(name))
      .filter(Boolean),
  );
  const remoteByName = new Map(
    remoteList
      .filter((item) => String(item?.name || "").trim())
      .map((item) => [normalizeTreatmentName(item.name), item]),
  );
  const seen = new Set();

  const merged = incomingList.filter((item) => !removed.has(normalizeTreatmentName(item?.name))).map((item) => {
    const name = String(item?.name || "").trim();
    const key = normalizeTreatmentName(name);
    if (key) {
      seen.add(key);
    }
    const previous = remoteByName.get(key);
    if (!previous) {
      return item;
    }
    return {
      ...previous,
      ...item,
      name: name || previous.name,
      title: item.title !== undefined ? item.title : previous.title,
      url: item.url !== undefined ? item.url : previous.url,
      brief: item.brief !== undefined ? item.brief : previous.brief,
      opening: item.opening !== undefined ? item.opening : previous.opening,
      price: item.price !== undefined ? item.price : previous.price,
      pricing: mergePricing(previous.pricing, item.pricing),
      durationMinutes:
        item.durationMinutes !== undefined
          ? item.durationMinutes
          : previous.durationMinutes,
      health: item.health !== undefined ? item.health : previous.health,
    };
  });

  // Conserver les prestations absentes du formulaire / de la requête.
  for (const previous of remoteList) {
    const key = normalizeTreatmentName(previous?.name);
    if (!key || seen.has(key) || removed.has(key)) {
      continue;
    }
    merged.push(previous);
  }

  return merged;
}

function applySettingsPatch(base, settings, changedKeys) {
  if (!Array.isArray(changedKeys) || changedKeys.length === 0) {
    return { ...settings };
  }
  const next = { ...base };
  for (const key of changedKeys) {
    if (key === "treatmentBriefs") {
      next.treatmentBriefs = mergeTreatmentBriefLists(
        base.treatmentBriefs,
        settings.treatmentBriefs,
      );
      continue;
    }
    if (!(key in settings) || settings[key] === undefined) {
      continue;
    }
    next[key] = settings[key];
  }
  return next;
}

module.exports = {
  applySettingsPatch,
  mergePricing,
  mergeTreatmentBriefLists,
  normalizeTreatmentName,
};
