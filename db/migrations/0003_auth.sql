-- 0003: Auth.js tables (ACC-2). JWT sessions, so no sessions table.
create table accounts (
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  refresh_token text null,
  access_token text null,
  expires_at int null,
  token_type text null,
  scope text null,
  id_token text null,
  session_state text null,
  primary key (provider, provider_account_id)
);
create index accounts_user_idx on accounts (user_id);

create table verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key (identifier, token)
);

alter table user_shops add constraint user_shops_user_fk foreign key (user_id) references users(id) on delete cascade;
alter table user_saved_places add constraint user_saved_places_user_fk foreign key (user_id) references users(id) on delete cascade;
