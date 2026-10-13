const OpenAI = require("openai");
const {
  agentSettings,
  applyBookingMessage,
  applyLeadReply,
  asksLocation,
  asksPrice,
  emptySlotFallback,
  faqReply,
  guardSlots,
  hasMedicalFlag,
  humanSlotReply,
  isJunkTreatment,
  isOptOut,
  asksAccess,
  centerPlaceReply,
  formatCenterProfilePrompt,
  pickSlotsForState,
  visitDurationMinutes,
  conversationCabinId,
  matchProposedSlot,
  mergeQualification,
  extractNeed,
  applyCareSwitch,
  message,
  priceReply,
  resolveOfferLabel,
  resolveOpeningOffer,
  resolveTreatmentUrl,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
  threadHasMedical,
} = require("./agent");
const {
  enforceOutgoingText,
  replyHasForbiddenSlots,
  shouldSearchSlots,
  slotAllowed,
} = require("./booking-state");
const { classifyHealthMessage, isAwaitingHealthReview } = require("./health");
const { classifyPriceQuestion, isPriceRepeatComplaint, isNearDuplicate } = require("./price");
const {
  asksOtherDay,
  isRereadAsk,
  isWrongCenter,
  crmUpdateFromLeadMessage,
  isAlreadyBookedElsewhere,
  isRescheduleAsk,
  offeredSlots,
  wantsNoon,
  wantsSlots,
  isWillComeBack,
  isWillCallBack,
  isThreadComplaint,
  withStaffOfferedSlots,
  hasDayOfMonthRequest,
} = require("./conversation");
const { understandThread } = require("./care-family");
const {
  activeLeadPause,
  cityFromAddress,
  confirmsOtherCity,
  hasOpenQuestion,
  isPauseRequest,
  leadCityMention,
  locationCheckReply,
  otherCityReply,
  pauseReply,
  resumesBooking,
  sameCity,
  stripBookingPush,
  withLeadPause,
} = require("./lead-pause");
const {
  canBookSeya,
  isWelcomeRelanceOnly,
  resolveSeyaMission,
  seyaMissionPrompt,
} = require("./mission");

function seyaModel() {
  const requested = String(process.env.OPENAI_MODEL || "").trim();
  if (!requested || requested === "gpt-4o-mini") {
    return "gpt-4o";
  }
  return requested;
}

function hasAiKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

const PAUSED_FALLBACK = "Nous restons disponibles si vous avez des questions 😊";

function guardedReply(conversation, text, reply) {
  return {
    conversation: {
      ...conversation,
      messages: [
        ...(conversation.messages || []),
        message("lead", text),
        message("seya", reply),
      ],
      updatedAt: new Date().toISOString(),
    },
    shouldBook: null,
    via: "rules",
  };
}

function holdBookingPush(result, pause) {
  const messages = [...(result.conversation.messages || [])];
  const index = messages.map((item) => item.author).lastIndexOf("seya");
  if (index >= 0) {
    messages[index] = {
      ...messages[index],
      text: stripBookingPush(messages[index].text) || PAUSED_FALLBACK,
    };
  }
  return {
    ...result,
    shouldBook: null,
    conversation: withLeadPause({ ...result.conversation, messages }, pause),
  };
}

async function generateSeyaReply(input) {
  const { text, centerAddress } = input;
  const at = (input.now instanceof Date ? input.now : new Date()).toISOString();
  let conversation = input.conversation;
  const centerCity = cityFromAddress(centerAddress);

  const pendingCity = conversation.locationCheck?.leadCity || "";
  if (pendingCity) {
    conversation = { ...conversation, locationCheck: null };
    if (centerCity && confirmsOtherCity(text, pendingCity) && !hasOpenQuestion(text)) {
      return guardedReply(
        withLeadPause(conversation, { at, reason: "autre_ville", text }),
        text,
        otherCityReply(centerCity),
      );
    }
  }

  const leadCity = leadCityMention(text);
  if (leadCity && centerCity && !sameCity(leadCity, centerCity)) {
    return guardedReply(
      {
        ...conversation,
        locationCheck: { leadCity, at },
        proposedSlots: [],
        bookingState: { ...(conversation.bookingState || {}), lastOfferedSlots: [] },
      },
      text,
      locationCheckReply(centerCity, leadCity),
    );
  }

  const pausing = isPauseRequest(text);
  const handledComeBack = isWillComeBack(text) || isWillCallBack(text);
  if (pausing && !hasOpenQuestion(text) && !handledComeBack) {
    return guardedReply(
      withLeadPause(conversation, { at, reason: "reflexion", text }),
      text,
      pauseReply(conversation, text),
    );
  }
  const previousPause = resumesBooking(text) ? null : activeLeadPause(conversation);
  const pause = pausing ? { at, reason: "reflexion", text } : previousPause;
  if (pause) {
    const held = await generateCoreReply({
      ...input,
      conversation: withLeadPause(conversation, pause),
      slots: [],
      appointments: undefined,
    });
    return holdBookingPush(held, pause);
  }

  const result = await generateCoreReply({ ...input, conversation });
  return conversation.leadPause
    ? { ...result, conversation: { ...result.conversation, leadPause: null } }
    : result;
}

