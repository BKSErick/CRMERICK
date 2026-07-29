update public.integration_settings
set
  last_event_shape = null,
  last_event_reason = null,
  last_event_at = null
where provider = 'uazapi';
