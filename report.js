/* ========= Helpers seguros ========= */
const $fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const getEl = id => document.getElementById(id);
const setText = (id, v) => { const el = getEl(id); if (el) el.textContent = v; };
const setHTML = (id, v) => { const el = getEl(id); if (el) el.innerHTML = v; };
const setWidth = (id, pct) => { const el = getEl(id); if (el) el.style.width = `${Math.max(0,Math.min(100, Number(pct)||0))}%`; };

const toDate = (s)=>{
  if(!s) return null;
  const t=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
  if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
  const d=new Date(t); return isNaN(d)? null:d;
};
const sameYMonth = (d, y, m)=> d && d.getFullYear()===y && (d.getMonth()+1)===m;
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/* ========= Estado ========= */
let ROWS = [];
let mesSelKey = '';
let GASTOS = [];
let CHARTS = { pie:null, barQty:null, barProf:null, horas:null };

/* ========= Carga CSV ========= */
async function loadCSV(){
  const url = getEl('csvUrl') ? getEl('csvUrl').value.trim() : '';
  setText('statusBadge', 'Cargando CSV…');
  return new Promise((resolve,reject)=>{
    Papa.parse(url,{
      download:true, header:true, skipEmptyLines:true,
      complete:(res)=>{
        try{
          ROWS = (res.data||[])
            .map(r=>{
              const ts = r.timestamp || r.fecha || r.Timestamp || '';
              const d  = toDate(ts);
              if(!d) return null;
              const itemsRaw = r['items(json)'] || r.items || '[]';
              let unidades = 0;
              try{
                const arr = JSON.parse(itemsRaw||'[]');
                if(Array.isArray(arr)) unidades = arr.reduce((a,x)=> a + (Number(x.qty)||0), 0);
              }catch{}
              return {
                ts: ts,
                date: d,
                y: d.getFullYear(),
                m: d.getMonth()+1,
                metodo: (r.metodoPago || r.metodo || r.Metodo || '').toString().trim(),
                total: Number(r.total || r.Total || 0),
                totalCosto: Number(r.totalCosto || r.TotalCosto || 0),
                // si el CSV trae ganancia inconsist., la calculo mínima por ticket
                ganancia: Number(r.ganancia || r.Ganancia || (Number(r.total||0)-Number(r.totalCosto||0))),
                unidades,
                items: itemsRaw
              };
            })
            .filter(Boolean);
          buildMesOptions();
          setText('statusBadge', 'Listo');
          resolve();
        }catch(e){ reject(e); }
      },
      error: reject
    });
  });
}

function buildMesOptions(){
  const set = new Set(ROWS.map(r=>`${r.y}-${String(r.m).padStart(2,'0')}`));
  const opts = [...set].sort().reverse();
  const sel = getEl('mesFiltro'); if(!sel) return;
  sel.innerHTML = '';
  opts.forEach(key=>{
    const [yy,mm] = key.split('-').map(Number);
    const label = new Date(yy,mm-1,1).toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = label.charAt(0).toUpperCase()+label.slice(1);
    sel.appendChild(opt);
  });
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  mesSelKey = opts.includes(nowKey) ? nowKey : (opts[0]||'');
  if(mesSelKey) sel.value = mesSelKey;
  renderAll();
}

/* ========= KPIs ========= */
function monthRows(){
  if(!mesSelKey) return [];
  const [yy,mm] = mesSelKey.split('-').map(Number);
  return ROWS.filter(r => sameYMonth(r.date,yy,mm));
}
function monthAgg(){
  const rows = monthRows();
  return {
    ingresos: rows.reduce((a,r)=>a+r.total,0),
    costo:    rows.reduce((a,r)=>a+r.totalCosto,0),
    // 'gan' queda para retrocompatibilidad, pero NO lo uso para el KPI
    gan:      rows.reduce((a,r)=>a+r.ganancia,0),
    ventas:   rows.length,
    unidades: rows.reduce((a,r)=>a+r.unidades,0),
    byMethod: rows.reduce((acc,r)=>{
      const s = (r.metodo||'').toLowerCase();
      const k = s.includes('efect') ? 'efectivo' : (s.includes('mp')||s.includes('mercado')||s.includes('qr')) ? 'mp' : 'otros';
      acc[k]+=Number(r.total||0); return acc;
    },{efectivo:0, mp:0, otros:0})
  };
}

