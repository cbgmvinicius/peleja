(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = globalThis.PELEJA_ACCESS_CONFIG;
  let mode = 'login', busy = false, revision = 0, session = null, recovering = false;
  const redirect = new URL('../../', location.href).href;
  const entry = active => { $('entrySplash').hidden=!active;document.body.classList.toggle('entry-busy',active); };
  const message = (text = '', error = false) => { $('message').textContent = text; $('message').dataset.error = String(error); };
  const failure = error => {
    const code = error?.code || '';
    if (code === 'invalid_credentials') return 'Usuário ou senha incorretos.';
    if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
    if (/rate|over_.*limit/.test(code)) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    if (/signup_disabled/.test(code)) return 'O cadastro está fechado no momento. Fale com o administrador.';
    if (/weak_password/.test(code)) return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.';
    return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
  };
  let viewMotion=[];
  function view(next) {
    const card=document.querySelector('.card'),oldHeight=card.getBoundingClientRect().height,animate=next!==mode&&next!=='account'&&mode!=='account'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewMotion.forEach(a=>a.cancel());viewMotion=[];
    mode = next; message();$('tabs').style.setProperty('--selected',next==='signup'?1:0);
    $('form').hidden = next === 'account'; $('account').hidden = next !== 'account';
    $('tabs').hidden = !['login','signup'].includes(next);
    $('forgot').hidden = next !== 'login'; $('back').hidden = !['reset','signup'].includes(next);
    $('heading').textContent = ({login:'Bom te ver por aqui.',signup:'Vamos começar.',reset:'Recuperar acesso',password:'Sua nova senha',account:'Você está conectado.'})[next];
    $('identity').hidden = next === 'password'; $('identityLabel').hidden = next === 'password';
    $('identity').required = next !== 'password'; $('identity').type = next === 'signup' ? 'email' : 'text';
    $('identityLabel').textContent = next === 'signup' ? 'E-mail' : 'Usuário ou e-mail';
    $('passwordGroup').hidden = next === 'reset'; $('password').required = next !== 'reset';
    $('password').minLength = ['signup','password'].includes(next) ? 8 : 1;
    $('password').autocomplete = next === 'login' ? 'current-password' : 'new-password';
    $('password').value = ''; $('confirm').value = ''; $('password').type = 'password';
    $('reveal').textContent = 'Mostrar'; $('reveal').setAttribute('aria-pressed','false');
    $('confirmGroup').hidden = !['signup','password'].includes(next); $('confirm').required = !$('confirmGroup').hidden;
    $('hint').hidden = !['signup','reset'].includes(next);
    $('hint').textContent = next === 'signup' ? 'O acesso à turma depende de autorização.' : 'Informe o e-mail cadastrado ou seu usuário.';
    $('submit').textContent = ({login:'Entrar',signup:'Criar conta',reset:'Enviar link',password:'Salvar senha'})[next] || 'Entrar';
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode === next)));
    if(animate&&card.animate){viewMotion.push($('heading').animate([{opacity:.25},{opacity:1}],{duration:220}));const height=card.getBoundingClientRect().height;viewMotion.push(card.animate([{height:oldHeight+'px'},{height:height+'px'}],{duration:320,easing:'cubic-bezier(.22,.8,.25,1)'}));viewMotion.push($('form').animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'}));}
  }
  function lock(value) { busy = value; $('form').setAttribute('aria-busy',String(value)); document.querySelectorAll('button:not(#theme),input').forEach(el => el.disabled = value); }
  const cfgValid = config?.key?.startsWith('sb_publishable_') && /^https:\/\//.test(config?.url);
  if (!globalThis.supabase?.createClient || !cfgValid) { lock(true); message('Não foi possível carregar o acesso. Recarregue a página.',true); return; }
  const db = supabase.createClient(config.url,config.key,{auth:{storageKey:'peleja-next-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  async function inspect(current) {
    const ticket = ++revision;
    session = current;
    globalThis.PELEJA_READER?.clear();
    $('summary').replaceChildren(); $('accountName').textContent = '';
    if (recovering) return;
    if (!current) { entry(false); if (mode === 'account' || mode === 'password') view('login'); return; }
    entry(true);view('account'); $('accountState').textContent = 'Conferindo seu acesso…';
    try {
      const access = await db.rpc('has_peleja_access');
      if (ticket !== revision) return;
      if (access.error) throw access.error;
      if (access.data !== true) { entry(false); $('accountState').textContent = 'Sua conta ainda precisa ser autorizada pelo administrador.'; return; }
      const profile = await db.from('profiles').select('id,display_name,role').eq('id',current.user.id).maybeSingle();
      if (ticket !== revision) return;
      if (profile.error) throw profile.error;
      $('accountName').textContent = profile.data?.display_name || 'Conta autorizada';
      const workspace = await db.rpc('get_workspace');
      if (ticket !== revision) return;
      if (workspace.error) throw workspace.error;
      const payload = workspace.data?.payload;
      location.replace(new URL('../directions/',location.href).href);return;
      $('accountState').textContent = payload ? 'Seu histórico está pronto.' : 'Acesso autorizado. Ainda não há histórico pessoal salvo na nuvem.';
      if (payload) for (const [key,label] of [['materials','Assuntos'],['exams','Provas'],['simulations','Simulados']]) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = Array.isArray(payload[key]) ? payload[key].length : 0; $('summary').append(dt,dd);
      }
    } catch(error) { if (ticket === revision) { entry(false);$('accountState').textContent = 'Não foi possível conferir seu histórico.'; message(failure(error),true); } }
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click',() => { if (!busy) view(button.dataset.mode); }));
  $('theme').onclick = () => { document.documentElement.classList.toggle('dark'); try { localStorage.setItem('peleja-access-theme',document.documentElement.classList.contains('dark')?'dark':'light'); } catch {} };
  try { document.documentElement.classList.toggle('dark',localStorage.getItem('peleja-access-theme') === 'dark'); } catch {}
  $('reveal').onclick = () => { const visible = $('password').type === 'password'; $('password').type = visible?'text':'password'; $('reveal').textContent = visible?'Ocultar':'Mostrar'; $('reveal').setAttribute('aria-pressed',String(visible)); };
  $('form').onsubmit = async event => {
    event.preventDefault(); if (busy || !$('form').reportValidity()) return;
    const action = mode, identity = $('identity').value.trim().toLowerCase(), password = $('password').value;
    if (['signup','password'].includes(action) && password !== $('confirm').value) return message('As senhas precisam ser iguais.',true);
    if (action === 'reset' && (!identity.includes('@') || identity.endsWith('@peleja.invalid'))) return message('Sua conta usa um usuário sem e-mail de recuperação. Peça ao administrador para redefinir a senha.');
    lock(true); message();if(action==='login')entry(true);
    try {
      let result;
      if (action === 'login') {
        const email = identity.includes('@') ? identity : identity.normalize('NFD').replace(/[\u0300-\u036f]/g,'')+'@peleja.invalid';
        result = await db.auth.signInWithPassword({email,password});
      } else if (action === 'signup') {
        if (identity.endsWith('.invalid')) { message('Use um e-mail que possa receber a confirmação.',true); return; }
        result = await db.auth.signUp({email:identity,password,options:{emailRedirectTo:redirect}});
      } else if (action === 'reset') result = await db.auth.resetPasswordForEmail(identity,{redirectTo:redirect});
      else if (action === 'password' && recovering) result = await db.auth.updateUser({password});
      else return;
      if (result.error) throw result.error;
      $('password').value = ''; $('confirm').value = '';
      if (action === 'reset') message('Se houver uma conta com esse e-mail, você receberá o link de recuperação.');
      else if (action === 'signup' && !result.data.session) message('Confira seu e-mail para continuar o cadastro.');
      else if (action === 'password') { recovering = false; await inspect(session); message('Senha atualizada.'); }
      else if (result.data?.session) await inspect(result.data.session);
    } catch(error) { entry(false);message(failure(error),true); }
    finally { lock(false); }
  };
  $('retry').onclick = () => inspect(session);
  $('logout').onclick = async () => {
    if (busy) return; lock(true); ++revision; globalThis.PELEJA_READER?.clear(); $('summary').replaceChildren(); $('accountName').textContent = ''; $('accountState').textContent = '';
    try { const result = await db.auth.signOut({scope:'local'}); if(result.error) throw result.error; session=null; recovering=false; view('login'); }
    catch(error) { message('Não foi possível sair. Tente novamente.',true); } finally { lock(false); }
  };
  db.auth.onAuthStateChange((event,current) => {
    // Schedule outside the SDK's auth lock; never await database calls inside this callback.
    if (event === 'SIGNED_OUT') { recovering=false; ++revision; globalThis.PELEJA_READER?.clear(); }
    if (event === 'PASSWORD_RECOVERY') { recovering = true; session=current; ++revision; view('password'); }
    else setTimeout(() => { if (event !== 'TOKEN_REFRESHED' && !recovering) inspect(current); },0);
  });
  if (new URLSearchParams(location.search).has('error') || new URLSearchParams(location.hash.slice(1)).has('error')) {
    message('O link expirou ou não é válido. Solicite um novo link.',true); history.replaceState(null,'',location.pathname);
  }
})();
