const { last9Phone, persistableConversations, mergeSeyaConversationLists } = require("./conversation-key");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactPhoneRows(rows, last9) {
  const wanted = String(last9 || "");
  if (wanted.length < 9) {
    return [];
  }
  return (rows || []).filter((row) => last9Phone(row?.phone) === wanted);
}

function phoneQuery(phone, last9) {
  return `phone.eq.${phone},phone.eq.0${last9},phone.eq.33${last9},phone.ilike.%${last9}%`;
}

function addHome(index, last9, home) {
  const key = String(last9 || "");
  if (key.length < 9 || !home?.centerId) {
    return;
  }
  const list = index.get(key) || [];
  const existing = list.find((item) => item.centerId === home.centerId);
  if (existing) {
    if (String(home.at || "") > String(existing.at || "")) {
      existing.at = home.at;
    }
    existing.clientId = existing.clientId || home.clientId;
    existing.leadId = existing.leadId || home.leadId;
    existing.row = home.row || existing.row;
    return;
  }
  list.push(home);
  index.set(key, list);
}

function pickPhoneHome(homes, { preferCenterId } = {}) {
  const list = (homes || []).filter((item) => item?.centerId);
  if (!list.length) {
    return null;
  }
  if (preferCenterId && list.some((item) => item.centerId === preferCenterId)) {
    return list.find((item) => item.centerId === preferCenterId);
  }
  return [...list].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0];
}

function stampCenter(conversation, centerId) {
  if (!conversation || typeof conversation !== "object") {
    return conversation;
  }
  return { ...conversation, centerId };
}

function conversationsForCenter(list, centerId) {
  const id = String(centerId || "");
  return (Array.isArray(list) ? list : [])
    .filter((item) => {
      const cid = String(item?.centerId || "").trim();
      return !cid || cid === id;
    })
    .map((item) => stampCenter(item, id));
}

function filterOwnedConversations(list, centerId, ownedPhones) {
  const owned = ownedPhones instanceof Set ? ownedPhones : new Set();
  const scoped = conversationsForCenter(list, centerId);
  if (owned.size === 0) {
    return scoped;
  }
  return scoped.filter((item) => {
    const key = last9Phone(item.phone);
    if (key.length < 9) {
      return true;
    }
    return owned.has(key);
  });
}

async function loadOwnedPhones(supabase, centerId) {
  const [{ data: clients }, { data: leads }] = await Promise.all([
    supabase
      .from("clients")
      .select("phone")
      .eq("center_id", centerId)
      .is("merged_into_client_id", null),
    supabase.from("leads").select("phone").eq("center_id", centerId),
  ]);
  const owned = new Set();
  for (const row of [...(clients || []), ...(leads || [])]) {
    const key = last9Phone(row.phone);
    if (key.length >= 9) {
      owned.add(key);
    }
  }
  return owned;
}

function planRehome(centerLists, ownership) {
  const kept = new Map();
  const moved = [];

  for (const [centerId] of centerLists) {
    kept.set(centerId, []);
  }

  for (const [centerId, conversations] of centerLists) {
    for (const item of conversations || []) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const last9 = last9Phone(item.phone);
      const homes = last9 ? ownership.get(last9) || [] : [];
      const dest = pickPhoneHome(homes, { preferCenterId: centerId });
      const target = dest?.centerId || centerId;
      const stamped = stampCenter(item, target);
      if (!kept.has(target)) {
        kept.set(target, []);
      }
      kept.get(target).push(stamped);
      if (target !== centerId) {
        moved.push({
          phone: last9,
          from: centerId,
          to: target,
          name: [item.firstName, item.lastName].filter(Boolean).join(" "),
        });
      }
    }
  }

  const involved = new Set();
  for (const item of moved) {
    involved.add(item.from);
    involved.add(item.to);
  }

  const updates = [];
  for (const [centerId, conversations] of kept) {
    const original = centerLists.get(centerId) || [];
    const next = persistableConversations(
      mergeSeyaConversationLists(conversations),
    );
    const stampNeeded = (original || []).some(
      (item) => String(item?.centerId || "") !== String(centerId),
    );
    if (involved.has(centerId) || stampNeeded || original.length !== next.length) {
      updates.push({ centerId, conversations: next });
    }
  }

  return { updates, moved };
}

function ownershipFromRows({ clients, leads } = {}) {
  const index = new Map();
  for (const row of clients || []) {
    const last9 = last9Phone(row.phone);
    addHome(index, last9, {
      centerId: row.center_id,
      clientId: row.id,
      leadId: null,
      at: row.updated_at || "",
      row,
    });
  }
  for (const row of leads || []) {
    const last9 = last9Phone(row.phone);
    addHome(index, last9, {
      centerId: row.center_id,
      clientId: row.client_id || null,
      leadId: row.id,
      at: row.last_activity_at || row.updated_at || "",
      row,
    });
  }
  return index;
}

