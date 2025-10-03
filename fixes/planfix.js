(function(){
  const LS_SETTINGS = 'planmes_settings_v2';
  const LS_SUELDOS  = 'planmes_sueldos_v2';

  let DATA = [];
  let MES  = '';
  let PLAN = { objetivo:990000, pctAlq:40, pctRep:40, pctArr:20, franqHoras:0, franqTarifa:0 };
  let SUELDOS = [];

  const fmt = (n)=> new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  const clamp=(n,min,max)=> Math.max(min, Math.min(max,n));
  const toDate = (s)=>{ if(!s) return null; const t=String(s).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
    if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
    const d=new Date(t); return isNaN(d)? null:d; };
  const ymKey = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  function loadLS(){ try{ const s=JSON.parse(localStorage.getItem(LS_SETTINGS)||'null'); if(s) PLAN={...PLAN,...s}; }catch{};
                     try{ const s2=JSON.parse(localStorage.getItem(LS_SUELDOS)||'null'); if(Array.isArray(s2)) SUELDOS=s2; }catch{}; }
  function saveLS(){ localStorage.setItem(LS_SETTINGS, JSON.stringify(PLAN)); localStorage.setItem(LS_SUELDOS, JSON.stringify(SUELDOS)); }

  function buildMesOptions(){
    const set = new Set(DATA.map(r=>r.ym));
    const opts = [...set].sort().reverse();
    const sel = document.getElementById('mesFiltro'); if(!sel) return;
    sel.innerHTML = opts.map(k=>{ const [yy,mm]=k.split('-'); return `<option value="${k}">${mm}/${yy}</option>`; }).join('');
    if(opts.length && !MES) MES = opts[0];
    sel.value = MES;
    const lab = document.getElementById('planMesLabel'); if(lab) lab.textContent = sel.options[sel.selectedIndex]?.text || '-';
  }

  function calcular(){
    const rows = DATA.filter(r=>r.ym===MES);
    const ventas = rows.reduce((a,x)=> a + (Number(x.total)||0), 0);
    const pctAlq= clamp(Number(PLAN.pctAlq||0),0,100);
    const pctRep= clamp(Number(PLAN.pctRep||0),0,100);
    const pctArr= clamp(Number(PLAN.pctArr||0),0,100);
    const pctLibre = clamp(100 - (pctAlq+pctRep+pctArr), -100, 100);
    const destinado = Math.round(ventas * pctAlq/100);
    const falta     = Math.max(0, Number(PLAN.objetivo||0) - destinado);
    const repMonto  = Math.round(ventas * pctRep/100);
    const arrMonto  = Math.round(ventas * pctArr/100);
    const libre     = Math.max(0, ventas - (destinado + repMonto + arrMonto));
    const totalSueldos = SUELDOS.reduce((a,s)=> a + (Number(s.monto)||0), 0);
    const totalFr      = Math.round(Number(PLAN.franqHoras||0) * Number(PLAN.franqTarifa||0));
    return { ventas, pctLibre, destinado, falta, repMonto, arrMonto, libre, totalSueldos, totalFr };
  }

  function ensureSueldoProgressUI(){
    const anchor = document.getElementById('totalSueldos')?.parentElement;
    if (!anchor || document.getElementById('sueldosBar')) return;
    const wrap = document.createElement('div');
    wrap.className = "mt-3";
    wrap.innerHTML = `
      <div class="text-slate-600 mb-1">Cobertura de sueldos con recaudado del mes</div>
      <div style="height:10px;border-radius:999px;background:#eef2f7;overflow:hidden">
        <span id="sueldosBar" style="display:block;height:100%;width:0%;background:#111827"></span>
      </div>
      <div class="text-sm text-slate-600 mt-1">
        Falta: <span id="sueldosCoberturaFalta">$0</span>
        · Cobertura: <span id="sueldosCoberturaPct">0%</span>
      </div>
    `;
    anchor.appendChild(wrap);
  }

  function render(){
    ensureSueldoProgressUI();
    const c = calcular();

    const setText=id=> (val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    const setVal =id=> (val)=>{ const el=document.getElementById(id); if(el) el.value=val; };

    setText('planMesLabel')(document.getElementById('mesFiltro')?.selectedOptions?.[0]?.text || '-');
    setVal('alqObjetivo')(PLAN.objetivo);
    setVal('alqPct')(PLAN.pctAlq);
    setVal('repPct')(PLAN.pctRep);
    setVal('arrPct')(PLAN.pctArr);
    setVal('franqHoras')(PLAN.franqHoras);
    setVal('franqTarifa')(PLAN.franqTarifa);

    setText('alqDestinado')(fmt(c.destinado));
    setText('repMonto')(fmt(c.repMonto));
    setText('arrMonto')(fmt(c.arrMonto));
    setText('libreMonto')(fmt(c.libre));
    setText('sueldosTotal')(fmt(c.totalSueldos));
    setText('franqTotal')(fmt(c.totalFr));
    setText('pctLibre')(`${c.pctLibre}%`);

    const prog = (Number(PLAN.objetivo||0)>0) ? Math.max(0, Math.min(100, Math.round((c.destinado/Number(PLAN.objetivo))*100))) : 0;
    const bar = document.getElementById('alqBar'); if(bar) bar.style.width = prog + '%';
    setText('alqPctProgreso')(`${prog}%`);

    const cobertura = (c.totalSueldos>0) ? Math.min(100, Math.round((c.ventas / c.totalSueldos) * 100)) : 0;
    const faltaSuel = Math.max(0, c.totalSueldos - c.ventas);
    const sb = document.getElementById('sueldosBar');
    const sp = document.getElementById('sueldosCoberturaPct');
    const sf = document.getElementById('sueldosCoberturaFalta');
    if (sb) sb.style.width = cobertura + '%';
    if (sp) sp.textContent = `${cobertura}%`;
    if (sf) sf.textContent = fmt(faltaSuel);
  }

  function renderSueldos(){
    const ul = document.getElementById('sueldosList');
    if(!ul) return;
    if(SUELDOS.length===0){
      ul.innerHTML = `<li class="text-sm text-slate-500">No hay sueldos cargados.</li>`;
      document.getElementById('sueldosTotal')?.replaceChildren(document.createTextNode(fmt(0)));
      return;
    }
    ul.innerHTML = SUELDOS.map((s,i)=>`
      <li class="flex items-center justify-between rounded-lg border px-3 py-2">
        <span>${s.nombre}</span>
        <span>${fmt(s.monto)}</span>
        <button data-del="${i}" class="px-2 py-1 text-xs rounded-lg border">Borrar</button>
      </li>
    `).join('');
    const tot = SUELDOS.reduce((a,s)=> a + (Number(s.monto)||0), 0);
    document.getElementById('sueldosTotal')?.replaceChildren(document.createTextNode(fmt(tot)));
  }

  function bindEvents(){
    const selMes = document.getElementById('mesFiltro');
    if(selMes){ selMes.addEventListener('change', ()=>{ MES=selMes.value; const lab=document.getElementById('planMesLabel'); if(lab) lab.textContent = selMes.options[selMes.selectedIndex]?.text||'-'; render(); }); }
    ['alqObjetivo','alqPct','repPct','arrPct','franqHoras','franqTarifa'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.addEventListener('input', ()=>{
        PLAN.objetivo   = Number(document.getElementById('alqObjetivo')?.value||PLAN.objetivo);
        PLAN.pctAlq     = Number(document.getElementById('alqPct')?.value||PLAN.pctAlq);
        PLAN.pctRep     = Number(document.getElementById('repPct')?.value||PLAN.pctRep);
        PLAN.pctArr     = Number(document.getElementById('arrPct')?.value||PLAN.pctArr);
        PLAN.franqHoras = Number(document.getElementById('franqHoras')?.value||PLAN.franqHoras);
        PLAN.franqTarifa= Number(document.getElementById('franqTarifa')?.value||PLAN.franqTarifa);
        saveLS(); render();
      });
    });
    const btnAdd = document.getElementById('btnAddSueldo');
    if(btnAdd){ btnAdd.addEventListener('click', ()=>{
      const nombre = prompt('Nombre del sueldo (ej: Maxi / Javier / Matías):','');
      if(!nombre) return;
      const monto = Number(prompt('Monto ARS:','0')||0);
      SUELDOS.push({nombre, monto});
      saveLS(); renderSueldos(); render();
    });}
    const ul = document.getElementById('sueldosList');
    if(ul){ ul.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-del]'); if(!btn) return;
      const idx = Number(btn.getAttribute('data-del'));
      SUELDOS.splice(idx,1);
      saveLS(); renderSueldos(); render();
    });}
  }

  function tryAdoptGlobalRows(){
    try{
      const g = (window && window.ROWS) ? window.ROWS : null;
      if(!Array.isArray(g) || g.length===0) return false;
      DATA = g.map(r=>{
        const d = r.date ? new Date(r.date) : (r.ts ? toDate(r.ts) : null);
        if(!d || isNaN(d)) return null;
        const total = Number(r.total || r.Total || 0);
        return { date:d, ym: ymKey(d), total };
      }).filter(Boolean);
      buildMesOptions();
      render();
      return true;
    }catch(e){ return false; }
  }

  function parseCSVAndRender(){
    const url = document.getElementById('csvUrl')?.value?.trim();
    if(!url || !window.Papa) return;
    window.Papa.parse(url,{
      download:true, header:true, skipEmptyLines:true,
      complete:(res)=>{
        try{
          DATA = (res.data||[]).map(r=>{
            const ts = r.timestamp || r.fecha || r.Fecha || r.Timestamp || r['Fecha (ISO)'] || '';
            const d  = toDate(ts);
            if(!d) return null;
            const total = Number(r.total || r.Total || r.monto || r.Monto || r.importe || r.Importe || 0);
            return {date:d, ym: ymKey(d), total};
          }).filter(Boolean);
          buildMesOptions(); render();
        }catch(e){ console.error(e); }
      }
    });
  }

  function init(){
    loadLS(); bindEvents(); renderSueldos();
    let adopted = false;
    const start = Date.now();
    const timer = setInterval(()=>{
      if(tryAdoptGlobalRows()){ adopted = true; clearInterval(timer); return; }
      if(Date.now() - start > 8000){ clearInterval(timer); if(document.getElementById('csvUrl')?.value){ parseCSVAndRender(); } }
    }, 400);
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); }
  else{ init(); }
})();