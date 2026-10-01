const {
  clientAllowsSms,
  createServiceClient,
  defaultSender,
  findClientByPhone,
  mergeCenterSmsSettings,
  parseCenterSmsSettings,
  personalize,
  readSmsQuota,
  sendBrevoSms,
} = require("./brevo");

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }
  return String(req.headers.authorization || "") === `Bearer ${secret}`;
}

function isDue(sendAt) {
  const timestamp = new Date(sendAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function markHistorySent(history, campaignId, sent) {
  const current =
    history && typeof history === "object" ? history : { campaigns: [] };
  const campaigns = Array.isArray(current.campaigns) ? current.campaigns : [];
  return {
    ...current,
    campaigns: campaigns.map((item) =>
      Number(item?.id) === Number(campaignId)
        ? { ...item, status: "Envoyé", recipients: sent }
        : item,
    ),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const supabase = createServiceClient();
    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,settings");
    if (error) {
      throw new Error(error.message);
    }

    let sent = 0;
    let failed = 0;

    for (const center of centers || []) {
      const sms = parseCenterSmsSettings(center.settings);
      const pending = (sms.jobs || []).filter(
        (job) =>
          job?.kind === "campaign" &&
          job?.status === "pending" &&
          isDue(job.sendAt),
      );
      if (pending.length === 0) {
        continue;
      }

      const quotaState = readSmsQuota(sms);
      let history = sms.history;
      const nextJobs = [];

      for (const job of sms.jobs || []) {
        if (
          job?.kind !== "campaign" ||
          job?.status !== "pending" ||
          !isDue(job.sendAt)
        ) {
          nextJobs.push(job);
          continue;
        }

        const recipients = Array.isArray(job.recipients) ? job.recipients : [];
        const leftover = [];
        let jobSent = 0;

        for (const recipient of recipients) {
          if (quotaState.remaining <= 0) {
            leftover.push(recipient);
            continue;
          }

          try {
            const matchedClient = await findClientByPhone(
              supabase,
              recipient.phone,
            );
            if (matchedClient && !clientAllowsSms(sms, matchedClient.id)) {
              continue;
            }
            await sendBrevoSms({
              sender: defaultSender(),
              recipient: recipient.phone,
              content: personalize(job.message, {
                firstName: recipient.firstName || "vous",
                centerName: center.name || "",
              }),
              type: "marketing",
            });
            jobSent += 1;
            sent += 1;
            quotaState.remaining -= 1;
            quotaState.usedThisMonth += 1;
          } catch (sendError) {
            leftover.push(recipient);
            failed += 1;
            console.error(
              "[sms/campaign-dispatch]",
              sendError instanceof Error ? sendError.message : sendError,
            );
          }
        }

        if (leftover.length > 0) {
          nextJobs.push({
            ...job,
            recipients: leftover,
            sentCount: Number(job.sentCount || 0) + jobSent,
          });
        } else {
          nextJobs.push({
            ...job,
            status: "sent",
            sentAt: new Date().toISOString(),
            sentCount: Number(job.sentCount || 0) + jobSent,
            recipients: [],
          });
          history = markHistorySent(
            history,
            job.campaignId,
            Number(job.sentCount || 0) + jobSent,
          );
        }
      }

      await supabase
        .from("centers")
        .update({
          settings: mergeCenterSmsSettings(center.settings, {
            jobs: nextJobs,
            history,
            quota: {
              remaining: quotaState.remaining,
              lastGrantMonth: quotaState.lastGrantMonth,
              monthlyGrant: quotaState.monthlyGrant,
              usedThisMonth: quotaState.usedThisMonth,
            },
          }),
        })
        .eq("id", center.id);
    }

    return res.status(200).json({
      ok: true,
      endpoint: "sms/campaign-dispatch",
      sent,
      failed,
    });
  } catch (error) {
    console.error("[sms/campaign-dispatch]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "campaign_dispatch_failed",
    });
  }
};
