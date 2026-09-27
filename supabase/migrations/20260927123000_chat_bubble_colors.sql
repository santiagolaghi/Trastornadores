-- A small fixed palette keeps messages legible in both themes.
alter table public.tnt_chat_messages
  add column if not exists bubble_color text;
alter table public.tnt_chat_messages
  drop constraint if exists tnt_chat_messages_bubble_color_check;
alter table public.tnt_chat_messages
  add constraint tnt_chat_messages_bubble_color_check
  check (bubble_color is null or bubble_color in ('lime','lilac','peach','sky','rose','neutral'));
