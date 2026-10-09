const {
  mergeSeyaConversationLists,
  persistableConversations,
} = require("./conversation-key");
const { missionForcesWelcome } = require("./mission");

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
  if (isSeyaOff(record)) {
    return true;
  }
  if (missionForcesWelcome(record)) {
    return false;
  }
  return isExplicitFalse(record.autoMessageOnNewLead);
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
      centerProfile:
        remote.centerProfile && typeof remote.centerProfile === "object"
          ? remote.centerProfile
          : {
              activity: "",
              extras: "",
              audience: "",
              problem: "",
              differentiation: "",
              promise: "",
              positioning: "",
              supportPhone: "",
              supportEmail: "",
            },
      treatmentBriefs: Array.isArray(remote.treatmentBriefs)
        ? remote.treatmentBriefs
        : [],
      offerMaps: Array.isArray(remote.offerMaps) ? remote.offerMaps : [],
    };
  }
  return local && typeof local === "object" ? local : {};
}

function conversationLimitFromSettings(settings) {
  const quota = asRecord(asRecord(settings).seyaQuota);
  if (quota.conversationLimit == null || quota.conversationLimit === "") {
    return null;
  }
  const limit = Number(quota.conversationLimit);
  if (!Number.isFinite(limit)) {
    return null;
  }
  return Math.max(0, Math.floor(limit));
}

function isNewSeyaConversationBlocked(settings, conversations, existing) {
  if (existing) {
    return false;
  }
  const limit = conversationLimitFromSettings(settings);
  if (limit == null) {
    return false;
  }
  return (Array.isArray(conversations) ? conversations.length : 0) >= limit;
}

async function writeSeyaConversations(supabase, centerId, conversations) {
  const { settings, seya } = await readCenterSeya(supabase, centerId);
  const existing = Array.isArray(seya.conversations) ? seya.conversations : [];
  const next = persistableConversations(
    mergeSeyaConversationLists(existing, conversations),
  );
  const { error } = await supabase
    .from("centers")
    .update({
      settings: {
        ...settings,
        seya: {
          ...seya,
          conversations: next,
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
  conversationLimitFromSettings,
  isNewSeyaConversationBlocked,
  isSeyaOff,
  isSeyaWelcomeOff,
  isolateSeyaFromRemote,
  readCenterSeya,
  writeSeyaConversations,
};
