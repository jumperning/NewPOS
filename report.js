/* ================= Helpers ================= */
const $fmt = (n) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(Number(n||0));
const toDate = (s) => {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
  const d = new Date(t);
  return isNaN(d) ? null : d;
};
const sameYMonth = (d, y, m) => d && d.getFullYear()===y && (d.getMonth()+1)===m;

/* ================= Estado ================= */
const API = '/.netlify/functions/gs-order'; // endpoint de gastos (sigue igual)
let ROWS = [];   // ventas del CSV
let GASTOS = []; // compras del API (tipo="compra")
let mesSelKey = '';
let CHARTS = { pie:null, barQty:null, barProf:null, horas:null };

/* ===== Conciliación (MP/Efectivo) ===== */
const CONC_KEY = 'reporte-concil-1112';
let CONC = { mp: 0, efectivo: 0 };
function loadConcil(){ try{ const raw=localStorage.getItem(CONC_KEY); if(raw){ CONC = { mp:0, efectivo:0, ...JSON.parse(raw) }; } }catch{} }
function saveConcil(){ try{ localStorage.setItem(CONC_KEY, JSON.stringify(CONC)); }catch{} }

/* ================= CSV ================= */
async function loadCSV(){
  const url = $('#csvUrl').val().trim();
  $('#statusBadge').text('Cargando CSV…');
  return new Promise((resolve, reject)=>{
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res)=>{
        try{
          const rows = (res.data||[]).map(r=>{
            const ts = r.timestamp || r.fecha || r.Timestamp || '';
            const d = toDate(ts);
            return {
              ts: ts,
              date: d,
              y: d? d.getFullYear(): null,
              m: d? d.getMonth()+1 : null,
              d: d? d.getDate() : null,
              cliente: r.cliente || r.Cliente || '',
              mesa: r.mesa || r.Mesa || '',
              metodo: (r.metodoPago || r.metodo || r.Metodo || '').toString().trim(),
              total: Number(r.total || r.Total || 0),
              totalCosto: Number(r.totalCosto || r.TotalCosto || 0),
              ganancia: Number(r.ganancia || r.Ganancia || (Number(r.total||0)-Number(r.totalCosto||0))),
              pago: Number(r.pago || r.Pago || 0),
              items: r['items(json)'] || r.items || '[]',
              categoria: r.categoria || ''
            };
          });
          ROWS = rows.filter(r => r.date);
          buildMesOptions();
          $('#statusBadge').text('Menú sincronizado');
          resolve();
        }catch(e){ reject(e); }
      },
      error: (err)=> reject(err)
    });
  });
}

function buildMesOptions(){
  const set = new Set(ROWS.map(r=> `${r.y}-${String(r.m).padStart(2,'0')}`));
  const MES_OPTS = [...set].sort().reverse().map(key=>{
    const [yy, mm] = key.split('-');
    const d = new Date(Number(yy), Number(mm)-1, 1);
    const label = d.toLocaleDateString('es-AR', { month:'long', year:'numeric' });
    return {key, label: label.charAt(0).toUpperCase()+label.slice(1)};
  });
  const sel = $('#mesFiltro'); sel.empty();
  MES_OPTS.forEach(o => sel.append(`<option value="${o.key}">${o.label}</option>`));
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  mesSelKey = MES_OPTS.find(o=>o.key===nowKey)?.key || MES_OPTS[0]?.key || '';
  if (mesSelKey) sel.val(mesSelKey);
  renderAll();
}

/* ================= Gastos (API) ================= */
(function initGastosUI(){
  const hoy = new Date().toISOString().slice(0,10);
  const $f = document.getElementById('gFecha');
  if ($f && !$f.value) $f.value = hoy;
})();

