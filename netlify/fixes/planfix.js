
/**
 * planfix.js — Parche no intrusivo para que funcione el widget "Plan del mes"
 * sin tocar el resto del reporte. Usa los mismos IDs ya presentes en el HTML.
 * Guarda y lee configuración de localStorage.
 */
(function(){
  const LS_SETTINGS = 'planmes_settings_v2';
  const LS_SUELDOS  = 'planmes_sueldos_v2';

  // ---- Estado ----
  let DATA = [];         // filas {date, ym, total}
  let MES  = '';         // 'yyyy-mm'
  let PLAN = {
    objetivo: 990000,
    pctAlq:   40,
    pctRep:   40,
    pctArr:   20,
    franqHoras: 0,
    franqTarifa: 0,
  };
  let SUELDOS = [];      // [{nombre, monto}]

  // ---- Utils ----
  const $ = (sel)=> document.querySelector(sel);
  const $$ = (sel)=> Array.from(document.querySelectorAll(sel));
  const fmt = (n)=> new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  const clamp=(n,min,max)=> Math.max(min, Math.min(max,n));
  const toDate = (s)=>{
    if(!s) return null;
    const t= String(s).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
    if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
    const d=new Date(t); return isNaN(d)? null: d;
  };
  const ymKey = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  // ---- Persistencia ----
  function loadLS(){
    try{ const s = JSON.parse(localStorage.getItem(LS_SETTINGS)||'null'); if(s) PLAN = {...PLAN, ...s}; }catch{}
    try{ const s2= JSON.parse(localStorage.getItem(LS_SUELDOS )||'null'); if(Array.isArray(s2)) SUELDOS = s2; }catch{}
  }
  function saveLS(){
    localStorage.setItem(LS_SETTINGS, JSON.stringify(PLAN));
    localStorage.setItem(LS_SUELDOS,  JSON.stringify(SUELDOS));
  }

  // ---- Render ----
  function buildMesOptions(){
    const set = new Set(DATA.map(r=>r.ym));
    const arr = [...set].sort().reverse();
    const sel = $('#mesFiltro');
    if(!sel) return;
    sel.innerHTML = arr.map(k=>{
      const [yy,mm] = k.split('-');
      return `<option value="${k}">${mm}/${yy}</option>`;
    }).join('');
    if(arr.length && !MES) MES = arr[0];
    sel.value = MES;
    const lab = $('#planMesLabel'); if(lab){ lab.textContent = sel.options[sel.selectedIndex]?.text || '-'; }
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

    return { ventas, pctAlq, pctRep, pctArr, pctLibre, destinado, falta, repMonto, arrMonto, libre, totalSueldos, totalFr };
  }

  function render(){
    const c = calcular();

    const setText=(id,val)=>{ const el = document.getElementById(id); if(el) el.textContent = val; };
    const setVal =(id,val)=>{ const el = document.getElementById(id); if(el) el.value = val; };

    // labels
    setText('planMesLabel', ($('#mesFiltro')?.selectedOptions?.[0]?.text)||'-');
    setVal('alqObjetivo', PLAN.objetivo);
    setVal('alqPct', PLAN.pctAlq);
    setVal('repPct', PLAN.pctRep);
    setVal('arrPct', PLAN.pctArr);
    setVal('franqHoras', PLAN.franqHoras);
    setVal('franqTarifa', PLAN.franqTarifa);

    // montos
    setText('alqCostoMes', fmt(c.ventas));
    setText('alqDestinado', fmt(c.destinado));
    setText('alqFalta', fmt(c.falta));
    setText('repMonto', fmt(c.repMonto));
    setText('arrMonto', fmt(c.arrMonto));
    setText('libreMonto', fmt(c.libre));
    setText('sueldosTotal', fmt(c.totalSueldos));
    setText('franqTotal', fmt(c.totalFr));
    setText('pctLibre', `${c.pctLibre}%`);

    // barra
    const progress = (Number(PLAN.objetivo||0)>0) ? Math.max(0, Math.min(100, Math.round((c.destinado/Number(PLAN.objetivo))*100))) : 0;
    const bar = $('#alqBar'); if(bar) bar.style.width = progress + '%';
    setText('alqPctProgreso', `${progress}%`);
  }

  // ---- Eventos ----
  function bindEvents(){
    // CSV: recargar
    const btnReload = document.getElementById('btnReload');
    if(btnReload){
      btnReload.addEventListener('click', parseCSVAndRender);
    }
    // cambio de mes
    const selMes = document.getElementById('mesFiltro');
    if(selMes){
      selMes.addEventListener('change', ()=>{ MES = selMes.value; const lab=$('#planMesLabel'); if(lab) lab.textContent = selMes.options[selMes.selectedIndex]?.text||'-'; render(); });
    }
    // inputs
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
    // sueldos
    const btnAdd = document.getElementById('btnAddSueldo');
    if(btnAdd){
      btnAdd.addEventListener('click', ()=>{
        const nombre = prompt('Nombre del sueldo (ej: Maxi / Javier / Matías):','');
        if(!nombre) return;
        const monto = Number(prompt('Monto ARS:','0')||0);
        SUELDOS.push({nombre, monto});
        saveLS(); renderSueldos(); render();
      });
    }
    const ul = document.getElementById('sueldosList');
    if(ul){
      ul.addEventListener('click', (e)=>{
        const btn = e.target.closest('[data-del]');
        if(!btn) return;
        const idx = Number(btn.getAttribute('data-del'));
        SUELDOS.splice(idx,1);
        saveLS(); renderSueldos(); render();
      });
    }
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

  // ---- CSV parse propio ----
  function parseCSVAndRender(){
    const url = document.getElementById('csvUrl')?.value?.trim();
    if(!url){ console.warn('Falta URL CSV'); return; }
    document.getElementById('diag')?.replaceChildren(document.createTextNode('Cargando CSV para Plan del mes…'));
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
          buildMesOptions();
          render();
          document.getElementById('diag')?.replaceChildren(document.createTextNode(''));
        }catch(e){
          console.error(e);
          document.getElementById('diag')?.replaceChildren(document.createTextNode(String(e)));
        }
      },
      error:(err)=>{
        console.error(err);
        document.getElementById('diag')?.replaceChildren(document.createTextNode(String(err)));
      }
    });
  }

  // ---- Init ----
  function init(){
    if(typeof window.Papa === 'undefined'){ console.warn('PapaParse no disponible todavía'); return; }
    loadLS();
    bindEvents();
    renderSueldos();
    // Intentar cargar si ya hay URL
    if(document.getElementById('csvUrl')?.value){ parseCSVAndRender(); }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
