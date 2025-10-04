// ===== Buckets: metas y porcentajes (pueden editarse desde la UI) =====
const BUCKET_PCTS = { alquiler: 0.39, sueldos: 0.47, luz: 0.10, eventos: 0.04 };

// Obtiene métricas del mes seleccionado (usa tus ROWS existentes)
function aggMes() {
  const [yy, mm] = mesSelKey.split('-').map(Number);
  const rows = ROWS.filter(r => sameYMonth(r.date, yy, mm));
  const ingresos = rows.reduce((a,r)=>a+(Number(r.total)||0),0);
  const costo    = rows.reduce((a,r)=>a+(Number(r.totalCosto)||0),0);
  const ventas   = rows.length;
  // costo promedio diario (sobre días con movimiento)
  const diasSet = new Set(rows.map(r => r.date.toISOString().slice(0,10)));
  const costoDiario = diasSet.size ? (costo / diasSet.size) : 0;
  return { rows, ingresos, costo, bruta: Math.max(0, ingresos - costo), ventas, costoDiario };
}

/* ================== Utiles ================== */
const $fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const toDate = (s)=>{
  if(!s) return null;
  const t=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
  if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
  const d=new Date(t); return isNaN(d)? null:d;
};
const sameYMonth = (d, y, m)=> d && d.getFullYear()===y && (d.getMonth()+1)===m;
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/* ================== Estado ================== */
let ROWS = [];               // ventas
let mesSelKey = '';          // 'yyyy-mm'
let GASTOS = [];             // gastos (desde API)
let CHARTS = { pie:null, barQty:null, barProf:null, horas:null };

/* ================== Carga CSV ================== */
async function loadCSV(){
  const url = $('#csvUrl').val().trim();
  $('#statusBadge').text('Cargando CSV…');
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
                ganancia: Number(r.ganancia || r.Ganancia || (Number(r.total||0)-Number(r.totalCosto||0))),
                unidades,
                items: itemsRaw
              };
            })
            .filter(Boolean);
          buildMesOptions();
          $('#statusBadge').text('Listo');
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
  const sel = $('#mesFiltro'); sel.empty();
  opts.forEach(key=>{
    const [yy,mm] = key.split('-').map(Number);
    const label = new Date(yy,mm-1,1).toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    sel.append(`<option value="${key}">${label.charAt(0).toUpperCase()+label.slice(1)}</option>`);
  });
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  mesSelKey = opts.includes(nowKey) ? nowKey : (opts[0]||'');
  if(mesSelKey) sel.val(mesSelKey);
  renderAll();
}

/* ================== KPIs ================== */
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
  const gananciaMesCalc = Math.max(0, m.ingresos - m.costo); // ✅ ganancia = ingresos - costo

  $('#kpiVentas').text(m.ventas);
  $('#kpiUnidades').text(m.unidades);
  $('#kpiIngresos').text($fmt(m.ingresos));
  $('#kpiGananciaMes').text($fmt(gananciaMesCalc)); // ✅ en vez de m.gan
  $('#kpiEfectivoMes').text($fmt(m.byMethod.efectivo));
  $('#kpiMpMes').text($fmt(m.byMethod.mp));
}

function renderKPIsDia(){
  let selDia = $('#diaFiltro').val();
  if(!selDia){
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(key===mesSelKey){ selDia = now.toISOString().slice(0,10); $('#diaFiltro').val(selDia); }
  }
  if(!selDia) return;

  const [yy,mm] = mesSelKey.split('-').map(Number);
  const rows = ROWS.filter(r=> sameYMonth(r.date,yy,mm) && dayKey(r.date)===selDia);

  // filtro horario
  const hFrom=$('#horaDesde').val(), hTo=$('#horaHasta').val();
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

  // gastos del local (API) + input manual
  const gastosApi = GASTOS
    .filter(g => (g.fecha||'').slice(0,10)===selDia)
    .reduce((a,g)=> a + Number(g.subtotal || g.costo_unit || 0), 0);
  const gastosInput = Number($('#cierreGastos').val()||0);
  const gastosTot = gastosApi + gastosInput;

  $('#kpiIngDia').text($fmt(ing));
  $('#kpiCostoDia').text($fmt(cos));
  $('#kpiGanDia').text($fmt(gan));
  $('#kpiVentasDia').text(r2.length);
  $('#kpiUniDia').text(uni);

  $('#cierreIng').text($fmt(ing));
  $('#cierreCosto').text($fmt(cos));
  $('#cierreBruta').text($fmt(ing - cos));
  $('#cierreGastosLbl').text($fmt(gastosTot));
  const neta = (ing - cos) - gastosTot;
  $('#cierreNeta').text($fmt(neta));
  const personas = Math.max(1, Number($('#cierrePersonas').val()||1));
  $('#cierrePorPersona').text($fmt(neta/personas));

  $('#cierreRangoLbl').text(`${selDia}${(hFrom||hTo)? ` · ${hFrom||'00:00'}–${hTo||'23:59'}`:''}`);
  $('#kpiGanDiaLbl').text(`${r2.length} ventas · ${uni} unid.`);
}

