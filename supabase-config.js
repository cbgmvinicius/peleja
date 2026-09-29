// Configuração pública do Supabase para o Peleja.
// A publishable/anon key pode ficar no frontend; NUNCA coloque a service_role key aqui.
globalThis.PELEJA_BACKEND = {
  supabaseUrl: 'https://vnncoohcmvvxgvvstnst.supabase.co',
  supabasePublishableKey: 'sb_publishable_gnNboZD3F1cI5zKJseEezA_gz79D-Qz',
  // Opcional: o servidor fornece o UUID de Vinícius pelo roster de contas fixas.
  // Nunca usar nome de exibição, papel ou ordem de login para identificar o histórico.
  legacyOwnerUserId: '',
};
