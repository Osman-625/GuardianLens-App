-- Supabase Storage buckets for GuardianLens. All buckets are private.
-- listing-images holds buyer uploads (reached only by the server-side service role); the other
-- three buckets hold the reference corpus, research photos, and model files, and only
-- administrators can read or write them.
begin;

-- Create the buckets, and force any that already exist back to private.
insert into storage.buckets (id, name, public)
values
    ('listing-images', 'listing-images', false),
    ('reference-corpus', 'reference-corpus', false),
    ('research-images', 'research-images', false),
    ('model-artifacts', 'model-artifacts', false)
on conflict (id) do update set public = false;

-- Drop any earlier policies so this file can be applied more than once.
drop policy if exists guardianlens_admin_storage_read on storage.objects;
drop policy if exists guardianlens_admin_storage_write on storage.objects;

-- Administrators may read objects in the three admin buckets.
create policy guardianlens_admin_storage_read
on storage.objects for select to authenticated
using (
    bucket_id in ('reference-corpus', 'research-images', 'model-artifacts')
    and public.is_guardianlens_admin()
);

-- Administrators may also add, change, and delete objects in the same three buckets.
create policy guardianlens_admin_storage_write
on storage.objects for all to authenticated
using (
    bucket_id in ('reference-corpus', 'research-images', 'model-artifacts')
    and public.is_guardianlens_admin()
)
with check (
    bucket_id in ('reference-corpus', 'research-images', 'model-artifacts')
    and public.is_guardianlens_admin()
);

commit;
