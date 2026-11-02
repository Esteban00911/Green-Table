-- À exécuter dans Supabase > SQL Editor, SEULEMENT si le message d'erreur
-- affiché dans l'app parle de "recursion" ou de "permission denied / row-level security".
-- Adapte les noms de colonnes si ton schéma est différent (room_id, user_id).

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room and user_id = auth.uid()
  );
$$;

drop policy if exists "members read players" on public.room_players;
create policy "members read players" on public.room_players
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members read rooms" on public.poker_rooms;
create policy "members read rooms" on public.poker_rooms
  for select to authenticated
  using (public.is_room_member(id));
