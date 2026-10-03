const { createClient } = require("@supabase/supabase-js");
const { createServiceClient, parsePayload, rateLimit } = require("../appointments/service");
const { sanitizeProfileInput } = require("./account-lib");
const { loadAccount, requireUser } = require("./account");

function createAnonAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyCurrentPassword(email, password) {
  const auth = createAnonAuthClient();
  const { error } = await auth.auth.signInWithPassword({ email, password });
  return !error;
}

function profileErrorStatus(code) {
  if (code === "first_name_required" || code === "invalid_email" || code === "invalid_birthdate") {
    return 400;
  }
  if (code === "password_too_short" || code === "password_mismatch") {
    return 400;
  }
  if (code === "current_password_required" || code === "wrong_password") {
    return 400;
  }
  return 400;
}

function profileErrorMessage(code) {
  const messages = {
    first_name_required: "Indiquez votre prénom.",
    invalid_email: "Cet email n’est pas valide.",
    invalid_birthdate: "La date de naissance n’est pas valide.",
    password_too_short: "Le mot de passe doit contenir au moins 6 caractères.",
    password_mismatch: "Les deux mots de passe ne correspondent pas.",
    current_password_required: "Saisissez votre mot de passe actuel pour le changer.",
    wrong_password: "Le mot de passe actuel est incorrect.",
  };
  return messages[code] || "Impossible d’enregistrer le profil.";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createServiceClient();
    const user = await requireUser(supabase, req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!rateLimit(`client-settings:${user.id}`, 20, 60_000)) {
      return res.status(429).json({ error: "too_many_requests" });
    }

    const profile = sanitizeProfileInput(parsePayload(req.body));
    if (profile.error) {
      return res.status(profileErrorStatus(profile.error)).json({
        error: profile.error,
        message: profileErrorMessage(profile.error),
      });
    }

    const currentEmail = String(user.email || "").trim().toLowerCase();
    const emailChanged = profile.email !== currentEmail;
    if (profile.newPassword || emailChanged) {
      if (!profile.currentPassword) {
        return res.status(400).json({
          error: "current_password_required",
          message: profileErrorMessage("current_password_required"),
        });
      }
      const ok = await verifyCurrentPassword(currentEmail, profile.currentPassword);
      if (!ok) {
        return res.status(400).json({
          error: "wrong_password",
          message: profileErrorMessage("wrong_password"),
        });
      }
    }

    const authUpdate = {
      email: profile.email,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: profile.fullName,
        first_name: profile.firstName,
        last_name: profile.lastName,
        birthdate: profile.birthDate || null,
        address: profile.address || null,
        postal_code: profile.postalCode || null,
        city: profile.city || null,
        account_type: "client",
      },
    };
    if (profile.newPassword) {
      authUpdate.password = profile.newPassword;
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(
      user.id,
      authUpdate,
    );
    if (authError) {
      throw new Error(authError.message);
    }

    await supabase
      .from("profiles")
      .update({
        email: profile.email,
        full_name: profile.fullName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    const { data: clientRows } = await supabase
      .from("clients")
      .select("id")
      .or(`profile_user_id.eq.${user.id},email.eq.${currentEmail}`)
      .is("merged_into_client_id", null);

    const clientIds = (clientRows || []).map((row) => row.id);
    if (clientIds.length > 0) {
      const { error: clientError } = await supabase
        .from("clients")
        .update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          email: profile.email,
          birthdate: profile.birthDate || null,
          address_line1: profile.address || null,
          postal_code: profile.postalCode || null,
          city: profile.city || null,
          profile_user_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", clientIds);
      if (clientError) {
        throw new Error(clientError.message);
      }
    }

    const account = await loadAccount(supabase, {
      ...user,
      email: profile.email,
      user_metadata: authUpdate.user_metadata,
    });
    return res.status(200).json({ ok: true, account });
  } catch (error) {
    console.error("[client/settings]", error);
    return res.status(500).json({ error: "settings_failed" });
  }
};
