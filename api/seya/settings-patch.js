function normalizeTreatmentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mergeTreatmentBriefLists(remote, incoming) {
  const remoteList = Array.isArray(remote) ? remote : [];
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const remoteByName = new Map(
    remoteList
      .filter((item) => String(item?.name || "").trim())
      .map((item) => [normalizeTreatmentName(item.name), item]),
  );

  return incomingList.map((item) => {
    const name = String(item?.name || "").trim();
    const previous = remoteByName.get(normalizeTreatmentName(name));
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
      pricing: item.pricing !== undefined ? item.pricing : previous.pricing,
      durationMinutes:
        item.durationMinutes !== undefined
          ? item.durationMinutes
          : previous.durationMinutes,
      health: item.health !== undefined ? item.health : previous.health,
    };
  });
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
    next[key] = settings[key];
  }
  return next;
}

module.exports = {
  applySettingsPatch,
  mergeTreatmentBriefLists,
  normalizeTreatmentName,
};