/* ================== Categorías y Horas (Chart.js) ================== */
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
  // Agregado por categoría a partir de items(json)
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
        else if(totalItemsImporte>0){ // prorrateo por ticket si no hay costo de item
          gan = (r.ganancia||0) * (imp/totalItemsImporte);
        }
        agg[cat].unidades += qty;
        agg[cat].gan += gan;
      });
    }catch{}
  });
  const labels = CAT_LABELS;
  const qtyArr = labels.map(l=> Math.round(agg[l].unidades));
  const profArr= labels.map(l=> Math.round(agg[l].gan));

  // Pie
  const ctxPie = document.getElementById('chartPie')?.getContext('2d');
  if(ctxPie){
    CHARTS.pie = new Chart(ctxPie,{ type:'pie', data:{ labels, datasets:[{ data: qtyArr }] },
      options:{ plugins:{ legend:{position:'bottom'} } }});
  }
  // Barras unidades
  const ctxQty = document.getElementById('chartBarQty')?.getContext('2d');
  if(ctxQty){
    CHARTS.barQty = new Chart(ctxQty,{ type:'bar', data:{ labels, datasets:[{ label:'Unidades', data: qtyArr }] },
      options:{ scales:{ y:{beginAtZero:true, ticks:{precision:0}}}, plugins:{legend:{display:false}} }});
  }
  // Barras ganancia
  const ctxProf = document.getElementById('chartBarProfit')?.getContext('2d');
  if(ctxProf){
    CHARTS.barProf = new Chart(ctxProf,{ type:'bar', data:{ labels, datasets:[{ label:'Ganancia (ARS)', data: profArr }] },
      options:{ scales:{ y:{beginAtZero:true}}, plugins:{legend:{display:false}} }});
  }

  // Tabla resumen
  const tb = document.getElementById('tbodyResumenCat');
  if(tb){
    tb.innerHTML = labels.map(l=>`
      <tr>
        <td class="p-2">${l}</td>
        <td class="p-2 text-right">${agg[l].unidades}</td>
        <td class="p-2 text-right">—</td>
        <td class="p-2 text-right">${$fmt(agg[l].gan)}</td>
      </tr>
    `).join('');
  }

  // Horas: ingresos por hora del día seleccionado
  const selDia = $('#diaFiltro').val();
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

/* ================== Gastos (API) ================== */
const API = '/.netlify/functions/gs-order';

