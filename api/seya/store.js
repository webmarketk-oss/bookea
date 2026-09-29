function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function isExplicitFalse(value) {
  return value === false || value === "false" || value === 0 || value === "0";
}

function isSeyaOff(seya) {
  return isExplicitFalse(asRecord(seya).whatsappAgentEnabled);
}

function isSeyaWelcomeOff(seya) {
  const record = asRecord(seya);
  return isSeyaOff(record) || isExplicitFalse(record.autoMessageOnNewLead);
}

async function readCenterSeya(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const settings = asRecord(data?.settings);
  return {
    settings,
    seya: asRecord(settings.seya),
  };
}

function isolateSeyaFromRemote(remote, local) {
  if (remote != null && typeof remote === "object") {
    return {
      ...remote,
      treatmentBriefs: Array.isArray(remote.treatmentBriefs)
        ? remote.treatmentBriefs
        : [],
      offerMaps: Array.isArray(remote.offerMaps) ? remote.offerMaps : [],
    };
  }
  return local && typeof local === "object" ? local : {};
}

async function writeSeyaConversations(supabase, centerId, conversations) {
  const { settings, seya } = await readCenterSeya(supabase, centerId);
  const { error } = await supabase
    .from("centers")
    .update({
      settings: {
        ...settings,
        seya: {
          ...seya,
          conversations,
        },
      },
    })
    .eq("id", centerId);
  if (error) {
    throw new Error(error.message);
  }
  return seya;
}

module.exports = {
  asRecord,
  isSeyaOff,
  isSeyaWelcomeOff,
  isolateSeyaFromRemote,
  readCenterSeya,
  writeSeyaConversations,
};
