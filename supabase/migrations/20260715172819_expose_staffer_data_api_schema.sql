-- Expose the Staffer schema through Supabase Data API for supabase-js `.schema("staffer")` calls.
-- Preserves the schemas already configured on the authenticator role.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, StoryTeller, staffer';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