function renderKPIsMes(){
  const m = monthAgg();
  const gananciaMesCalc = Math.max(0, m.ingresos - m.costo); // ✅ Ingresos − Costo

  setText('kpiVentas', m.ventas);
  setText('kpiUnidades', m.unidades);
  setText('kpiIngresos', $fmt(m.ingresos));
  setText('kpiGananciaMes', $fmt(gananciaMesCalc));
  // distintos IDs de “Costo (mes)” según versión de tu HTML
  setText('kpiCostoMes', $fmt(m.costo));
  setText('kpi-costo-mes', $fmt(m.costo));
  setText('kpiEfectivoMes', $fmt(m.byMethod.efectivo));
  setText('kpiMpMes', $fmt(m.byMethod.mp));

  // === NUEVO: Gastos (mes) y Saldo real (mes) ===
  const gMes = gastosMesTotal();
  const saldoRealMes = Math.max(0, (m.ingresos - m.costo) - gMes);
  setText('kpiGastosMes', $fmt(gMes));
  setText('kpiSaldoRealMes', $fmt(saldoRealMes));
}

function renderKPIsDia(){
  let selDia = (getEl('diaFiltro')?.value) || '';
  if(!selDia){
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(key===mesSelKey){ selDia = now.toISOString().slice(0,10); if(getEl('diaFiltro')) getEl('diaFiltro').value = selDia; }
  }
  if(!selDia) return;

  const [yy,mm] = mesSelKey.split('-').map(Number);
  const rows = ROWS.filter(r=> sameYMonth(r.date,yy,mm) && dayKey(r.date)===selDia);

  // Filtro horario opcional (si existen los inputs)
  const hFrom=getEl('horaDesde')?.value, hTo=getEl('horaHasta')?.value;
  const inTime = (dt)=>{
    if(!hFrom && !hTo) return true;
    const hhmm = dt.toTimeString().slice(0,5);
    if(hFrom && hhmm < hFrom) return false;
    if(hTo   && hhmm > hTo)   return false;
    return true;
  };
  const r2 = rows.filter(r=> inTime(r.date));

  const ing = r2.reduce((a,r)=>a+r.total,0);
  const cos = r2.reduce((a,r)=>a+r.totalCosto,0);
  const gan = r2.reduce((a,r)=>a+r.ganancia,0);
  const uni = r2.reduce((a,r)=>a+r.unidades,0);

  // GASTOS (mantiene tu widget “Registrar gasto / Últimos gastos”)
  const gastosApi = GASTOS
    .filter(g => (g.fecha||'').slice(0,10)===selDia)
    .reduce((a,g)=> a + Number(g.subtotal || g.costo_unit || 0), 0);
  const gastosInput = Number(getEl('cierreGastos')?.value || 0);
  const gastosTot = gastosApi + gastosInput;

  setText('kpiIngDia', $fmt(ing));
  setText('kpiCostoDia', $fmt(cos));
  setText('kpiGanDia', $fmt(gan));
  setText('kpiVentasDia', r2.length);
  setText('kpiUniDia', uni);

  setText('cierreIng', $fmt(ing));
  setText('cierreCosto', $fmt(cos));
  setText('cierreBruta', $fmt(ing - cos));
  setText('cierreGastosLbl', $fmt(gastosTot));
  const neta = (ing - cos) - gastosTot;
  setText('cierreNeta', $fmt(neta));
  const personas = Math.max(1, Number(getEl('cierrePersonas')?.value||1));
  setText('cierrePorPersona', $fmt(neta/personas));

  const rango = `${selDia}${(hFrom||hTo)? ` · ${hFrom||'00:00'}–${hTo||'23:59'}`:''}`;
  setText('cierreRangoLbl', rango);
}