async function guardarGasto(){
  const fecha      = (document.getElementById('gFecha')?.value || '').trim();
  const categoria  = (document.getElementById('gCategoria')?.value || 'Otros').trim();
  const concepto   = (document.getElementById('gConcepto')?.value || '').trim();
  const proveedor  = (document.getElementById('gProveedor')?.value || '').trim();
  const montoNum   = Number(document.getElementById('gMonto')?.value || 0);
  const nota       = (document.getElementById('gNota')?.value || '').trim();
  const $btn       = document.getElementById('btnGuardarGasto');
  const $msg       = document.getElementById('gMsg');

  if (!fecha || !concepto || !Number.isFinite(montoNum) || montoNum <= 0){
    alert('Completá Fecha, Concepto y un Monto válido.'); return;
  }

  const payload = {
    type: 'expense',
    fecha,
    categoria_gasto: categoria,
    concepto,
    proveedor,
    qty: 1,
    costo_unit: montoNum,
    nota
  };

  try{
    if($btn){ $btn.disabled = true; $btn.textContent = 'Guardando…'; }
    if($msg) $msg.textContent = '';
    const res = await fetch(API, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'payload='+encodeURIComponent(JSON.stringify(payload))
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok || data.ok !== true) throw new Error(data.error || `HTTP ${res.status}`);

    ['gConcepto','gProveedor','gMonto','gNota'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    if($msg) $msg.textContent = '✅ Gasto guardado';

    await cargarGastosRecientes();
  }catch(err){
    console.error(err);
    alert('No se pudo guardar el gasto: ' + err.message);
  }finally{
    if($btn){ $btn.disabled = false; $btn.textContent = 'Guardar gasto'; }
  }
}

async function cargarGastosRecientes(){
  try{
    const res = await fetch(`${API}?action=items&limit=200`);
    const json = await res.json();
    if (json?.ok !== true) throw new Error(json?.error || 'Error al leer ITEMS');
    GASTOS = (json.items || []).filter(it => String(it.tipo).toLowerCase() === 'compra');

    const $tb = document.getElementById('tbodyGastos');
    if ($tb){
      $tb.innerHTML = GASTOS.map(r => `
        <tr>
          <td class="p-2">${(r.fecha||'').toString().slice(0,10)}</td>
          <td class="p-2">${r.categoria_gasto||'-'}</td>
          <td class="p-2">${r.concepto||'-'}</td>
          <td class="p-2 text-right">${$fmt(r.subtotal || r.costo_unit || 0)}</td>
        </tr>
      `).join('');
    }

    renderKPIsMes();
    renderKPIsDia();
  }catch(err){
    console.error('cargarGastosRecientes', err);
  }
}

/* ===== Sumatorias de gastos (día y mes) ===== */
function gastosDelDiaISO(yyyy_mm_dd){
  if (!yyyy_mm_dd) return 0;
  return GASTOS
    .filter(g => (g.fecha||'').slice(0,10) === yyyy_mm_dd)
    .reduce((a,g)=> a + Number(g.subtotal || g.costo_unit || 0), 0);
}

function gastosMesTotal(){
  if(!mesSelKey) return 0;
  const [yy, mm] = mesSelKey.split('-').map(Number);
  return GASTOS.reduce((acc,g)=>{
    const f = (g.fecha||'').slice(0,10);
    if(!f) return acc;
    const d = new Date(f);
    const ok = d && d.getFullYear() === yy && (d.getMonth()+1) === mm;
    return ok ? acc + Number(g.subtotal || g.costo_unit || 0) : acc;
  }, 0);
}

/* ================= KPIs & Render ================= */
function mediosMap(met){
  const s = (met||'').toLowerCase();
  if (s.includes('efect')) return 'efectivo';
  if (s.includes('mp') || s.includes('mercado') || s.includes('qr')) return 'mp';
  return 'otros';
}

function renderAll(){
  if (!mesSelKey) return;
  const [yy, mm] = mesSelKey.split('-').map(Number);

  // Filas del mes
  const monthRows = ROWS.filter(r => sameYMonth(r.date, yy, mm));

  // KPIs mes
  const ventas = monthRows.length;
  const unidades = monthRows.reduce((a, r)=>{
    try { const arr = JSON.parse(r.items||'[]'); return a + (Array.isArray(arr)? arr.reduce((s,x)=>s+(Number(x.qty)||0),0) : 0); }
    catch { return a; }
  }, 0);
  const ingresos = monthRows.reduce((a,r)=>a+r.total,0);
  const costo = monthRows.reduce((a,r)=>a+r.totalCosto,0);
  const gananciaBrutaMes = Math.max(0, ingresos - costo);

  // Breakdown métodos
  const byMethod = { efectivo:0, mp:0, otros:0 };
  monthRows.forEach(r => { byMethod[mediosMap(r.metodo)] += Number(r.total||0); });

  // Pintar KPIs (mes)
  $('#kpiVentas').text(ventas);
  $('#kpiUnidades').text(unidades);
  $('#kpiIngresos').text($fmt(ingresos));
  $('#kpiGananciaMes').text($fmt(gananciaBrutaMes));
  $('#kpiEfectivoMes').text($fmt(byMethod.efectivo));
  $('#kpiMpMes').text($fmt(byMethod.mp));
  $('#kpi-costo-mes').text($fmt(costo));          // ✅ ahora se pinta costo (mes)
  const gMes = gastosMesTotal();                   // compras (items tipo=compra)
  $('#kpiGastosMes')?.text($fmt(gMes));            // ✅ nuevo KPI de gastos (mes)

  // KPIs día
  renderKPIsDia();

  // Tabla de ventas
  const $tb = $('#tbodyVentas'); $tb.empty();
  monthRows.slice().sort((a,b)=> b.date - a.date).forEach(r=>{
    $tb.append(`<tr>
      <td class="p-2">${r.ts.toString().slice(0,19).replace('T',' ')}</td>
      <td class="p-2">${r.cliente||''}</td>
      <td class="p-2">${r.mesa||''}</td>
      <td class="p-2">${r.metodo||''}</td>
      <td class="p-2">${(function(){ try{const arr=JSON.parse(r.items||'[]'); return arr.map(x=>`${x.nombre||''} x${x.qty||1}`).join(', ')}catch{return ''}})()}</td>
      <td class="p-2 text-right">${$fmt(r.total)}</td>
      <td class="p-2 text-right">${$fmt(r.ganancia)}</td>
    </tr>`);
  });

  // Charts (si existen)
  renderCharts(monthRows);

  // Conciliación y metas
  renderConciliacion(byMethod, ingresos, costo, gMes);
  renderBuckets(gananciaBrutaMes, gMes);
}

function renderKPIsDia(){
  let selDia = $('#diaFiltro').val();
  if (!selDia){
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    if (key === mesSelKey){ selDia = today.toISOString().slice(0,10); $('#diaFiltro').val(selDia); }
  }
  if (!selDia) return;

  const [yy, mm] = mesSelKey.split('-').map(Number);
  const hFrom = $('#horaDesde').val();
  const hTo   = $('#horaHasta').val();

  const rowsDia = ROWS.filter(r => sameYMonth(r.date, yy, mm) && r.date.toISOString().slice(0,10)===selDia);

  const inTime = (dt) => {
    if (!hFrom && !hTo) return true;
    const hhmm = dt.toTimeString().slice(0,5);
    if (hFrom && hhmm < hFrom) return false;
    if (hTo   && hhmm > hTo)   return false;
    return true;
  };
  const r2 = rowsDia.filter(r => inTime(r.date));

  const ing = r2.reduce((a,r)=>a+r.total,0);
  const cos = r2.reduce((a,r)=>a+r.totalCosto,0);
  const gan = r2.reduce((a,r)=>a+r.ganancia,0);
  const uni = r2.reduce((a, r)=>{
    try { const arr = JSON.parse(r.items||'[]'); return a + (Array.isArray(arr)? arr.reduce((s,x)=>s+(Number(x.qty)||0),0) : 0); }
    catch { return a; }
  }, 0);

  const gastosApiDia = gastosDelDiaISO(selDia);
  const gastosManuales = Number($('#cierreGastos').val() || 0);
  const gastosTot = gastosApiDia + gastosManuales;

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
  const personas = Math.max(1, Number($('#cierrePersonas').val() || 1));
  $('#cierrePorPersona').text($fmt(neta / personas));
  $('#cierreRangoLbl').text(`${selDia}${(hFrom||hTo)? ` · ${hFrom||'00:00'}–${hTo||'23:59'}` : ''}`);

  $('#kpiGanDiaLbl').text(`${r2.length} ventas · ${uni} unid.`);
}

/* ============== Conciliación (MP/Efectivo) ============== */
function renderConciliacion(byMethod, ingresosMes, costoMes, gastosMes){
  const $mpIn = document.getElementById('concMpInput');
  const $efIn = document.getElementById('concEfInput');
  const $umbral = document.getElementById('concUmbralInput');
  if(!$mpIn && !$efIn) return;

  // enlazar inputs a localStorage
  if($mpIn && !$mpIn.dataset.bound){
    $mpIn.value = Number(CONC.mp||0);
    $mpIn.addEventListener('input', ()=>{ CONC.mp = Number($mpIn.value||0); saveConcil(); renderConciliacion(byMethod, ingresosMes, costoMes, gastosMes); });
    $mpIn.dataset.bound = '1';
  }
  if($efIn && !$efIn.dataset.bound){
    $efIn.value = Number(CONC.efectivo||0);
    $efIn.addEventListener('input', ()=>{ CONC.efectivo = Number($efIn.value||0); saveConcil(); renderConciliacion(byMethod, ingresosMes, costoMes, gastosMes); });
    $efIn.dataset.bound = '1';
  }

  const mpRep = Number(byMethod.mp||0);          // reportado por POS (mes)
  const efRep = Number(byMethod.efectivo||0);    // reportado por POS (mes)
  const mpAct = Number(CONC.mp||0);              // lo que cargás desde MP (p.ej. 321287)
  const efAct = Number(CONC.efectivo||0);        // lo que contás en caja

  const mpDiff = mpAct - mpRep;
  const efDiff = efAct - efRep;
  const totalDiff = mpDiff + efDiff;

  const setTxt = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent = $fmt(val); };
  setTxt('concMpRep', mpRep);
  setTxt('concEfRep', efRep);
  setTxt('concMpDiff', mpDiff);
  setTxt('concEfDiff', efDiff);
  setTxt('concTotalDiff', totalDiff);

  // Estados con umbral
  const umbral = Number($umbral?.value || 0);
  const badge = (ok)=> ok ? ['OK','bg-green-100'] : ['Revisar','bg-amber-100'];
  const [mpLbl, mpCls] = badge(Math.abs(mpDiff) <= umbral);
  const [efLbl, efCls] = badge(Math.abs(efDiff) <= umbral);
  const $mpEstado = document.getElementById('concMpEstado');
  const $efEstado = document.getElementById('concEfEstado');
  const $alert = document.getElementById('concAlert');
  if($mpEstado){ $mpEstado.textContent = mpLbl; $mpEstado.className = `px-2 py-0.5 rounded ${mpCls}`; }
  if($efEstado){ $efEstado.textContent = efLbl; $efEstado.className = `px-2 py-0.5 rounded ${efCls}`; }
  if($alert){
    const ok = Math.abs(totalDiff) <= (umbral||0);
    $alert.textContent = ok ? 'Dentro de umbral' : 'Diferencia a investigar';
    $alert.className = `px-2 py-0.5 rounded ${ok? 'bg-gray-100':'bg-red-100'}`;
  }
}

