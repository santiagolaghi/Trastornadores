# TNT regression checks

Run DOM tests from the repository root with Node 22 or later and jsdom 26.1.0 / acorn 8.15.0 on NODE_PATH:

```sh
node --test tests/regression.cjs
```

The browser fixtures contain synthetic people and in-memory data only. `__preview__` is temporary and is removed before production. The Vercel deployment excludes tests and database migrations.

Validated on 26 September 2026:

- Active HTML scripts parse; every module has one central runtime and its shared components.
- Assigned activities are highlighted; other activities stay neutral. Filters and calendar dates work.
- Native task details retain checklists, responses, editing and replacement tools.
- Chat shows roster, shared reactions and per-room drafts. Failed writes preserve the draft; a retry sends once.
- Task editing preserves the form on errors and serializes Buenos Aires time.
- Hub counters use live assignments and authorized modules only.
- SQL transactions verified recurrence generation, idempotency and off setting; contextual chat permissions, roster access without recursive policies, peer reactions and prevented self promotion; event duplication; atomic task/calendar/team updates and deletion. Test transactions were rolled back.
- Existing Supabase advisor warnings concern the bootstrap table, pg_trgm extension schema, existing guarded public helpers and password protection. No new public definer function was added. See https://supabase.com/docs/guides/database/database-linter for the existing notices.

Authenticated Google login is preserved. Browser UI review uses a separate synthetic fixture; it does not impersonate the user's session or send real messages.