async function generateCoreReply({
  conversation,
  text,
  seya,
  slots,
  centerName,
  appointments,
  hours,
  centerAddress,
  centerId,
  now,
}) {
  conversation = withStaffOfferedSlots(conversation, now);
  const previousLead = [...(conversation.messages || [])]
    .reverse()
    .find((item) => item.author === "lead")?.text;
  const intentText =
    isRereadAsk(text) && previousLead ? previousLead : text;
  const bookingState = applyBookingMessage(conversation.bookingState, intentText, {
    centerId: centerId || conversation.centerId,
    now,
    conversation,
  });
  const conversationWithState = {
    ...conversation,
    centerId: centerId || conversation.centerId || bookingState.centerId,
    bookingState,
  };
  const allowRepeat =
    asksOtherDay(intentText) ||
    hasDayOfMonthRequest(intentText) ||
    /lundi|mardi|mercredi|jeudi|vendredi|samedi|debut de semaine|fin de semaine|fin de journee|soir|apres.?midi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
      String(intentText || ""),
    );
  const health = classifyHealthMessage(intentText);
  const rawSlots =
    canBookSeya(seya) &&
    shouldSearchSlots(bookingState, intentText, conversationWithState) &&
    !health.personal &&
    !health.general &&
    !isAwaitingHealthReview(conversationWithState)
      ? Array.isArray(appointments)
        ? pickSlotsForState(
            appointments,
            hours,
            {
              ...bookingState,
              cabinId: conversationCabinId(seya, conversationWithState, intentText),
            },
            now,
            visitDurationMinutes(seya, conversationWithState, intentText),
          )
        : slots || []
      : [];
  const allowDateFallback = rawSlots.some(
    (slot) => bookingState.requestedDate && slot.date !== bookingState.requestedDate,
  );
  const guarded = guardSlots(rawSlots, bookingState, {
    centerId: conversationWithState.centerId,
    allowRepeat,
    allowDateFallback,
  });
  const resolvedSlots = guarded.slots;
  const extras = {
    centerName,
    centerAddress,
    centerId: conversationWithState.centerId,
    now,
    bookingState,
    guarded,
    appointments,
    centerProfile: agentSettings(seya).centerProfile,
  };
  const fallback = applyLeadReply(conversationWithState, text, seya, resolvedSlots, extras);
  const draft = lastSeyaText(fallback.conversation);
  const previousSeya = lastSeyaText(conversation);
  if (
    !hasAiKey() ||
    health.personal ||
    fallback.shouldBook ||
    isOptOut(text) ||
    isWrongCenter(text) ||
    crmUpdateFromLeadMessage(text, now) ||
    isWillComeBack(text) ||
    isThreadComplaint(text) ||
    isAlreadyBookedElsewhere(text) ||
    isRescheduleAsk(text) ||
    wantsNoon(text) ||
    /je décale votre rendez-vous/i.test(draft || "") ||
    /pas int[eé]ress|termin[eé]|recontacter/i.test(
      String(fallback.conversation?.status || ""),
    ) ||
    asksPrice(text) ||
    classifyPriceQuestion(text) ||
    isPriceRepeatComplaint(text) ||
    /je vérifie le créneau|rendez-vous est confirmé/i.test(draft || "") ||
    /opératrice vous rappellera|transmets votre demande à l’équipe/i.test(
      draft || "",
    ) ||
    isWelcomeRelanceOnly(seya) ||
    (replyClosesThread(previousSeya) && !replyClosesThread(draft))
  ) {
    return { ...fallback, via: fallback.shouldBook ? "book" : "rules" };
  }

  try {
    const polishSlots = resolvedSlots.length
      ? resolvedSlots
      : offeredSlots(fallback.conversation, conversation.proposedSlots);
    const polished = await polishSeyaText({
      conversation: fallback.conversation,
      text,
      seya,
      slots: polishSlots,
      centerName,
      centerAddress,
      bookingState,
      draft,
    });
    return {
      ...withPolishedText(fallback, polished, bookingState),
      via: "ai",
    };
  } catch (error) {
    console.error("[seya/ai]", error);
    return { ...fallback, via: "rules" };
  }
}