/* ============== Metas y barras de progreso ============== */
function renderBuckets(gananciaBrutaMes, gastosMes){
  // distribución 39/47/10/4 sobre ganancia bruta del mes
  const metaAlq = Number($('#metaAlquiler').val() || 0);
  const metaLuz = Number($('#metaLuz').val() || 0);
  const metaSuel = Number($('#metaSueldos').val() || 0);
  const metaEvt = Number($('#metaEventos').val() || 0);

  const asigAlq = gananciaBrutaMes * 0.39;
  const asigLuz = gananciaBrutaMes * 0.47;
  const asigSuel= gananciaBrutaMes * 0.10;
  const asigEvt = gananciaBrutaMes * 0.04;

  const setBar = (idBar, idFalta, idAsig, asig, meta)=>{
    const p = meta>0 ? Math.min(100, Math.round(asig/meta*100)) : 0;
    const falta = Math.max(0, meta - asig);
    const bar = document.getElementById(idBar);
    if(bar) bar.style.width = p + '%';
    const $f = document.getElementById(idFalta); if($f) $f.textContent = $fmt(falta);
    const $a = document.getElementById(idAsig);  if($a) $a.textContent = $fmt(asig);
  };

  setBar('bkAlqBar','bkAlqFalta','bkAlqAsig', asigAlq, metaAlq);
  setBar('bkLuzBar','bkLuzFalta','bkLuzAsig', asigLuz, metaLuz);
  setBar('bkSuelBar','bkSuelFalta','bkSuelAsig', asigSuel, metaSuel);
  setBar('bkEvtBar','bkEvtFalta','bkEvtAsig', asigEvt, metaEvt);

  // etiquetas “Monto meta”
  $('#bkAlqMonto').text(`Meta: ${$fmt(metaAlq)}`);
  $('#bkLuzMonto').text(`Meta: ${$fmt(metaLuz)}`);
  $('#bkSuelMonto').text(`Meta: ${$fmt(metaSuel)}`);
  $('#bkEvtMonto').text(`Meta: ${$fmt(metaEvt)}`);

  // colchón de reposición (5 días) calculado con costo promedio diario del mes
  const [yy, mm] = mesSelKey.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const costoMes = ROWS.filter(r=> sameYMonth(r.date, yy, mm)).reduce((a,r)=>a+(r.totalCosto||0),0);
  const costoDiario = daysInMonth ? (costoMes / daysInMonth) : 0;
  $('#bkCostoDiario').text($fmt(costoDiario));
  $('#bkColchon').text($fmt(costoDiario * 5));
}

