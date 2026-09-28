function centerSlugCandidates(slug) {
  const raw = String(slug || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return [];
  }
  const aliases = {
    "jfg-clinique-clermont": "jfg-clinic-clermont",
    "jfg-clinique-clermont-ferrand": "jfg-clinic-clermont",
    "jfg-clinique-clermontferrand": "jfg-clinic-clermont",
    "jfg-clinic-clermont-ferrand": "jfg-clinic-clermont",
  };
  const next = [raw];
  if (aliases[raw]) {
    next.push(aliases[raw]);
  }
  if (raw.includes("clinique")) {
    next.push(raw.replace(/clinique/g, "clinic"));
  }
  if (/\bclinic\b/.test(raw) || raw.includes("-clinic-")) {
    next.push(raw.replace(/clinic/g, "clinique"));
  }
  return [...new Set(next.filter(Boolean))];
}

async function findCenterBySlug(supabase, slug, columns = "id,name,slug,settings") {
  for (const candidate of centerSlugCandidates(slug)) {
    const { data, error } = await supabase
      .from("centers")
      .select(columns)
      .eq("slug", candidate)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data?.id) {
      return data;
    }
  }
  return null;
}

module.exports = {
  centerSlugCandidates,
  findCenterBySlug,
};