async function polishSeyaText({
  conversation,
  text,
  seya,
  slots,
  centerName,
  centerAddress,
  bookingState,
  draft,
}) {
  const settings = agentSettings(seya);
  const thread = understandThread(conversation, text);
  const careHint = `${thread.need || conversation.qualification?.need || ""} ${conversation.qualification?.zone || ""} ${conversation.treatment || ""}`;
  const offer = resolveOpeningOffer(
    seya,
    conversation.campaign,
    thread.need || conversation.qualification?.need || conversation.treatment,
  );
  const careUrl = resolveTreatmentUrl(
    seya,
    conversation.campaign,
    thread.need || conversation.qualification?.need || conversation.treatment,
  );
  const brief = resolveTreatmentBrief(seya, careHint);
  const price = resolveTreatmentPrice(seya, careHint, conversation);
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 6000,
  });
  const history = (conversation.messages || [])
    .filter((item, index, list) => !(index === list.length - 1 && item.author === "seya"))
    .slice(-24)
    .map((item) => ({
      role: item.author === "lead" ? "user" : "assistant",
      content: String(item.text || "").slice(0, 500),
    }));

  const response = await client.chat.completions.create({
    model: seyaModel(),
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: polishPrompt({
          conversation,
          settings,
          seya,
          slots,
          centerName,
          offer,
          careUrl,
          brief,
          price,
          centerAddress,
          bookingState,
        }),
      },
      ...history,
      {
        role: "user",
        content: [
          `Dernier message de la cliente : ${String(text || "").slice(0, 800)}`,
          threadContext(conversation, text, thread),
          `Faits Bookea autorisés (à utiliser, pas à recopier mot pour mot) : ${String(draft || "").slice(0, 700)}`,
        ].join("\n"),
      },
    ],
  });

  return sanitizeReply(response.choices?.[0]?.message?.content);
}

