const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyCenterOfferRoute,
  importPostedLead,
  incomingLeadFields,
  leadOrigin,
  mapIncomingLead,
  payloadFromBody,
  resolveIncomingSource,
} = require("./saveleads");
const { startConversation } = require("../seya/agent");
const {
  leadImportToolFromEvents,
  leadOfferLabel,
  leadSourceFromStored,
} = require("../../lib/lead-offer.ts");

const SAVEMYLEADS_FACEBOOK = {
  fullname: "Qayamudin Hussainkheil",
  number: "+33604434404",
  commentaire: "Ameins",
  offre: "Laser1+1",
};

const SYSTEME_IO_MEMBER = {
  event: "contact.opt_in",
  id: "evt_1",
  payload_affiliate_user_email: "webmarket.k@gmail.com",
  payload_contact_phone_number: "0611111111",
  payload_member_email: "clara@test.fr",
  payload_member_first_name: "Clara",
  payload_member_last_name: "Martin",
  payload_offer_id: "884211",
  payload_offer_reference: "minceur-vichy",
  payload_offer_title: "",
};

function importLead(payload, query, centerSettings) {
  const fields = incomingLeadFields(payload, query);
  const origin = leadOrigin(
    resolveIncomingSource(payload, query, "Facebook", {
      headers: { "user-agent": query.ua || "" },
    }),
    fields,
  );
  const mapped = applyCenterOfferRoute(mapIncomingLead(payload, query), fields, centerSettings);
  return { fields, origin, mapped };
}

function fakeSupabase() {
  const inserts = {};
  let seq = 0;
  const chain = (table) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: `${table}-${++seq}` }, error: null }),
      insert(row) {
        inserts[table] = [...(inserts[table] || []), row];
        return {
          select: () => ({
            single: async () => ({ data: { id: `${table}-${++seq}` }, error: null }),
          }),
          then: (resolve) => resolve({ error: null }),
        };
      },
    };
    return query;
  };
  return { from: chain, inserts };
}

test("SaveMyLeads Facebook : source Facebook, outil SaveMyLeads, offre Laser1+1, axe laser", () => {
  const { origin, mapped } = importLead(SAVEMYLEADS_FACEBOOK, {
    center: "depil-tech-vichy",
    source: "savemyleads",
  });
  assert.deepEqual(origin, { source: "Facebook", importTool: "SaveMyLeads" });
  assert.equal(mapped.offer, "Laser1+1");
  assert.equal(mapped.campaign, "Laser1+1");
  assert.equal(mapped.treatment, "Épilation définitive");
  assert.equal(mapped.firstName, "Qayamudin");
  assert.match(mapped.comment, /Ameins/);
});

test("SaveMyLeads repéré par son user-agent : toujours Facebook", () => {
  const { origin } = importLead(SAVEMYLEADS_FACEBOOK, { ua: "SaveMyLeads" });
  assert.deepEqual(origin, { source: "Facebook", importTool: "SaveMyLeads" });
});

test("une offre sans axe ne remplace jamais l’axe", () => {
  const withForm = mapIncomingLead({
    full_name: "Marie Dupont",
    phone: "0612345678",
    offre: "1+1 offert",
    form_name: "Épilation laser Vichy",
  });
  assert.equal(withForm.campaign, "1+1 offert");
  assert.equal(withForm.treatment, "Épilation définitive");

  const bare = mapIncomingLead({ full_name: "Marie Dupont", phone: "0612345678", offre: "Offre spéciale" });
  assert.equal(bare.campaign, "Offre spéciale");
  assert.notEqual(bare.treatment, "Offre spéciale");
});

test("Systeme.io relayé par SaveMyLeads reste Systeme.io", () => {
  const { origin, mapped } = importLead(
    { ...SYSTEME_IO_MEMBER, payload_offer_title: "Bilan minceur offert" },
    { source: "savemyleads" },
  );
  assert.deepEqual(origin, { source: "Systeme.io", importTool: "SaveMyLeads" });
  assert.equal(mapped.campaign, "Bilan minceur offert");
  assert.equal(mapped.treatment, "Soin minceur");
});

test("Systeme.io sans offre : « Soin minceur » comme axe, aucune offre inventée", () => {
  const { origin, mapped } = importLead(
    {
      first_name: "Clara",
      phone: "0611111111",
      email: "clara@test.fr",
      funnel_step: { name: "Inscription", funnel: { id: 51, name: "Minceur Vichy" } },
    },
    { source: "systeme.io" },
    {},
  );
  assert.deepEqual(origin, { source: "Systeme.io", importTool: "" });
  assert.equal(mapped.treatment, "Soin minceur");
  assert.equal(leadOfferLabel(mapped), "");
});

