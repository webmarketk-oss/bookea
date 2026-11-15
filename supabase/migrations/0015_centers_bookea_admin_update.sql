-- L'admin Bookea voit tous les centres (0013) mais ne pouvait pas enregistrer
-- leurs réglages : la seule policy UPDATE était centers_managers_update
-- (propriétaire / manager du centre). Ajouter un soin Seya, le planning ou
-- toute autre écriture de centers.settings échouait donc en silence (0 ligne).

drop policy if exists "centers_bookea_admin_update" on public.centers;
create policy "centers_bookea_admin_update"
on public.centers
for update
to authenticated
using (public.is_bookea_admin())
with check (public.is_bookea_admin());