/* ========= Charts (no rompen si el canvas no existe) ========= */
const CAT_LABELS = ['Café','Comida','Cerveza','Gaseosa','Agua','Vino','Whisky','Tragos'];
function categorizar(nombre=''){
  const n = String(nombre).toLowerCase();
  if (/(agua(?! t[oó]nica)|eco de los andes|villavicencio|bonaqu|glaciar)/.test(n)) return 'Agua';
  if (/(cafe|café|espresso|americano|latte|capuch|cortado|moka|macchiato|frapp|flat white)/.test(n)) return 'Café';
  if (/(cerveza|birra|ipa|apa|stout|golden|pale|lager|porter|pilsen|pinta|sch)/.test(n)) return 'Cerveza';
  if (/(vino|malbec|cabernet|merlot|pinot|blend|espumante|champ|prosecco)/.test(n)) return 'Vino';
  if (/(whisky|whiskey|bourbon|scotch|jack daniels|johnnie walker|jb|chivas|ballantines|old parr)/.test(n)) return 'Whisky';
  if (/(trago|c[oó]ctel|cocktail|gin tonic|fernet|aperol|campari|negroni|mojito|caipiri|daikiri|margarita|cuba libre|vodka|tequila|gancia|cynar|spritz)/.test(n)) return 'Tragos';
  if (/(gaseosa|coca|sprite|fanta|pepsi|manaos|pomelo|cola|ginger ale|t[oó]nica|schweppes)/.test(n)) return 'Gaseosa';
  return 'Comida';
}
function renderCharts(){
  // destruir anteriores
  Object.values(CHARTS).forEach(c=>{try{c?.destroy()}catch{}});
  CHARTS = { pie:null, barQty:null, barProf:null, horas:null };

  const rows = monthRows();
  const agg = CAT_LABELS.reduce((m,c)=>{m[c]={unidades:0,gan:0}; return m;},{});
  rows.forEach(r=>{
    try{
      const arr = JSON.parse(r.items||'[]');
      if(!Array.isArray(arr)) return;
      const totalItemsImporte = arr.reduce((a,i)=> a + (Number(i.precio)||0)*(Number(i.qty)||0), 0);
      arr.forEach(i=>{
        const cat = categorizar(i.nombre||'');
        const qty = Number(i.qty)||0;
        const precio = Number(i.precio)||0;
        const costo  = Number(i.costo)||0;
        const imp = precio*qty;
        let gan = 0;
        if(costo){ gan = (precio-costo)*qty; }
        else if(totalItemsImporte>0){ gan = (r.ganancia||0) * (imp/totalItemsImporte); }
        agg[cat].unidades += qty;
        agg[cat].gan += gan;
      });
    }catch{}
  });
  const labels = CAT_LABELS;
  const qtyArr = labels.map(l=> Math.round(agg[l].unidades));
  const profArr= labels.map(l=> Math.round(agg[l].gan));

  const ctxPie = document.getElementById('chartPie')?.getContext('2d');
  if(ctxPie){
    CHARTS.pie = new Chart(ctxPie,{ type:'pie', data:{ labels, datasets:[{ data: qtyArr }] },
      options:{ plugins:{ legend:{position:'bottom'} } }});
  }
  const ctxQty = document.getElementById('chartBarQty')?.getContext('2d');
  if(ctxQty){
    CHARTS.barQty = new Chart(ctxQty,{ type:'bar', data:{ labels, datasets:[{ label:'Unidades', data: qtyArr }] },
      options:{ scales:{ y:{beginAtZero:true, ticks:{precision:0}}}, plugins:{legend:{display:false}} }});
  }
  const ctxProf = document.getElementById('chartBarProfit')?.getContext('2d');
  if(ctxProf){
    CHARTS.barProf = new Chart(ctxProf,{ type:'bar', data:{ labels, datasets:[{ label:'Ganancia (ARS)', data: profArr }] },
      options:{ scales:{ y:{beginAtZero:true}}, plugins:{legend:{display:false}} }});
  }

  // Horas (solo si existe el canvas)
  const selDia = getEl('diaFiltro')?.value;
  const rowsDia = selDia ? ROWS.filter(r=> dayKey(r.date)===selDia) : [];
  const buckets = Array.from({length:24},()=>0);
  rowsDia.forEach(r=>{ buckets[r.date.getHours()] += Number(r.total||0); });
  const ctxH = document.getElementById('chartHoras')?.getContext('2d');
  if(ctxH){
    CHARTS.horas = new Chart(ctxH,{ type:'bar',
      data:{ labels:Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00'), datasets:[{ label:'Ingresos', data:buckets }] },
      options:{ scales:{ y:{beginAtZero:true}}, plugins:{legend:{display:false}} }});
  }
}

/* ========= Gastos (conserva tus widgets) ========= */
const API = '/.netlify/functions/gs-order';

async function guardarGasto(){
  const fecha = (getEl('gFecha')?.value||'').trim();
  const categoria = (getEl('gCategoria')?.value||'Otros').trim();
  const concepto = (getEl('gConcepto')?.value||'').trim();
  const proveedor = (getEl('gProveedor')?.value||'').trim();
  const monto = Number(getEl('gMonto')?.value||0);
  const nota = (getEl('gNota')?.value||'').trim();
  if(!fecha || !concepto || !Number.isFinite(monto) || monto<=0){ alert('Completá Fecha, Concepto y un Monto válido.'); return; }
  const payload = { type:'expense', fecha, categoria_gasto:categoria, concepto, proveedor, qty:1, costo_unit:monto, nota };
  const $btn=getEl('btnGuardarGasto'); const $msg=getEl('gMsg');
  try{
    if($btn){ $btn.disabled=true; $btn.textContent='Guardando…'; } if($msg) $msg.textContent='';
    const res = await fetch(API,{ method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body: 'payload='+encodeURIComponent(JSON.stringify(payload)) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.ok!==true) throw new Error(data.error || `HTTP ${res.status}`);
    // limpiar
    if(getEl('gConcepto')) getEl('gConcepto').value='';
    if(getEl('gProveedor')) getEl('gProveedor').value='';
    if(getEl('gMonto')) getEl('gMonto').value='';
    if(getEl('gNota')) getEl('gNota').value='';
    if($msg) $msg.textContent='✅ Gasto guardado';
    await cargarGastosRecientes();
  }catch(err){ alert('No se pudo guardar el gasto: '+err.message); }
  finally{ if($btn){ $btn.disabled=false; $btn.textContent='Guardar gasto'; } }
}

async function cargarGastosRecientes(){
  try{
    // SUBIDO a 1000 para cubrir el mes entero si hay muchas compras
    const res = await fetch(`${API}?action=items&limit=1000`);
    const json = await res.json();
    if(json?.ok!==true) throw new Error(json?.error||'Error al leer ITEMS');
    GASTOS = (json.items||[]).filter(it => String(it.tipo).toLowerCase()==='compra');
    const $tb=getEl('tbodyGastos');
    if($tb){
      $tb.innerHTML = GASTOS.slice(0,200).map(r=>`
        <tr class="border-b border-gray-100">
          <td class="p-2">${(r.fecha||'').toString().slice(0,10)}</td>
          <td class="p-2">${r.categoria_gasto||'-'}</td>
          <td class="p-2">${r.concepto||'-'}</td>
          <td class="p-2 text-right">${$fmt(r.subtotal || r.costo_unit || 0)}</td>
        </tr>`).join('');
    }
    renderKPIsDia();   // refleja “Gastos del local” diarios
    renderKPIsMes();   // ahora también impacta en Gastos (mes) y Saldo real (mes)
  }catch(e){ console.error('cargarGastosRecientes',e); }
}

/* ==== NUEVO: Gastos del MES (total y por categoría) ==== */
function gastosMesTotal() {
  if (!mesSelKey) return 0;
  const [yy, mm] = mesSelKey.split('-').map(Number);
  return GASTOS
    .filter(g => {
      const f = (g.fecha||'').slice(0,10);
      const d = f ? new Date(f) : null;
      return d && sameYMonth(d, yy, mm);
    })
    .reduce((a,g)=> a + Number(g.subtotal || g.costo_unit || 0), 0);
}

function gastosMesPorCategoria() {
  if (!mesSelKey) return {};
  const [yy, mm] = mesSelKey.split('-').map(Number);
  const out = {};
  GASTOS.forEach(g=>{
    const f = (g.fecha||'').slice(0,10);
    const d = f ? new Date(f) : null;
    if (!d || !sameYMonth(d,yy,mm)) return;
    const cat = (g.categoria_gasto || 'Otros').toString();
    const m = Number(g.subtotal || g.costo_unit || 0);
    out[cat] = (out[cat]||0) + m;
  });
  return out;
}

/* ========= Buckets (solo si existen en tu HTML) ========= */
const BUCKET_PCTS = { alquiler: 0.39, sueldos: 0.47, luz: 0.10, eventos: 0.04 };

function aggMes(){
  if(!mesSelKey) return {rows:[], ingresos:0, costo:0, bruta:0, ventas:0, costoDiario:0};
  const [yy, mm] = mesSelKey.split('-').map(Number);
  const rows = ROWS.filter(r => sameYMonth(r.date, yy, mm));
  const ingresos = rows.reduce((a,r)=>a+(Number(r.total)||0),0);
  const costo    = rows.reduce((a,r)=>a+(Number(r.totalCosto)||0),0);
  const diasSet  = new Set(rows.map(r => r.date.toISOString().slice(0,10)));
  const costoDiario = diasSet.size ? (costo / diasSet.size) : 0;
  return { rows, ingresos, costo, bruta: Math.max(0, ingresos - costo), ventas: rows.length, costoDiario };
}

function renderBuckets(){
  // si el bloque no existe, salgo sin hacer nada
  if(!getEl('metaAlquiler') && !getEl('bkAlqBar')) return;

  const { bruta, costoDiario } = aggMes();
  const metas = {
    alquiler: Number(getEl('metaAlquiler')?.value || 990000),
    luz:      Number(getEl('metaLuz')?.value      || 200000),
    sueldos:  Number(getEl('metaSueldos')?.value  || 1200000),
    eventos:  Number(getEl('metaEventos')?.value  || 100000),
  };
  const asig = {
    alquiler: Math.round(bruta * BUCKET_PCTS.alquiler),
    sueldos:  Math.round(bruta * BUCKET_PCTS.sueldos),
    luz:      Math.round(bruta * BUCKET_PCTS.luz),
    eventos:  Math.round(bruta * BUCKET_PCTS.eventos),
  };

  // etiquetas (si existen)
  setText('bkAlqMonto', `· Meta ${$fmt(metas.alquiler)}`);
  setText('bkLuzMonto', `· Meta ${$fmt(metas.luz)}`);
  setText('bkSuelMonto', `· Meta ${$fmt(metas.sueldos)}`);
  setText('bkEvtMonto', `· Meta ${$fmt(metas.eventos)}`);

  // barras + faltantes (si existen)
  const upd = (pref, asignado, meta)=>{
    setText(`${pref}Asig`, $fmt(asignado));
    setText(`${pref}Falta`, $fmt(Math.max(0, meta - asignado)));
    setWidth(`${pref}Bar`, meta>0 ? (asignado/meta)*100 : 0);
  };
  upd('bkAlq', asig.alquiler, metas.alquiler);
  upd('bkLuz', asig.luz, metas.luz);
  upd('bkSuel', asig.sueldos, metas.sueldos);
  upd('bkEvt', asig.eventos, metas.eventos);

  setText('bkCostoDiario', $fmt(costoDiario));
  setText('bkColchon', $fmt(costoDiario * 5));
}

/* ========= Tabla ventas ========= */
function renderTablaVentas(){
  const tb = getEl('tbodyVentas'); if(!tb) return;
  const rows = monthRows().slice().sort((a,b)=> b.date-a.date);
  tb.innerHTML = '';
  rows.forEach(r=>{
    let itemsTxt = '';
    try{
      const arr=JSON.parse(r.items||'[]');
      itemsTxt = Array.isArray(arr) ? arr.map(x=>`${x.nombre||''} x${x.qty||1}`).join(', ') : '';
    }catch{}
    tb.insertAdjacentHTML('beforeend', `
      <tr>
        <td class="p-2">${r.ts.toString().slice(0,19).replace('T',' ')}</td>
        <td class="p-2"></td><td class="p-2"></td>
        <td class="p-2">${r.metodo||''}</td>
        <td class="p-2">${itemsTxt}</td>
        <td class="p-2 text-right">${$fmt(r.total)}</td>
        <td class="p-2 text-right">${$fmt(r.ganancia)}</td>
      </tr>
    `);
  });
}

/* ========= Render general ========= */
function renderAll(){
  renderKPIsMes();
  renderKPIsDia();
  renderCharts();        // no dibuja si los canvas no existen
  renderBuckets();       // no hace nada si el bloque no existe
  renderTablaVentas();
}

/* ========= Eventos ========= */
getEl('btnReload')?.addEventListener('click', async ()=>{ await loadCSV(); renderAll(); });
getEl('mesFiltro')?.addEventListener('change', function(){ mesSelKey=this.value; renderAll(); });
['diaFiltro','horaDesde','horaHasta','cierrePersonas','cierreGastos'].forEach(id=>{
  getEl(id)?.addEventListener('input', ()=>{ renderKPIsDia(); renderCharts(); });
});
getEl('btnGuardarGasto')?.addEventListener('click', guardarGasto);
getEl('btnRecargarGastos')?.addEventListener('click', cargarGastosRecientes);
// metas editables (si existen) → refrescar buckets
;['metaAlquiler','metaLuz','metaSueldos','metaEventos'].forEach(id=>{
  getEl(id)?.addEventListener('input', renderBuckets);
});

/* ========= Init ========= */
(function init(){
  const hoy = new Date().toISOString().slice(0,10);
  if(getEl('gFecha') && !getEl('gFecha').value) getEl('gFecha').value = hoy;

  (async()=>{
    try{
      await loadCSV();
      await cargarGastosRecientes();
      renderAll();
    }catch(e){
      console.error(e);
      setText('statusBadge','Error');
      setText('diag', String(e));
    }
  })();
})();