test("Systeme.io : correspondance tunnel → offre propre au centre, sur valeur exacte", () => {
  const vichy = {
    leadOfferRoutes: [
      { match: "minceur-vichy", offer: "Bilan minceur offert" },
      { match: "884299", offer: "Pack visage -30%" },
    ],
  };
  const fromReference = importLead(SYSTEME_IO_MEMBER, { source: "systeme.io" }, vichy).mapped;
  assert.equal(fromReference.campaign, "Bilan minceur offert");
  assert.equal(fromReference.treatment, "Soin minceur");
  assert.equal(leadOfferLabel(fromReference), "Bilan minceur offert");

  const fromUrl = importLead(
    {
      first_name: "Léa",
      phone: "0622222222",
      contact: { sourceURL: "https://depil.systeme.io/minceur-vichy?utm_source=fb" },
    },
    { source: "systeme.io" },
    vichy,
  ).mapped;
  assert.equal(fromUrl.campaign, "Bilan minceur offert");

  const otherCenter = importLead(SYSTEME_IO_MEMBER, { source: "systeme.io" }, {}).mapped;
  assert.notEqual(otherCenter.campaign, "Bilan minceur offert");

  const partial = importLead(
    { ...SYSTEME_IO_MEMBER, payload_offer_reference: "minceur-vichy-2" },
    { source: "systeme.io" },
    vichy,
  ).mapped;
  assert.notEqual(partial.campaign, "Bilan minceur offert");

  const ambiguous = importLead(
    { ...SYSTEME_IO_MEMBER, payload_offer_id: "884299" },
    { source: "systeme.io" },
    vichy,
  ).mapped;
  assert.notEqual(ambiguous.campaign, "Bilan minceur offert");
  assert.notEqual(ambiguous.campaign, "Pack visage -30%");

  const explicit = importLead(
    { ...SYSTEME_IO_MEMBER, offre: "Cryo ventre 99€" },
    { source: "systeme.io" },
    vichy,
  ).mapped;
  assert.equal(explicit.campaign, "Cryo ventre 99€");
});

test("prospect test SaveMyLeads : enregistré, affiché et transmis à Seya", async () => {
  const supabase = fakeSupabase();
  const { origin, mapped, fields } = importLead(
    payloadFromBody(SAVEMYLEADS_FACEBOOK),
    { center: "depil-tech-vichy", source: "savemyleads" },
  );
  await importPostedLead(supabase, "center-vichy", mapped, {
    sourceName: origin.source,
    importTool: origin.importTool,
    fields,
  });

  assert.equal(supabase.inserts.lead_sources[0].name, "Facebook");
  assert.equal(supabase.inserts.campaigns[0].name, "Laser1+1");
  assert.equal(supabase.inserts.services[0].name, "Épilation définitive");
  const note = supabase.inserts.lead_events[0][0].note;
  assert.match(note, /Source : Facebook\./);
  assert.match(note, /Import : SaveMyLeads\./);
  assert.match(note, /Offre : Laser1\+1\./);
  assert.match(note, /Champs reçus : .*offre/);
  assert.equal(supabase.inserts.leads[0].latest_comment, "Zone : Ameins");

  const shown = { campaign: "Laser1+1", treatment: "Épilation définitive" };
  assert.equal(leadOfferLabel(shown), "Laser1+1");
  assert.equal(leadImportToolFromEvents("Facebook", [note]), "SaveMyLeads");

  const vichySeya = {
    offerMaps: [{ match: "Laser1+1", label: "1 zone achetée = 1 zone offerte" }],
  };
  const conversation = startConversation(
    {
      leadId: "lead-1",
      firstName: mapped.firstName,
      phone: mapped.phone,
      treatment: mapped.treatment,
      campaign: mapped.campaign,
      centerId: "center-vichy",
    },
    "DEPIL TECH VICHY",
    vichySeya,
  );
  assert.equal(conversation.campaign, "Laser1+1");
  assert.equal(conversation.treatment, "Épilation définitive");
  assert.match(conversation.offerLabel, /1 zone achetée = 1 zone offerte/);

  const otherCenter = startConversation(
    { leadId: "lead-2", firstName: "Léa", phone: "0622222222", treatment: mapped.treatment, campaign: mapped.campaign },
    "JFG Clinic",
    { offerMaps: [{ match: "Soin minceur", label: "bilan minceur offert" }] },
  );
  assert.doesNotMatch(otherCenter.offerLabel, /1 zone achetée|minceur/);
  assert.match(otherCenter.offerLabel, /épilation/i);
});

test("prospect test Systeme.io : source, axe et offre du tunnel enregistrés", async () => {
  const supabase = fakeSupabase();
  const { origin, mapped, fields } = importLead(
    payloadFromBody(SYSTEME_IO_MEMBER),
    { center: "depil-tech-vichy", source: "systeme.io" },
    { leadOfferRoutes: [{ match: "minceur-vichy", offer: "Bilan minceur offert" }] },
  );
  await importPostedLead(supabase, "center-vichy", mapped, {
    sourceName: origin.source,
    importTool: origin.importTool,
    fields,
  });
  assert.equal(supabase.inserts.lead_sources[0].name, "Systeme.io");
  assert.equal(supabase.inserts.campaigns[0].name, "Bilan minceur offert");
  assert.equal(supabase.inserts.services[0].name, "Soin minceur");
  const note = supabase.inserts.lead_events[0][0].note;
  assert.doesNotMatch(note, /Import :/);
  assert.match(note, /Tunnel \/ page reçus : .*payload_offer_reference = minceur-vichy/);
  assert.doesNotMatch(note, /webmarket/);
});

test("CRM : un ancien prospect SaveMyLeads s’affiche en Facebook, l’axe seul n’est pas une offre", () => {
  assert.equal(leadSourceFromStored("SaveMyLeads"), "Facebook");
  assert.equal(leadSourceFromStored("Systeme.io"), "");
  assert.equal(leadImportToolFromEvents("SaveMyLeads", ["Lead reçu via webhook Bookea."]), "SaveMyLeads");
  assert.equal(leadOfferLabel({ campaign: "Soin minceur", treatment: "Soin minceur" }), "");
  assert.equal(leadOfferLabel({ campaign: "Meta Lead Ads", treatment: "Soin minceur" }), "");
  assert.equal(leadOfferLabel({ campaign: "Laser1+1", treatment: "Épilation définitive" }), "Laser1+1");
});
