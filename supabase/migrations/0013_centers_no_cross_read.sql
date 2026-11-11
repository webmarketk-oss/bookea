-- Un centre connecté ne lit que ses propres fiches.
-- La fiche publique reste lisible par les visiteurs non connectés.
-- L'équipe Bookea conserve la lecture de tous les centres.

drop policy if exists "centers_public_read" on public.centers;
create policy "centers_public_read"
on public.centers
for select
to anon
using (public_profile_enabled = true);

drop policy if exists "centers_bookea_admin_select" on public.centers;
create policy "centers_bookea_admin_select"
on public.centers
for select
to authenticated
using (public.is_bookea_admin());