async function guardarGasto(){
  const fecha = (document.getElementById('gFecha').value||'').trim();
  const categoria = (document.getElementById('gCategoria').value||'Otros').trim();
  const concepto = (document.getElementById('gConcepto').value||'').trim();
  const proveedor = (document.getElementById('gProveedor').value||'').trim();
  const monto = Number(document.getElementById('gMonto').value||0);
  const nota = (document.getElementById('gNota').value||'').trim();
  if(!fecha || !concepto || !Number.isFinite(monto) || monto<=0){ alert('Completá Fecha, Concepto y un Monto válido.'); return; }
  const payload = { type:'expense', fecha, categoria_gasto:categoria, concepto, proveedor, qty:1, costo_unit:monto, nota };
  const $btn=document.getElementById('btnGuardarGasto'); const $msg=document.getElementById('gMsg');
  try{
    $btn.disabled=true; $btn.textContent='Guardando…'; $msg.textContent='';
    const res = await fetch(API,{ method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body: 'payload='+encodeURIComponent(JSON.stringify(payload)) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.ok!==true) throw new Error(data.error || `HTTP ${res.status}`);
    // limpiar
    document.getElementById('gConcepto').value=''; document.getElementById('gProveedor').value='';
    document.getElementById('gMonto').value=''; document.getElementById('gNota').value='';
    $msg.textContent='✅ Gasto guardado';
    await cargarGastosRecientes();  // refresca lista y KPIs
  }catch(err){ alert('No se pudo guardar el gasto: '+err.message); }
  finally{ $btn.disabled=false; $btn.textContent='Guardar gasto'; }
}
async function cargarGastosRecientes(){
  try{
    const res = await fetch(`${API}?action=items&limit=100`);
    const json = await res.json();
    if(json?.ok!==true) throw new Error(json?.error||'Error al leer ITEMS');
    // Solo “compra” (gastos)
    GASTOS = (json.items||[]).filter(it => String(it.tipo).toLowerCase()==='compra');
    const $tb=document.getElementById('tbodyGastos');
    if($tb){
      $tb.innerHTML = GASTOS.slice(0,50).map(r=>`
        <tr class="border-b border-gray-100">
          <td class="p-2">${(r.fecha||'').toString().slice(0,10)}</td>
          <td class="p-2">${r.categoria_gasto||'-'}</td>
          <td class="p-2">${r.concepto||'-'}</td>
          <td class="p-2 text-right">${$fmt(r.subtotal || r.costo_unit || 0)}</td>
        </tr>`).join('');
    }
    renderKPIsDia(); // para reflejar “Gastos del local”
  }catch(e){ console.error('cargarGastosRecientes',e); }
}

/* ================== Plan del mes (alquiler/sueldos/franquero) ================== */
const SETTINGS_KEY = 'reporte-plan-mes';
let PLAN = {
  alquilerObjetivo: 990000,
  pctAlquiler: 40,
  pctReposicion: 40,
  pctArreglos: 20,
  sueldos: [],
  franquero: { horas:0, tarifa:0 }
};
function loadPlan(){ try{ const raw=localStorage.getItem(SETTINGS_KEY); if(raw){ const s=JSON.parse(raw);
  PLAN = { ...PLAN, ...s, franquero:{ horas:0, tarifa:0, ...(s?.franquero||{}) } }; } }catch{}
}
function savePlan(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(PLAN)); }catch{} }

function renderSueldos(){
  const wrap = document.getElementById('sueldosList'); if(!wrap) return;
  wrap.innerHTML = PLAN.sueldos.map((s,idx)=>`
    <div class="grid grid-cols-12 gap-2 items-center">
      <input data-idx="${idx}" data-k="nombre" class="col-span-6 rounded-xl border-gray-300 px-2 py-1 text-sm" placeholder="Nombre" value="${s.nombre||''}">
      <input data-idx="${idx}" data-k="monto"  type="number" min="0" step="1000" class="col-span-4 rounded-xl border-gray-300 px-2 py-1 text-sm" placeholder="Monto" value="${Number(s.monto||0)}">
      <button data-idx="${idx}" data-k="del" class="col-span-2 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs">✕</button>
    </div>
  `).join('');
  const tot = PLAN.sueldos.reduce((a,s)=> a + (Number(s.monto)||0), 0);
  document.getElementById('sueldosTotal')?.replaceChildren(document.createTextNode($fmt(tot)));
  // delegación
  wrap.oninput = (e)=>{
    const idx=Number(e.target.dataset.idx), k=e.target.dataset.k;
    if(!Number.isInteger(idx)||!k) return;
    if(k==='nombre') PLAN.sueldos[idx].nombre = e.target.value;
    if(k==='monto')  PLAN.sueldos[idx].monto  = Number(e.target.value||0);
    savePlan(); renderSueldos();
  };
  wrap.onclick = (e)=>{
    if(e.target.dataset.k==='del'){ PLAN.sueldos.splice(Number(e.target.dataset.idx),1); savePlan(); renderSueldos(); }
  };
}

