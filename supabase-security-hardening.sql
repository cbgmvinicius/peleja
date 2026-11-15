-- rls_auto_enable() is an event-trigger function; nobody should call it through the REST API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