/* ================= Charts (opcional) ================= */
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

function renderCharts(rows){
  Object.values(CHARTS).forEach(c=>{try{c?.destroy()}catch{}});
  CHARTS = { pie:null, barQty:null, barProf:null, horas:null };

  const ctxPie  = document.getElementById('chartPie')?.getContext('2d');
  const ctxQty  = document.getElementById('chartBarQty')?.getContext('2d');
  const ctxProf = document.getElementById('chartBarProfit')?.getContext('2d');
  const ctxH    = document.getElementById('chartHoras')?.getContext('2d');
  if(!ctxPie && !ctxQty && !ctxProf && !ctxH) return;

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

  if(ctxPie){
    CHARTS.pie = new Chart(ctxPie,{ type:'pie', data:{ labels, datasets:[{ data: qtyArr }] },
      options:{ plugins:{ legend:{position:'bottom'} } }});
  }
  if(ctxQty){
    CHARTS.barQty = new Chart(ctxQty,{ type:'bar', data:{ labels, datasets:[{ label:'Unidades', data: qtyArr }] },
      options:{ scales:{ y:{beginAtZero:true, ticks:{precision:0}}}, plugins:{legend:{display:false}} }});
  }
  if(ctxProf){
    CHARTS.barProf = new Chart(ctxProf,{ type:'bar', data:{ labels, datasets:[{ label:'Ganancia (ARS)', data: profArr }] },
      options:{ scales:{ y:{beginAtZero:true}}, plugins:{legend:{display:false}} }});
  }

  const selDia = $('#diaFiltro').val();
  const rowsDia = selDia ? ROWS.filter(r=> r.date && r.date.toISOString().slice(0,10)===selDia) : [];
  const buckets = Array.from({length:24},()=>0);
  rowsDia.forEach(r=>{ buckets[r.date.getHours()] += Number(r.total||0); });
  if(ctxH){
    CHARTS.horas = new Chart(ctxH,{ type:'bar',
      data:{ labels:Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00'), datasets:[{ label:'Ingresos', data:buckets }] },
      options:{ scales:{ y:{beginAtZero:true}}, plugins:{legend:{display:false}} }});
  }
}

/* ================= Eventos ================= */
$('#btnReload').on('click', async ()=>{ await loadCSV(); });
$('#mesFiltro').on('change', function(){ mesSelKey = $(this).val(); renderAll(); });
$('#diaFiltro, #horaDesde, #horaHasta, #cierrePersonas, #cierreGastos, #metaAlquiler, #metaLuz, #metaSueldos, #metaEventos').on('input change', renderAll);
$('#btnHoy').on('click', ()=>{ const t=new Date().toISOString().slice(0,10); $('#diaFiltro').val(t).trigger('change'); });
$('#btnAyer').on('click', ()=>{ const d=new Date(); d.setDate(d.getDate()-1); $('#diaFiltro').val(d.toISOString().slice(0,10)).trigger('change'); });
$('#btnMenos2').on('click', ()=>{ const d=new Date(); d.setDate(d.getDate()-2); $('#diaFiltro').val(d.toISOString().slice(0,10)).trigger('change'); });

document.getElementById('btnGuardarGasto')?.addEventListener('click', guardarGasto);
document.getElementById('btnRecargarGastos')?.addEventListener('click', cargarGastosRecientes);

/* ================= Init ================= */
(async function(){
  try{
    loadConcil();
    await loadCSV();
    await cargarGastosRecientes();
  }catch(e){
    console.error(e);
    $('#statusBadge').text('Error');
    $('#diag').text(String(e));
  }
})();
