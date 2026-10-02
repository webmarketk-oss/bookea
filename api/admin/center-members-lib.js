function normalizeAttachEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isAttachableEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAttachEmail(value));
}

function memberFromProfile(profile, role) {
  return {
    profileId: profile.id,
    email: profile.email || "",
    name: profile.full_name || "Utilisateur Bookea",
    role: role || "owner",
  };
}

module.exports = {
  isAttachableEmail,
  memberFromProfile,
  normalizeAttachEmail,
};