function renderPlan(){
  // label mes
  document.getElementById('planMesLabel')?.replaceChildren(document.createTextNode(mesSelKey || '-'));

  // set inputs (si existen)
  const el = id => document.getElementById(id);
  if(el('alqObjetivo')) el('alqObjetivo').value = PLAN.alquilerObjetivo;
  if(el('alqPct'))      el('alqPct').value      = PLAN.pctAlquiler;
  if(el('repPct'))      el('repPct').value      = PLAN.pctReposicion;
  if(el('arrPct'))      el('arrPct').value      = PLAN.pctArreglos;
  if(el('franqHoras'))  el('franqHoras').value  = PLAN.franquero.horas;
  if(el('franqTarifa')) el('franqTarifa').value = PLAN.franquero.tarifa;

  const m = monthAgg();
  // ✅ Ganancia del mes correcta
  document.getElementById('ganMesLbl')?.replaceChildren(
    document.createTextNode($fmt(Math.max(0, m.ingresos - m.costo)))
  );
  document.getElementById('alqCostoMes')?.replaceChildren(document.createTextNode($fmt(m.costo)));

  const mAlq = Math.max(0, Math.round(m.costo * (PLAN.pctAlquiler/100)));
  const mRep = Math.max(0, Math.round(m.costo * (PLAN.pctReposicion/100)));
  const mArr = Math.max(0, Math.round(m.costo * (PLAN.pctArreglos/100)));
  const sumPct = PLAN.pctAlquiler + PLAN.pctReposicion + PLAN.pctArreglos;
  const pctLibre = Math.max(0, 100 - sumPct);
  const libreMonto = Math.max(0, Math.round(m.costo * (pctLibre/100)));

  document.getElementById('repMonto')?.replaceChildren(document.createTextNode($fmt(mRep)));
  document.getElementById('arrMonto')?.replaceChildren(document.createTextNode($fmt(mArr)));
  document.getElementById('libreMonto')?.replaceChildren(document.createTextNode($fmt(libreMonto)));
  document.getElementById('pctLibre')?.replaceChildren(document.createTextNode(`${pctLibre}%`));
  document.getElementById('pctWarn')?.classList.toggle('hidden', sumPct<=100);

  const objetivo = Math.max(0, Number(PLAN.alquilerObjetivo||0));
  const prog = objetivo>0 ? Math.min(100, Math.round((mAlq/objetivo)*100)) : 0;
  document.getElementById('alqDestinado')?.replaceChildren(document.createTextNode($fmt(mAlq)));
  document.getElementById('alqPctProgreso')?.replaceChildren(document.createTextNode(`${prog}%`));
  const bar = document.getElementById('alqBar'); if(bar) bar.style.width = `${prog}%`;
  const falta = Math.max(0, objetivo - mAlq);
  document.getElementById('alqFalta')?.replaceChildren(document.createTextNode($fmt(falta)));

  renderSueldos();

  const franqTotal = Math.max(0, Math.round((Number(PLAN.franquero.horas)||0) * (Number(PLAN.franquero.tarifa)||0)));
  document.getElementById('franqTotal')?.replaceChildren(document.createTextNode($fmt(franqTotal)));
}
function pct(x, goal){ return goal>0 ? Math.min(100, Math.round((x/goal)*100)) : 0; }

function renderBucketsUI(asig, metas, costoDiario){
  const $ = (id)=>document.getElementById(id);
  const fmt = (n)=> new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));

  // metas
  $('#bkAlqMonto').text(`· Meta ${fmt(metas.alquiler)}`);
  $('#bkLuzMonto').text(`· Meta ${fmt(metas.luz)}`);
  $('#bkSuelMonto').text(`· Meta ${fmt(metas.sueldos)}`);
  $('#bkEvtMonto').text(`· Meta ${fmt(metas.eventos)}`);

  // barras + faltantes
  const setBar = (pref, asignado, meta)=>{
    $(`${pref}Asig`).textContent = fmt(asignado);
    $(`${pref}Falta`).textContent = fmt(Math.max(0, meta - asignado));
    const bar = $(`${pref}Bar`); if(bar) bar.style.width = pct(asignado, meta) + '%';
  };
  setBar('bkAlq', asig.alquiler, metas.alquiler);
  setBar('bkLuz', asig.luz, metas.luz);
  setBar('bkSuel', asig.sueldos, metas.sueldos);
  setBar('bkEvt', asig.eventos, metas.eventos);

  // reposición (5 días)
  $('#bkCostoDiario').textContent = fmt(costoDiario);
  $('#bkColchon').textContent     = fmt(costoDiario * 5);
}