async function loadPhoneHomes(supabase, phone) {
  const last9 = last9Phone(phone);
  if (last9.length < 9) {
    return [];
  }
  const query = phoneQuery(phone, last9);
  const [{ data: clients, error: clientError }, { data: leads, error: leadError }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id,center_id,first_name,last_name,phone,updated_at")
        .is("merged_into_client_id", null)
        .or(query)
        .limit(40),
      supabase
        .from("leads")
        .select(
          "id,center_id,client_id,status,next_action,recall_date,service_id,updated_at,last_activity_at,phone,campaigns(name)",
        )
        .or(query)
        .limit(40),
    ]);
  if (clientError) {
    throw new Error(clientError.message);
  }
  if (leadError) {
    throw new Error(leadError.message);
  }
  const index = ownershipFromRows({
    clients: exactPhoneRows(clients, last9),
    leads: exactPhoneRows(leads, last9),
  });
  return index.get(last9) || [];
}

async function resolveCenterFromPhone(supabase, phone) {
  const last9 = last9Phone(phone);
  if (last9.length < 9) {
    return null;
  }
  const homes = await loadPhoneHomes(supabase, phone);
  const home = pickPhoneHome(homes);
  if (!home) {
    return null;
  }

  const { sanitizePersonName } = require("../../lib/seya-person-name");
  let firstName = "bonjour";
  let lastName = "";
  let clientPhone = phone;
  let clientId = home.clientId || null;
  let treatment = "";
  let campaign = "";
  let status = "Nouveau";
  let recall_date = "";
  let serviceId = null;

  if (home.clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("id,center_id,first_name,last_name,phone")
      .eq("id", home.clientId)
      .maybeSingle();
    if (client) {
      const person = sanitizePersonName(client.first_name, client.last_name);
      firstName = person.firstName || firstName;
      lastName = person.lastName;
      clientPhone = client.phone || clientPhone;
      clientId = client.id;
    }
  }

  const leadId = home.leadId;
  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select(
        "id,center_id,client_id,status,recall_date,service_id,phone,campaigns(name)",
      )
      .eq("id", leadId)
      .maybeSingle();
    if (lead) {
      status = lead.status || status;
      recall_date = lead.recall_date || "";
      serviceId = lead.service_id || null;
      campaign = Array.isArray(lead.campaigns)
        ? lead.campaigns[0]?.name || ""
        : lead.campaigns?.name || "";
      clientId = lead.client_id || clientId;
      clientPhone = lead.phone || clientPhone;
    }
  }

  if (serviceId) {
    const { data: service } = await supabase
      .from("services")
      .select("name")
      .eq("id", serviceId)
      .maybeSingle();
    treatment = service?.name || "";
  }

  return {
    centerId: home.centerId,
    clientId,
    leadId: leadId || clientId,
    firstName,
    lastName,
    phone: clientPhone,
    treatment,
    campaign,
    status,
    recall_date,
  };
}

async function loadOwnershipIndex(supabase) {
  const [{ data: clients, error: clientError }, { data: leads, error: leadError }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id,center_id,phone,updated_at")
        .is("merged_into_client_id", null),
      supabase
        .from("leads")
        .select("id,center_id,client_id,phone,last_activity_at,updated_at"),
    ]);
  if (clientError) {
    throw new Error(clientError.message);
  }
  if (leadError) {
    throw new Error(leadError.message);
  }
  return ownershipFromRows({ clients, leads });
}

async function loadCenterConversationLists(supabase) {
  const { data: centers, error } = await supabase
    .from("centers")
    .select("id,settings");
  if (error) {
    throw new Error(error.message);
  }
  const lists = new Map();
  const settingsById = new Map();
  for (const center of centers || []) {
    const settings = asRecord(center.settings);
    const seya = asRecord(settings.seya);
    lists.set(center.id, Array.isArray(seya.conversations) ? seya.conversations : []);
    settingsById.set(center.id, { settings, seya });
  }
  return { lists, settingsById };
}

async function applyRehomeUpdates(supabase, settingsById, planned) {
  for (const update of planned.updates) {
    const current = settingsById.get(update.centerId);
    if (!current) {
      continue;
    }
    const { error: writeError } = await supabase
      .from("centers")
      .update({
        settings: {
          ...current.settings,
          seya: {
            ...current.seya,
            conversations: update.conversations,
          },
        },
      })
      .eq("id", update.centerId);
    if (writeError) {
      throw new Error(writeError.message);
    }
  }
  return planned;
}

async function rehomeMisplacedConversations(supabase) {
  const { lists, settingsById } = await loadCenterConversationLists(supabase);
  const ownership = await loadOwnershipIndex(supabase);
  const planned = planRehome(lists, ownership);
  return applyRehomeUpdates(supabase, settingsById, planned);
}

async function rehomePhoneThread(supabase, phone, targetCenterId) {
  const last9 = last9Phone(phone);
  if (last9.length < 9 || !targetCenterId) {
    return { moved: [] };
  }
  const { lists, settingsById } = await loadCenterConversationLists(supabase);
  const ownership = new Map();
  addHome(ownership, last9, {
    centerId: targetCenterId,
    at: new Date().toISOString(),
  });
  const planned = planRehome(lists, ownership);
  if (!planned.moved.length && !planned.updates.length) {
    return planned;
  }
  return applyRehomeUpdates(supabase, settingsById, planned);
}

module.exports = {
  conversationsForCenter,
  exactPhoneRows,
  filterOwnedConversations,
  loadOwnedPhones,
  loadPhoneHomes,
  ownershipFromRows,
  pickPhoneHome,
  planRehome,
  rehomeMisplacedConversations,
  rehomePhoneThread,
  resolveCenterFromPhone,
  stampCenter,
};
