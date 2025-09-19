// === CONFIG ===
const API_URL = "PEGAR_AQUI_TU_WEBAPP_URL";

function saveSession(user){ localStorage.setItem('od_user', JSON.stringify(user)); }
function getSession(){ try{ return JSON.parse(localStorage.getItem('od_user')||'null'); }catch{ return null; } }
function clearSession(){ localStorage.removeItem('od_user'); }

function applyTheme(theme){
  if(!theme) return;
  const r = document.documentElement;
  if (theme.themeBg)     r.style.setProperty('--bg', theme.themeBg);
  if (theme.themePanel)  r.style.setProperty('--panel', theme.themePanel);
  if (theme.themeAccent) r.style.setProperty('--accent', theme.themeAccent);
}

async function apiPost(payload){
  if(!API_URL || API_URL.includes("PEGAR_AQUI")) throw new Error("Falta API_URL");
  const res = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  return await res.json();
}

async function doLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  const msg = document.getElementById('loginMsg');
  msg.textContent = 'Validando…';
  try{
    const r = await apiPost({ action:'login', email, password });
    if(!r.ok){ msg.textContent = r.error || 'Error'; return; }
    const user = { email: r.user.email, themeBg: r.user.themeBg, themePanel: r.user.themePanel, themeAccent: r.user.themeAccent };
    saveSession(user);
    applyTheme(user);
    msg.textContent = 'OK. Redirigiendo…';
    setTimeout(()=> location.href = './index.html', 500);
  }catch(err){
    msg.textContent = 'No se pudo conectar';
  }
}
document.getElementById('btnLogin')?.addEventListener('click', doLogin);

document.getElementById('btnApplyTheme')?.addEventListener('click', ()=>{
  const theme = {
    themeBg: document.getElementById('themeBg').value,
    themePanel: document.getElementById('themePanelColor').value,
    themeAccent: document.getElementById('themeAccent').value,
  };
  applyTheme(theme);
  const s = getSession(); if(s) saveSession({ ...s, ...theme });
  const tm = document.getElementById('themeMsg'); if(tm) tm.textContent='Aplicado localmente';
});
document.getElementById('btnSaveTheme')?.addEventListener('click', async ()=>{
  const s = getSession();
  const tm = document.getElementById('themeMsg');
  if(!s?.email){ tm.textContent='Iniciá sesión para guardar'; return; }
  const theme = {
    themeBg: document.getElementById('themeBg').value,
    themePanel: document.getElementById('themePanelColor').value,
    themeAccent: document.getElementById('themeAccent').value,
  };
  try{
    const r = await apiPost({ action:'setTheme', email: s.email, theme });
    if(r.ok){ saveSession({ ...s, ...theme }); tm.textContent='Guardado en tu cuenta ✅'; }
    else { tm.textContent = 'No se pudo guardar: '+(r.error||''); }
  }catch{ tm.textContent='No se pudo conectar'; }
});

function protectPage(){
  const isLogin = location.pathname.endsWith('login.html');
  if(isLogin) return;
  const s = getSession();
  if(!s?.email){
    location.href = './login.html';
  } else {
    applyTheme(s);
    (async()=>{
      try{
        const r = await apiPost({ action:'getTheme', email: s.email });
        if(r.ok && r.theme){
          applyTheme(r.theme);
          saveSession({ ...s, ...r.theme });
        }
      }catch{}
    })();
  }
}
protectPage();

(function activateNav(){
  const route = location.pathname.includes('reporte') ? 'reporte' : 'index';
  document.querySelectorAll('.navlink').forEach(a=>{
    if(a.dataset.route === route) a.classList.add('active');
  });
})();

document.getElementById('btnLogout')?.addEventListener('click', ()=>{
  clearSession();
  location.href = './login.html';
});