function renderBuckets(){
  const { bruta, costoDiario } = aggMes();

  // metas (tomadas de inputs para que sean editables)
  const metas = {
    alquiler: Number(document.getElementById('metaAlquiler')?.value || 990000),
    luz:      Number(document.getElementById('metaLuz')?.value      || 200000),
    sueldos:  Number(document.getElementById('metaSueldos')?.value  || 1200000),
    eventos:  Number(document.getElementById('metaEventos')?.value  || 100000),
  };

  // asignación 39/47/10/4 sobre la GANANCIA BRUTA del mes
  const asig = {
    alquiler: Math.round(bruta * BUCKET_PCTS.alquiler),
    sueldos:  Math.round(bruta * BUCKET_PCTS.sueldos),
    luz:      Math.round(bruta * BUCKET_PCTS.luz),
    eventos:  Math.round(bruta * BUCKET_PCTS.eventos),
  };

  renderBucketsUI(asig, metas, costoDiario);
}

function bindPlanEvents(){
  $('#alqObjetivo').on('input', function(){ PLAN.alquilerObjetivo = Number(this.value||0); savePlan(); renderPlan(); });
  $('#alqPct').on('input',       function(){ PLAN.pctAlquiler     = capPct(this.value); savePlan(); renderPlan(); });
  $('#repPct').on('input',       function(){ PLAN.pctReposicion   = capPct(this.value); savePlan(); renderPlan(); });
  $('#arrPct').on('input',       function(){ PLAN.pctArreglos     = capPct(this.value); savePlan(); renderPlan(); });
  $('#btnAddSueldo').on('click', function(){ PLAN.sueldos.push({nombre:'',monto:0}); savePlan(); renderSueldos(); });
  $('#franqHoras').on('input',   function(){ PLAN.franquero.horas = Number(this.value||0); savePlan(); renderPlan(); });
  $('#franqTarifa').on('input',  function(){ PLAN.franquero.tarifa= Number(this.value||0); savePlan(); renderPlan(); });
}
const capPct = v => Math.min(100, Math.max(0, Number(v||0)));

/* ================== Render general ================== */
function renderAll(){
  renderKPIsMes();
  renderKPIsDia();
  renderCharts();
  renderPlan();
  renderBuckets(); // ✅ calcula y dibuja los buckets

  // tabla de ventas (simple)
  const $tb = $('#tbodyVentas'); if($tb.length){
    const rows = monthRows().slice().sort((a,b)=> b.date-a.date);
    $tb.empty();
    rows.forEach(r=>{
      $tb.append(`<tr>
        <td class="p-2">${r.ts.toString().slice(0,19).replace('T',' ')}</td>
        <td class="p-2"></td><td class="p-2"></td>
        <td class="p-2">${r.metodo||''}</td>
        <td class="p-2">${(function(){ try{const arr=JSON.parse(r.items||'[]'); return arr.map(x=>`${x.nombre||''} x${x.qty||1}`).join(', ')}catch{return ''}})()}</td>
        <td class="p-2 text-right">${$fmt(r.total)}</td>
        <td class="p-2 text-right">${$fmt(r.ganancia)}</td>
      </tr>`);
    });
  }
}

/* ================== Eventos UI ================== */
$('#btnReload').on('click', async ()=>{ await loadCSV(); renderAll(); });
$('#mesFiltro').on('change', function(){ mesSelKey=$(this).val(); renderAll(); });
$('#diaFiltro, #horaDesde, #horaHasta, #cierrePersonas, #cierreGastos').on('input change', ()=>{ renderKPIsDia(); renderCharts(); });

// metas editables → refrescar buckets
['metaAlquiler','metaLuz','metaSueldos','metaEventos'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', renderBuckets);
});

document.getElementById('btnGuardarGasto')?.addEventListener('click', guardarGasto);
document.getElementById('btnRecargarGastos')?.addEventListener('click', cargarGastosRecientes);

/* ================== Init ================== */
(function init(){
  // defaults UI
  const hoy = new Date().toISOString().slice(0,10);
  if(!document.getElementById('gFecha').value) document.getElementById('gFecha').value = hoy;

  loadPlan(); bindPlanEvents();

  (async()=>{
    try{
      await loadCSV();
      await cargarGastosRecientes();
      renderAll();
    }catch(e){
      console.error(e);
      $('#statusBadge').text('Error');
      $('#diag').text(String(e));
    }
  })();
})();