function polishPrompt({
  conversation,
  settings,
  seya,
  slots,
  centerName,
  offer,
  careUrl,
  brief,
  price,
  centerAddress,
  bookingState,
}) {
  const allowedSlots = (slots || [])
    .map((slot) => slot.label)
    .filter(Boolean)
    .join(" · ");
  const centerCard = formatCenterProfilePrompt(settings.centerProfile);

  return [
    "Tu es Seya, au standard WhatsApp. Chaleureuse, naturelle, claire, vouvoiement. Tu parles comme une réceptionniste au téléphone, 1 à 3 phrases.",
    seyaMissionPrompt(settings),
    resolveSeyaMission(settings) === "welcome_relance" ||
    resolveSeyaMission(settings) === "qualify_callback"
      ? "Tu restes sur cette mission. Interdit d’improviser une autre."
      : "Ton objectif est d’accompagner jusqu’à la prise de rendez-vous, sans insister et sans coller deux fois la même réponse.",
    "Avant de répondre, tu relis tout le fil (prospect + équipe + toi), le centre concerné et l’axe du prospect (laser, minceur ou visage), y compris une relance J+15, et tu t’y tiens. Les horaires écrits par l’équipe priment. Si elle a proposé 15h et que le prospect le choisit, tu confirmes 15h : interdit de dire que ce n’est pas disponible ou de proposer 11h30/12h. Si le prospect a dit qu’il reviendrait, qu’il n’a rien cette semaine, ou que l’info était claire, tu n’as plus à demander un jour. Si le prospect a corrigé le soin (visage, minceur, laser), tu restes sur CE soin et tu n’utilises que les réglages de CE soin dans CE centre. Interdit de revenir à la campagne d’origine. Interdit de parler minceur, analyse corporelle ou cures 500€ si le fil ou le centre est laser / Dépil. Si l’axe est flou, tu poses une question courte pour le clarifier.",
    "Tu réponds au dernier message, dans ce contexte. Interdit de reposer une question déjà traitée. Interdit de recoller le dernier message Seya.",
    "Un objectif esthétique n’est pas une information de santé : rides, ridules, relâchement, taches, éclat (visage) ; kilos, ventre, graisses, cellulite, silhouette (minceur) ; zones, poils, pilosité (laser). Tu t’en sers pour qualifier le besoin et tu poursuis la mission. Interdit de transférer à l’équipe, de parler de contre-indication ou de « vérifier sa situation » pour ça. Seule une vraie information de santé (grossesse en cours, traitement médical, maladie, pacemaker…) suit les consignes santé de la fiche du soin, sans diagnostic ni verdict de compatibilité. Tu ne poses une question de santé que si elle figure dans la fiche du soin de CE centre.",
    "Tu présentes uniquement l’offre, le prix, la durée et les modalités enregistrés pour CE centre et CE soin. Si une information manque, tu ne la prends jamais d’un autre centre et tu ne l’inventes pas.",
    "Pas de phrase de remplissage du type « En attendant, si vous avez des questions sur le prix, l’adresse ou les horaires, n’hésitez pas ». Une seule question par message.",
    "Priorité absolue : tu réponds d’abord à ce que la personne vient de dire (question, précision, ville, demande de réfléchir). La trame commerciale passe toujours après. Si elle donne sa ville et qu’elle n’est pas celle du centre, tu dis où se trouve le centre et tu lui demandes si elle cherchait un centre dans sa ville. Interdit d’inventer un autre centre, une adresse ou un transfert.",
    "Si elle veut réfléchir, dit qu’elle reviendra vers vous, qu’elle recontactera ou « pas pour le moment » : tu respectes sa pause. Interdit de demander ses disponibilités, de proposer un créneau ou un rendez-vous. Ce n’est pas un refus définitif : tu restes chaleureuse et disponible pour ses questions.",
    conversation.leadPause
      ? "Le prospect a demandé une pause : tu réponds seulement à son message, sans aucune question sur ses disponibilités et sans proposer de créneau, tant qu’elle ne redemande pas elle-même un rendez-vous."
      : "",
    "Le texte Bookea est une fiche de faits autorisés, pas un script. Si Bookea propose un créneau ou pose une question alors que la cliente n’a pas demandé ça, tu ne le recopies pas.",
    resolveSeyaMission(settings) === "qualify_callback"
      ? "Tu ne clôtures pas tant qu’il manque le jour ou l’heure. Dès que les deux sont connus, la seule conclusion autorisée est : « Une opératrice vous rappellera [jour] à [heure]. » Interdit de poser un RDV agenda."
      : "Tu ne mets jamais fin à la conversation. Interdit : « écrivez-moi quand vous voulez reprendre », « je vous prie », « je reviendrai vers vous », « une conseillère vous recontacte », « préférez-vous en rester là », « vous préférez rester là », « Avec plaisir, à bientôt » si elle n’a pas dit merci après un rendez-vous confirmé. Si elle confirme qu’elle est au bon centre (Dépil, Vichy), tu continues sur sa vraie demande (prix, créneau), tu ne clôtures pas.",
    canBookSeya(settings)
      ? "Tu ne pousses jamais à sortir du circuit. Pas de question fermée du type rester là / arrêter / clore. Tu restes gentiment sur la prise de rendez-vous."
      : "Interdit de proposer, confirmer ou bloquer un créneau agenda.",
    "Si elle dit aujourd’hui, un jour, 9h, oui merci, oui toujours, fin de journée, après-midi, ou « relis ce que je t’ai demandé », tu réponds à ÇA : un horaire déjà proposé, ou de nouveaux créneaux autorisés. Tu ne redemandes pas la zone.",
    "Tu ne dis jamais qu’il n’y a plus de créneau si des horaires autorisés sont listés plus bas.",
    "Si elle choisit 9h / 9h00 alors que 09h00 a été proposé, tu confirmes ce créneau.",
    "Si elle dit oui toujours après « l’horaire vous convient », tu confirmes l’horaire déjà vu. Tu ne clôtures pas.",
    "Si elle dit oui, ok, d’accord ou merci après qu’on lui a proposé de regarder les disponibilités, tu proposes des créneaux autorisés. Tu ne répètes pas « plus de place ».",
    "Si elle dit fin de journée, tu proposes des horaires en fin de journée parmi les créneaux autorisés, pas 12h.",
    "Si elle dit qu’elle ne veut pas qu’on la recontacte mais demande un créneau, une proposition ou un prix, tu réponds à ÇA. Tu ne clôtures pas.",
    "Si elle a réfléchi et demande le prix, tu donnes le tarif autorisé. Tu n’envoies pas « écrivez-moi quand vous voulez reprendre ».",
    "Après le message d’accueil (ne le réécris pas), tu lis sa réponse et tu t’intéresses à ELLE. Une phrase qui reprend ce qu’elle vient de dire, puis UNE seule question. Minceur / laser / visage : 1) reconnaître la zone ou l’objectif, 2) demander la distance par rapport au centre, 3) demander ce qu’elle a déjà essayé (régime, techno, première fois), 4) seulement ensuite demander les disponibilités. Tu ne sautes une étape que si elle l’a déjà donnée, ou si elle demande déjà un jour / un horaire. Tu ne promets pas de résultat. Tu ne cites que les soins de CE centre.",
    "Quand le besoin est compris, tu demandes les disponibilités simplement. Mission rappel experte : « Envoyez-moi vos disponibilités et une de nos expertes vous recontactera. » Mission prise de rendez-vous : tu cherches un créneau autorisé. Si elle a déjà donné un jour ou une heure, tu n’y reviens pas.",
    "Si elle refuse l’horaire posé ou demande à modifier, tu ne dis jamais que tu vas décaler sans que Bookea lance vraiment le nouveau créneau. « Midi » = 12h00. Interdit de clore par « à bientôt » si l’heure n’a pas été changée.",
    "Si elle demande si vous faites une prestation (yoga face, massage, etc.), tu réponds d’abord à ÇA. Si ce n’est pas dans les soins du centre, tu dis non, clairement. Interdit de répondre « je reste là si une question vous vient » alors qu’elle vient de poser une question.",
    "Si elle dit qu’elle a déjà pris le rendez-vous, qu’elle vient de réserver, ou qu’elle a booké sur Planity ou un autre agenda, tu confirmes que c’est noté et tu n’offres plus aucun créneau. Tu ne redemandes pas un jour ni un horaire.",
    "Si elle préfère recontacter elle-même, sans autre demande, tu dis seulement : « D’accord, aucun souci, je vous laisse revenir vers nous quand ça sera le moment pour vous. Je vous souhaite une belle journée / une bonne soirée :) ». Pas de créneau, pas de jour.",
    "Si Bookea cite des horaires ou demande un jour, tu gardes cette étape. Tu ne remplaces jamais ça par un au revoir.",
    "Tu ne changes aucun fait. Tu n’inventes ni jour, ni heure, ni prix, ni adresse, ni résultat médical.",
    "Pas de liste 1) 2) 3). Pas de « Lead Meta ». Un smiley au plus, pas à chaque message. Tu ne termines pas chaque phrase par une question.",
    `Centre : ${centerName || "le centre"}.`,
    `Prospect : ${conversation.firstName || "le prospect"}.`,
    offer ? `Offre à nommer : ${offer}.` : "Ne nomme pas une offre inventée.",
    careUrl
      ? `Lien du soin (seulement si on te le demande, jamais dans le premier message) : ${careUrl}`
      : "",
    settings.brief || seya.brief ? `Consignes du centre : ${settings.brief || seya.brief}` : "",
    centerCard
      ? `Fiche de CE centre uniquement (jamais JFG Clinic ni un autre établissement) :\n${centerCard}`
      : "Aucune fiche centre : tu ne parles que du nom et de l’adresse fournis. Interdit d’inventer une enseigne, un parking, un concept ou une autre clinique.",
    "Tu n’énumères pas cette fiche. Tu t’en sers seulement si on te pose une question sur le centre, l’accès, le concept, ou pour rassurer avant le rendez-vous.",
    brief ? `Consignes pour ce soin : ${brief}` : "",
    price ? `Tarif autorisé (seulement si le brouillon en parle) : ${price}` : "Aucun tarif. N’en invente pas.",
    centerAddress
      ? `Adresse autorisée (seulement si le brouillon en parle) : ${centerAddress}.`
      : "Adresse inconnue : ne l’invente pas.",
    allowedSlots
      ? `Seuls créneaux citables : ${allowedSlots}. Aucun autre jour ni aucune autre heure.`
      : "Aucun créneau à proposer. N’invente pas d’horaire.",
    bookingState?.requestedDate
      ? `Jour demandé : ${bookingState.requestedDate}. Interdit d’en proposer un autre.`
      : "",
    bookingState?.rejectedDates?.length
      ? `Jours refusés : ${bookingState.rejectedDates.join(", ")}.`
      : "",
    "Si le brouillon ne cite pas de créneau, tu n’en cites pas non plus.",
    "Réponds uniquement avec le texte WhatsApp, sans guillemets ni JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

function threadContext(conversation, text, thread) {
  const understood = thread || understandThread(conversation, text);
  const qualification = conversation?.qualification || {};
  const state = conversation?.bookingState || {};
  const previousSeya = previousSeyaText(conversation);
  const known = [
    understood.need || qualification.need
      ? `soin ${understood.need || qualification.need}`
      : "",
    qualification.zone ? `zone ${qualification.zone}` : "",
    state.weekHalf === "end"
      ? "fin de semaine"
      : state.weekHalf === "start"
        ? "début de semaine"
        : "",
    state.dayPart === "evening"
      ? "fin de journée"
      : state.dayPart === "afternoon"
        ? "après-midi"
        : state.dayPart === "morning"
          ? "matin"
          : "",
  ].filter(Boolean);
  const offered = offeredSlots(conversation)
    .map((slot) => slot.label)
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  return [
    understood.summary ? `Fil relu : ${understood.summary}` : "",
    previousSeya
      ? `Dernier message Seya (ne pas le recoller, ne pas reposer la même question) : ${String(previousSeya).slice(0, 400)}`
      : "",
    known.length ? `Déjà établi dans ce fil : ${known.join(" · ")}.` : "",
    offered ? `Disponibilités déjà évoquées : ${offered}.` : "",
    `Réponds à : ${String(text || "").slice(0, 400)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function previousSeyaText(conversation) {
  const texts = (conversation?.messages || [])
    .filter((item) => item.author === "seya")
    .map((item) => String(item.text || "").trim())
    .filter(Boolean);
  if (texts.length >= 2) {
    return texts[texts.length - 2];
  }
  return "";
}

function lastSeyaText(conversation) {
  return (
    [...(conversation?.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function pickSafeReply(draft, polished, bookingState, conversation) {
  const candidate = sanitizeReply(polished);
  if (!candidate || candidate.length < 8) {
    return draft;
  }
  if (mentionsHealthHandoff(candidate) && !mentionsHealthHandoff(draft)) {
    return draft;
  }
  if (replyHasForbiddenSlots(candidate, bookingState)) {
    console.error("[seya/ai] polish_blocked", {
      centerId: bookingState?.centerId,
      requestedDate: bookingState?.requestedDate,
      preview: candidate.slice(0, 160),
    });
    return draft;
  }
  if (replyClosesThread(candidate) && !replyClosesThread(draft)) {
    return draft;
  }
  if (replyPushesExit(candidate) && !replyPushesExit(draft)) {
    return draft;
  }
  if (replyDropsBooking(draft, candidate)) {
    return draft;
  }
  if (replyPushesAfterPause(draft, candidate)) {
    return draft;
  }
  if (
    /quelle zone|zone souhaitez/i.test(candidate) &&
    !/quelle zone|zone souhaitez/i.test(draft) &&
    /\d{1,2}\s*h|semaine|jour|creneau|créneau/i.test(draft)
  ) {
    return draft;
  }
  if (
    /pas de (creneau|disponib)|reprendre contact/i.test(candidate) &&
    !/pas de (creneau|disponib)|reprendre contact/i.test(draft)
  ) {
    return draft;
  }
  const previous = previousSeyaText(conversation);
  if (previous && isNearDuplicate(candidate, previous) && !isNearDuplicate(draft, previous)) {
    return draft;
  }
  return candidate;
}

function replyClosesThread(text) {
  return /reviendrai vers vous|vous recontacte|je vous laisse|je clos le sujet|une conseill[eè]re du centre, elle|ecrivez[- ]moi quand|reprendre (la conversation|contact)|quand vous (voulez|souhaitez) reprendre|je vous prie[,.]|pas de creneaux disponibles|ravie que cela vous convienne|reste disponible si vous avez|d['’]autres questions|avec plaisir[,.]? a bientot|tres bien[,.]? a bientot/i.test(
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
}

function replyPushesExit(text) {
  const needle = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /en rester la|preferez-vous (en )?rester|vous preferez (en )?rester|on en reste la/.test(
    needle,
  );
}

function replyDropsBooking(draft, polished) {
  const draftBooks = /\d{1,2}\s*h\d{0,2}|quel jour vous irait|debut de semaine|je peux vous proposer/i.test(
    String(draft || ""),
  );
  const polishedBooks = /\d{1,2}\s*h\d{0,2}|quel jour vous irait|debut de semaine|je peux vous proposer/i.test(
    String(polished || ""),
  );
  return draftBooks && !polishedBooks;
}

function replyPushesAfterPause(draft, polished) {
  const draftPauses = /aucun souci|prenez le temps|n['’]avance pas|je reste disponible|c['’]est note|on vous attend|pas de probleme/i.test(
    String(draft || ""),
  );
  const polishedPushes = /quel jour|dites-moi un jour|je vous r[eé]serve|on fixe|creneau|créneau|pas besoin d['’]etre sur place/i.test(
    String(polished || ""),
  );
  return draftPauses && polishedPushes;
}

function withPolishedText(result, polished, bookingState) {
  const conversation = result.conversation;
  const messages = [...(conversation.messages || [])];
  const index = [...messages].map((item) => item.author).lastIndexOf("seya");
  if (index < 0) {
    return result;
  }
  const draft = messages[index].text;
  const safe = pickSafeReply(draft, polished, bookingState, conversation);
  if (safe === draft) {
    return result;
  }
  messages[index] = { ...messages[index], text: safe };
  return {
    ...result,
    conversation: { ...conversation, messages },
  };
}

function applyAiDecision(conversation, text, seya, slots, decision, extras = {}) {
  const settings = agentSettings(seya);
  const bookingState = extras.bookingState || applyBookingMessage(conversation.bookingState, text, {
    centerId: extras.centerId || conversation.centerId,
    now: extras.now,
    conversation,
  });
  const allowRepeat =
    asksOtherDay(text) ||
    /lundi|mardi|mercredi|jeudi|vendredi|samedi|debut de semaine|fin de semaine|fin de journee|soir|apres.?midi|dispo|creneau|créneau|1er|octobre|\d{1,2}\/\d{1,2}/i.test(
      String(text || ""),
    );
  const guarded = extras.guarded || guardSlots(slots, bookingState, {
    centerId: extras.centerId || conversation.centerId,
    allowRepeat,
  });
  const safeSlots = shouldSearchSlots(bookingState, text, conversation) ? guarded.slots : [];
  const spokenNeed = extractNeed(text);
  const thread = understandThread(conversation, text);
  const qualification = {
    ...mergeQualification(
      {
        ...(conversation.qualification || {}),
        ...(thread.need ? { need: thread.need } : {}),
      },
      text,
      conversation.treatment,
      conversation,
    ),
    ...(decision.need && !isJunkTreatment(decision.need) && !spokenNeed
      ? { need: decision.need }
      : {}),
    ...(decision.zone &&
    !(spokenNeed === "Soin visage" && /visage/i.test(decision.zone))
      ? { zone: decision.zone }
      : {}),
    ...(decision.delay ? { delay: decision.delay } : {}),
    ...(decision.availability ? { availability: decision.availability } : {}),
  };
  const refuses = isOptOut(text);
  let action = refuses ? "stop" : decision.action;
  if (threadHasMedical(conversation, text) || hasMedicalFlag(text)) {
    action = "handoff";
  }
  if (
    (asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text) || asksLocation(text) || asksAccess(text) || faqReply(text, { seya, conversation })) &&
    (action === "stop" || action === "propose_slots" || action === "book")
  ) {
    action = "continue";
  }

  if ((action === "book" || action === "propose_slots") && !canBookSeya(settings)) {
    action = resolveSeyaMission(settings) === "qualify_callback"
      ? "continue"
      : settings.askForAppointment || settings.handoffToHuman
        ? "handoff"
        : "continue";
  }

  const chosenSlot =
    (action === "book" && decision.slotIndex
      ? conversation.proposedSlots?.[decision.slotIndex - 1] ||
        safeSlots?.[decision.slotIndex - 1]
      : null) ||
    matchProposedSlot(text, conversation.proposedSlots, { confirmYes: true }) ||
    matchProposedSlot(text, conversation.bookingState?.lastOfferedSlots, {
      confirmYes: true,
    }) ||
    matchProposedSlot(text, safeSlots);

  if (action === "stop") {
    return sealAiResult(
      withMessages(conversation, qualification, "Pas intéressé", text, decision.reply || "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous."),
      bookingState,
    );
  }

  if (action === "handoff") {
    const medical = threadHasMedical(conversation, text);
    const alreadyFlagged = conversation.status === "À recontacter" && !hasMedicalFlag(text);
    const handoffReply = medical
      ? alreadyFlagged
        ? "Je transmets cette préférence à l’équipe, elle reviendra vers vous après vérification."
        : "Il faut que l’équipe vérifie votre situation avant de confirmer. Je leur transmets pour voir si c’est adapté."
      : "Parfait, je transmets à l’équipe, elle vous recontacte rapidement.";
    return sealAiResult(
      withMessages(
        conversation,
        qualification,
        "À recontacter",
        text,
        decision.reply && !medical ? decision.reply : handoffReply,
      ),
      bookingState,
    );
  }

  if (
    action === "book" &&
    chosenSlot &&
    canBookSeya(settings) &&
    !threadHasMedical(conversation, text) &&
    slotAllowed(chosenSlot, bookingState)
  ) {
    return sealAiResult(
      {
        ...withMessages(
          conversation,
          qualification,
          "RDV pris",
          text,
          `Je vérifie le planning et je vous confirme ${chosenSlot.label}.`,
        ),
        bookedSlot: chosenSlot,
        proposedSlots: conversation.proposedSlots || safeSlots || [],
      },
      { ...bookingState, appointmentStatus: "proposed" },
      chosenSlot,
    );
  }

  if (action === "propose_slots" && canBookSeya(settings) && wantsSlots(text, conversation)) {
    if (!safeSlots.length) {
      return sealAiResult(
        withMessages(
          conversation,
          qualification,
          "Qualifié",
          text,
          guarded.fallback || emptySlotFallback(bookingState),
        ),
        { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" },
      );
    }
    return sealAiResult(
      {
        ...withMessages(conversation, qualification, "RDV proposé", text, humanSlotReply(safeSlots, bookingState)),
        proposedSlots: safeSlots,
      },
      {
        ...bookingState,
        lastOfferedSlots: safeSlots,
        appointmentStatus: "proposed",
        pendingQuestion: null,
      },
    );
  }

  const fallbackReply =
    faqReply(text, { seya, conversation }) ||
    (asksLocation(text) || asksAccess(text)
      ? centerPlaceReply(text, extras, seya)
      : asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)
        ? priceReply(
            seya,
            qualification,
            { ...applyCareSwitch(conversation, qualification), bookingState },
            text,
          )
        : "Merci. Dites-moi le soin ou la zone, je m’occupe de la suite.");
  const reply =
    faqReply(text, { seya, conversation }) || asksLocation(text) || asksAccess(text) || asksPrice(text) || classifyPriceQuestion(text) || isPriceRepeatComplaint(text)
      ? fallbackReply
      : decision.reply || fallbackReply;

  return sealAiResult(
    withMessages(
      conversation,
      qualification,
      qualification.need ? "Qualifié" : "En cours",
      text,
      reply,
    ),
    bookingState,
  );
}

function withMessages(conversation, qualification, status, leadText, seyaText) {
  const switched = applyCareSwitch(conversation, qualification);
  return {
    ...switched,
    qualification,
    status,
    messages: [
      ...(conversation.messages || []),
      message("lead", leadText),
      message("seya", seyaText),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function sealAiResult(conversationOrResult, bookingState, shouldBook = null) {
  const conversation = conversationOrResult.messages
    ? conversationOrResult
    : conversationOrResult.conversation;
  const messages = [...(conversation.messages || [])];
  const last = messages[messages.length - 1];
  if (last?.author === "seya") {
    const safe = enforceOutgoingText(last.text, bookingState);
    if (safe !== last.text) {
      messages[messages.length - 1] = { ...last, text: safe };
      return {
        conversation: {
          ...conversation,
          messages,
          status: conversation.status === "RDV proposé" ? "Qualifié" : conversation.status,
          proposedSlots: [],
          bookingState: { ...bookingState, lastOfferedSlots: [], appointmentStatus: "none" },
        },
        shouldBook: null,
      };
    }
  }
  return {
    conversation: {
      ...conversation,
      messages,
      bookingState,
    },
    shouldBook: shouldBook && slotAllowed(shouldBook, bookingState) ? shouldBook : null,
  };
}

function sanitizeReply(value) {
  return stripFillerSentences(
    String(value || "")
      .replace(/^["«\s]+|["»\s]+$/g, "")
      .replace(/offre\s*\d+/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 700);
}

const FILLER_SENTENCE =
  /^(en attendant,?\s*)?(si vous avez (des|d['’]autres|la moindre|une) questions?|n['’]h[ée]sitez pas|je reste (à votre disposition|disponible) (pour|si)|je peux (aussi |également )?vous répondre sur le prix)/i;

function stripFillerSentences(text) {
  const sentences = String(text || "").match(/[^.!?]+[.!?]*\s*(?:[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\s*)*/gu);
  if (!sentences || sentences.length < 2) {
    return String(text || "").trim();
  }
  const kept = sentences.filter((sentence) => !FILLER_SENTENCE.test(sentence.trim()));
  return (kept.length ? kept : sentences).join("").replace(/\s+/g, " ").trim();
}

function mentionsHealthHandoff(text) {
  return /v[ée]rifi\w* (votre|ta) situation|contre-indication|avis m[ée]dical|votre (sant[ée]|m[ée]decin)|transmet\w* votre question|raison m[ée]dicale/i.test(
    String(text || ""),
  );
}

function cleanField(value) {
  const text = String(value || "").trim();
  if (!text || /offre\s*\d+|lead meta|meta lead/i.test(text)) {
    return "";
  }
  return text.slice(0, 80);
}

module.exports = {
  applyAiDecision,
  generateSeyaReply,
  hasAiKey,
  pickSafeReply,
};
