const { mirrorConversationChanges } = require("./conversation-mirror");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function mirrorAfterWrite(supabase, centerId, previousSettings, nextSettings) {
  const before = asRecord(previousSettings).seya?.conversations;
  const after = asRecord(nextSettings).seya?.conversations;
  if (!Array.isArray(after) || before === after) {
    return;
  }
  await mirrorConversationChanges(supabase, centerId, before, after);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function stableStringify(value) {
  return JSON.stringify(value ?? null);
}

function isJsonFilterUnsupported(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("operator") ||
    message.includes("filter") ||
    message.includes("invalid input") ||
    message.includes("json")
  );
}

/**
 * Met à jour centers.settings avec reprise si un autre écrit entre-temps.
 * mutate reçoit un clone des settings courants et doit renvoyer les settings suivants.
 */
async function mutateCenterSettings(supabase, centerId, mutate, options = {}) {
  const attempts = Number(options.attempts) > 0 ? Number(options.attempts) : 8;
  const id = String(centerId || "").trim();
  if (!id) {
    throw new Error("center_id_required");
  }
  if (typeof mutate !== "function") {
    throw new Error("mutate_required");
  }

  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase
      .from("centers")
      .select("settings")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error("center_not_found");
    }

    const currentSettings = asRecord(data.settings);
    const draft = cloneJson(currentSettings);
    const nextSettings = asRecord(mutate(draft, cloneJson(currentSettings)));

    if (stableStringify(nextSettings) === stableStringify(currentSettings)) {
      return {
        settings: currentSettings,
        changed: false,
        attempts: attempt + 1,
        cas: true,
      };
    }

    const wrote = await writeSettingsCas(
      supabase,
      id,
      nextSettings,
      currentSettings,
    );
    if (wrote.error) {
      lastError = wrote.error;
      if (!wrote.retryable) {
        throw new Error(wrote.error.message || String(wrote.error));
      }
      continue;
    }
    if (wrote.ok) {
      await mirrorAfterWrite(supabase, id, currentSettings, nextSettings);
      return {
        settings: nextSettings,
        changed: true,
        attempts: attempt + 1,
        cas: wrote.cas,
      };
    }
  }

  throw new Error(lastError?.message || "settings_write_conflict");
}

async function writeSettingsCas(supabase, id, nextSettings, currentSettings) {
  const afterId = supabase
    .from("centers")
    .update({ settings: nextSettings })
    .eq("id", id);

  // Anciens mocks de tests : .eq("id") renvoie déjà une Promise, sans .eq suivant.
  // Le client Supabase est thenable ET a encore .eq : il ne faut pas écrire avant
  // le filtre sur settings, sinon une conversation peut réécrire d’anciens réglages.
  if (
    afterId &&
    typeof afterId.then === "function" &&
    typeof afterId.eq !== "function"
  ) {
    const { error } = await afterId;
    if (error) {
      return { ok: false, error, retryable: false, cas: false };
    }
    return { ok: true, cas: false };
  }

  if (typeof afterId?.eq !== "function") {
    return {
      ok: false,
      error: new Error("settings_write_unsupported_client"),
      retryable: false,
      cas: false,
    };
  }

  let query = afterId.eq("settings", currentSettings);
  if (typeof query.select === "function") {
    query = query.select("id");
  }

  let result;
  try {
    result =
      typeof query.maybeSingle === "function"
        ? await query.maybeSingle()
        : await query;
  } catch (error) {
    if (isJsonFilterUnsupported(error)) {
      return writeSettingsBlind(supabase, id, nextSettings);
    }
    return { ok: false, error, retryable: false, cas: false };
  }

  if (result?.error) {
    if (isJsonFilterUnsupported(result.error)) {
      return writeSettingsBlind(supabase, id, nextSettings);
    }
    return { ok: false, error: result.error, retryable: false, cas: false };
  }

  // Ligne mise à jour (CAS ok) ou client sans select : considérer comme succès
  // seulement si une ligne est revenue, sinon conflit → retry.
  if (result?.data?.id) {
    return { ok: true, cas: true };
  }
  if (result && result.data === null && !result.error) {
    return { ok: false, error: null, retryable: true, cas: true };
  }
  if (result && !result.error && result.data === undefined) {
    return { ok: true, cas: true };
  }
  return { ok: false, error: null, retryable: true, cas: true };
}

async function writeSettingsBlind(supabase, id, nextSettings) {
  const blind = supabase
    .from("centers")
    .update({ settings: nextSettings })
    .eq("id", id);
  const { error } = await blind;
  if (error) {
    return { ok: false, error, retryable: false, cas: false };
  }
  const verified = await readSettings(supabase, id);
  if (stableStringify(verified) === stableStringify(nextSettings)) {
    return { ok: true, cas: false };
  }
  return { ok: false, error: null, retryable: true, cas: false };
}

async function readSettings(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return asRecord(data?.settings);
}

async function patchCenterSeya(supabase, centerId, patchSeya, options) {
  return mutateCenterSettings(
    supabase,
    centerId,
    (settings) => {
      const seya = asRecord(settings.seya);
      const nextSeya = asRecord(patchSeya(cloneJson(seya), cloneJson(settings)));
      return {
        ...settings,
        seya: nextSeya,
      };
    },
    options,
  );
}

module.exports = {
  asRecord,
  cloneJson,
  mutateCenterSettings,
  patchCenterSeya,
  stableStringify,
};
