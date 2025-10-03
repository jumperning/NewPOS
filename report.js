
/* ================== Mostrar/Ocultar montos ================== */
let mostrarMoneda = true;
function toggleMoneda(){
  mostrarMoneda = !mostrarMoneda;
  document.body.classList.toggle('hide-money', !mostrarMoneda);
}
$('#btnToggleMoneda').on('click', toggleMoneda);

/* ================== Helpers ================== */
const $fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));

function toDate(s){
  if(!s) return null;
  const t=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
  if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
  const d=new Date(t); return isNaN(d)? null : d;
}
const sameYMonth = (d,y,m)=> d && d.getFullYear()===y && (d.getMonth()+1)===m;

/* ================== Estado ================== */
let ROWS = [];          // ventas parseadas
let MES_OPTS = [];      // {key:'2025-03', label:'Marzo 2025'}
let mesSelKey = '';     // yyyy-mm

/* ================== Carga CSV ================== */
async function loadCSV(){
  const url = $('#csvUrl').val().trim();
  $('#statusBadge').text('Cargando CSV…');

  return new Promise((resolve,reject)=>{
    Papa.parse(url,{
      download:true, header:true, skipEmptyLines:true,
      complete:(res)=>{
        try{
          const rows = (res.data||[]).map(r=>{
            const ts = r.timestamp || r.fecha || r.Timestamp || '';
            const d  = toDate(ts);
            const total      = Number(r.total||r.Total||0);
            const totalCosto = Number(r.totalCosto||r.TotalCosto||0);
            const ganancia   = Number(r.ganancia||r.Ganancia||(total-totalCosto));
            return {
              ts: ts,
              date: d, y: d? d.getFullYear(): null, m: d? d.getMonth()+1: null, d: d? d.getDate(): null,
              cliente: r.cliente || r.Cliente || '',
              mesa:    r.mesa    || r.Mesa    || '',
              metodo: (r.metodoPago || r.metodo || r.Metodo || '').toString().trim(),
              total, totalCosto, ganancia,
              pago: Number(r.pago || r.Pago || 0),
              items: r['items(json)'] || r.items || '[]',
            };
          }).filter(r=>r.date);
          ROWS = rows;
          buildMesOptions();
          $('#statusBadge').text('Menú sincronizado');
          resolve();
        }catch(e){ reject(e); }
      },
      error: err=>reject(err)
    });
  });
}

function buildMesOptions(){
  const set = new Set(ROWS.map(r=> `${r.y}-${String(r.m).padStart(2,'0')}`));
  MES_OPTS = [...set].sort().reverse().map(key=>{
    const [yy,mm] = key.split('-'); const d=new Date(Number(yy), Number(mm)-1, 1);
    const label = d.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    return {key, label: label.charAt(0).toUpperCase()+label.slice(1)};
  });
  const sel=$('#mesFiltro'); sel.empty();
  MES_OPTS.forEach(o=> sel.append(`<option value="${o.key}">${o.label}</option>`));
  const now=new Date(); const nowKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  mesSelKey = MES_OPTS.find(o=>o.key===nowKey)?.key || MES_OPTS[0]?.key || '';
  if(mesSelKey) sel.val(mesSelKey);
  renderAll(); renderPlanMes();
}

/* ================== Render KPIs/TABLA ================== */
function mediosMap(met){
  const s=(met||'').toLowerCase();
  if(s.includes('efect')) return 'efectivo';
  if(s.includes('mp')||s.includes('mercado')||s.includes('qr')) return 'mp';
  return 'otros';
}

function monthRowsSel(){
  if(!mesSelKey) return [];
  const [yy,mm]=mesSelKey.split('-').map(Number);
  return ROWS.filter(r=> sameYMonth(r.date,yy,mm));
}

function renderAll(){
  const monthRows = monthRowsSel();
  if(!monthRows.length){ $('#kpiVentas').text(0); $('#kpiUnidades').text(0); $('#kpiIngresos').text($fmt(0)); $('#kpiGananciaMes').text($fmt(0)); return; }

  // KPIs mes
  const ventas = monthRows.length;
  const unidades = monthRows.reduce((a,r)=>{
    try{ const arr=JSON.parse(r.items||'[]'); return a+(Array.isArray(arr)?arr.reduce((s,x)=>s+(Number(x.qty)||0),0):0); }
    catch{ return a; }
  },0);
  const ingresos = monthRows.reduce((a,r)=>a+r.total,0);
  const ganMes   = monthRows.reduce((a,r)=>a+r.ganancia,0);

  const byMethod = {efectivo:0, mp:0, otros:0};
  monthRows.forEach(r=>{ byMethod[mediosMap(r.metodo)] += Number(r.total||0); });

  $('#kpiVentas').text(ventas);
  $('#kpiUnidades').text(unidades);
  $('#kpiIngresos').text($fmt(ingresos));
  $('#kpiGananciaMes').text($fmt(ganMes));
  $('#kpiEfectivoMes').text($fmt(byMethod.efectivo));
  $('#kpiMpMes').text($fmt(byMethod.mp));

  // KPIs del día + cierre
  renderKPIsDia();

  // Tabla
  const $tb=$('#tbodyVentas'); $tb.empty();
  monthRows.slice().sort((a,b)=>b.date-a.date).forEach(r=>{
    let itemsTxt='';
    try{ const arr=JSON.parse(r.items||'[]'); itemsTxt = Array.isArray(arr)? arr.map(x=>`${x.nombre||''} x${x.qty||1}`).join(', ') : ''; }catch{}
    $tb.append(`<tr>
      <td class="p-2">${r.ts.toString().slice(0,19).replace('T',' ')}</td>
      <td class="p-2">${r.cliente||''}</td>
      <td class="p-2">${r.mesa||''}</td>
      <td class="p-2">${r.metodo||''}</td>
      <td class="p-2">${itemsTxt}</td>
      <td class="p-2 text-right">${$fmt(r.total)}</td>
      <td class="p-2 text-right">${$fmt(r.ganancia)}</td>
    </tr>`);
  });
}

function renderKPIsDia(){
  // set default day inside selected month
  if(!$('#diaFiltro').val()){
    const now=new Date(); const key=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(key===mesSelKey) $('#diaFiltro').val(now.toISOString().slice(0,10));
  }
  const selDia=$('#diaFiltro').val(); if(!selDia) return;
  const [yy,mm]=mesSelKey.split('-').map(Number);
  const rowsDia = ROWS.filter(r=> sameYMonth(r.date,yy,mm) && r.date.toISOString().slice(0,10)===selDia);

  const hFrom=$('#horaDesde').val(), hTo=$('#horaHasta').val();
  const inTime=(dt)=>{
    if(!hFrom && !hTo) return true;
    const hhmm = dt.toTimeString().slice(0,5);
    if(hFrom && hhmm < hFrom) return false;
    if(hTo   && hhmm > hTo)   return false;
    return true;
  };
  const rowsDiaTime = rowsDia.filter(r=>inTime(r.date));

  const ing = rowsDiaTime.reduce((a,r)=>a+r.total,0);
  const cos = rowsDiaTime.reduce((a,r)=>a+r.totalCosto,0);
  const gan = rowsDiaTime.reduce((a,r)=>a+r.ganancia,0);
  const uni = rowsDiaTime.reduce((a,r)=>{
    try{ const arr=JSON.parse(r.items||'[]'); return a+(Array.isArray(arr)?arr.reduce((s,x)=>s+(Number(x.qty)||0),0):0); }
    catch{ return a; }
  },0);

  $('#kpiIngDia').text($fmt(ing));
  $('#kpiCostoDia').text($fmt(cos));
  $('#kpiGanDia').text($fmt(gan));
  $('#kpiVentasDia').text(rowsDiaTime.length);
  $('#kpiUniDia').text(uni);

  // Cierre y reparto (usa input manual de gastos)
  $('#cierreIng').text($fmt(ing));
  $('#cierreCosto').text($fmt(cos));
  const bruta = ing - cos;
  $('#cierreBruta').text($fmt(bruta));
  const gastos = Number($('#cierreGastos').val()||0);
  $('#cierreGastosLbl').text($fmt(gastos));
  const neta = bruta - gastos;
  $('#cierreNeta').text($fmt(neta));
  const personas = Math.max(1, Number($('#cierrePersonas').val()||1));
  $('#cierrePorPersona').text($fmt(neta/personas));
  $('#cierreRangoLbl').text(`${selDia}${(hFrom||hTo)?` · ${hFrom||'00:00'}–${hTo||'23:59'}`:''}`);
  $('#kpiGanDiaLbl').text(`${rowsDiaTime.length} ventas · ${uni} unid.`);
}

/* ================== Gastos (API compatible con tu HTML) ================== */
const API = '/.netlify/functions/gs-order';

(function initGastosUI(){
  const hoy=new Date().toISOString().slice(0,10);
  const $f=document.getElementById('gFecha');
  if($f && !$f.value) $f.value=hoy;
})();

async function guardarGasto(){
  const fecha      = (document.getElementById('gFecha').value || '').trim();
  const categoria  = (document.getElementById('gCategoria').value || 'Otros').trim();
  const concepto   = (document.getElementById('gConcepto').value || '').trim();
  const proveedor  = (document.getElementById('gProveedor').value || '').trim();
  const montoNum   = Number(document.getElementById('gMonto').value || 0);
  const nota       = (document.getElementById('gNota').value || '').trim();
  const $btn       = document.getElementById('btnGuardarGasto');
  const $msg       = document.getElementById('gMsg');

  if(!fecha || !concepto || !Number.isFinite(montoNum) || montoNum<=0){
    alert('Completá Fecha, Concepto y un Monto válido.');
    return;
  }
  const payload = {
    type:'expense',
    fecha,
    categoria_gasto: categoria,
    concepto,
    proveedor,
    qty:1,
    costo_unit: montoNum,
    nota
  };

  try{
    $btn.disabled=true; $btn.textContent='Guardando…'; $msg.textContent='';
    const res = await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:'payload='+encodeURIComponent(JSON.stringify(payload))
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.ok!==true) throw new Error(data.error || `HTTP ${res.status}`);

    document.getElementById('gConcepto').value='';
    document.getElementById('gProveedor').value='';
    document.getElementById('gMonto').value='';
    document.getElementById('gNota').value='';
    $msg.textContent='✅ Gasto guardado';
    await cargarGastosRecientes();
  }catch(err){
    console.error(err);
    alert('No se pudo guardar el gasto: '+err.message);
  }finally{
    $btn.disabled=false; $btn.textContent='Guardar gasto';
  }
}

async function cargarGastosRecientes(){
  try{
    const res = await fetch(`${API}?action=items&limit=50`);
    const json = await res.json();
    if(json?.ok!==true) throw new Error(json?.error || 'Error al leer ITEMS');
    const rows = (json.items||[]).filter(it=> String(it.tipo).toLowerCase()==='compra');
    const $tb=document.getElementById('tbodyGastos'); if(!$tb) return;
    $tb.innerHTML = rows.map(r=>`
      <tr>
        <td class="p-2">${(r.fecha||'').toString().slice(0,10)}</td>
        <td class="p-2">${r.categoria_gasto||'-'}</td>
        <td class="p-2">${r.concepto||'-'}</td>
        <td class="p-2 text-right">${$fmt(r.subtotal || r.costo_unit || 0)}</td>
      </tr>
    `).join('');
  }catch(err){ console.error('cargarGastosRecientes', err); }
}

/* ================== Widgets Plan del Mes ================== */
const SETTINGS_KEY = 'reporte-plan-mes';
let PLAN = {
  alquilerObjetivo: 990000,
  pctAlquiler: 40,
  pctReposicion: 40,
  pctArreglos: 20,
  sueldos: [],         // {nombre,monto}
  franquero: { horas:0, tarifa:0 }
};
function loadPlanSettings(){
  try{
    const raw=localStorage.getItem(SETTINGS_KEY);
    if(raw){
      const s=JSON.parse(raw);
      PLAN = Object.assign({}, PLAN, s, { franquero: Object.assign({horas:0,tarifa:0}, s?.franquero||{}) });
    }
  }catch{}
}
function savePlanSettings(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(PLAN)); }catch{} }

function renderSueldosList(){
  const wrap=document.getElementById('sueldosList'); if(!wrap) return;
  wrap.innerHTML='';
  PLAN.sueldos.forEach((s,idx)=>{
    const row=document.createElement('div');
    row.className='grid grid-cols-12 gap-2 items-center';
    row.innerHTML = `
      <input data-idx="${idx}" data-k="nombre" class="col-span-6 rounded-xl border-gray-300 px-2 py-1 text-sm" placeholder="Nombre" value="${s.nombre||''}">
      <input data-idx="${idx}" data-k="monto"  type="number" min="0" step="1000" class="col-span-4 rounded-xl border-gray-300 px-2 py-1 text-sm" placeholder="Monto" value="${Number(s.monto||0)}">
      <button data-idx="${idx}" data-k="del" class="col-span-2 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs">✕</button>
    `;
    wrap.appendChild(row);
  });
  // delegación
  wrap.oninput = (e)=>{
    const idx=Number(e.target.getAttribute('data-idx')); const k=e.target.getAttribute('data-k');
    if(!Number.isInteger(idx)||!k) return;
    if(k==='nombre') PLAN.sueldos[idx].nombre = e.target.value;
    if(k==='monto')  PLAN.sueldos[idx].monto  = Number(e.target.value||0);
    savePlanSettings(); renderSueldosList();
  };
  wrap.onclick = (e)=>{
    if(e.target.getAttribute('data-k')==='del'){
      const idx=Number(e.target.getAttribute('data-idx'));
      PLAN.sueldos.splice(idx,1); savePlanSettings(); renderSueldosList();
    }
  };
  const tot = PLAN.sueldos.reduce((a,s)=>a+(Number(s.monto)||0),0);
  document.getElementById('sueldosTotal')?.replaceChildren(document.createTextNode($fmt(tot)));
}

function renderPlanMes(){
  document.getElementById('planMesLabel')?.replaceChildren(document.createTextNode(mesSelKey || '-'));

  // inputs -> estado
  const elObj=document.getElementById('alqObjetivo');
  const elPA =document.getElementById('alqPct');
  const elPR =document.getElementById('repPct');
  const elPA2=document.getElementById('arrPct');
  const elFH =document.getElementById('franqHoras');
  const elFT =document.getElementById('franqTarifa');
  if(elObj) elObj.value=PLAN.alquilerObjetivo;
  if(elPA)  elPA.value =PLAN.pctAlquiler;
  if(elPR)  elPR.value =PLAN.pctReposicion;
  if(elPA2) elPA2.value=PLAN.pctArreglos;
  if(elFH)  elFH.value =PLAN.franquero.horas;
  if(elFT)  elFT.value =PLAN.franquero.tarifa;

  const month = monthRowsSel();
  const costoMes    = month.reduce((a,r)=>a+r.totalCosto,0);
  const gananciaMes = month.reduce((a,r)=>a+r.ganancia,0);
  document.getElementById('alqCostoMes')?.replaceChildren(document.createTextNode($fmt(costoMes)));
  document.getElementById('ganMesLbl')?.replaceChildren(document.createTextNode($fmt(gananciaMes)));

  // asignaciones desde COSTO del mes
  const mAlq = Math.max(0, Math.round(costoMes * (PLAN.pctAlquiler/100)));
  const mRep = Math.max(0, Math.round(costoMes * (PLAN.pctReposicion/100)));
  const mArr = Math.max(0, Math.round(costoMes * (PLAN.pctArreglos/100)));
  const sumPct = PLAN.pctAlquiler + PLAN.pctReposicion + PLAN.pctArreglos;
  const pctLibre = Math.max(0, 100 - sumPct);
  const libreMonto = Math.max(0, Math.round(costoMes * (pctLibre/100)));

  document.getElementById('alqDestinado')?.replaceChildren(document.createTextNode($fmt(mAlq)));
  document.getElementById('repMonto')?.replaceChildren(document.createTextNode($fmt(mRep)));
  document.getElementById('arrMonto')?.replaceChildren(document.createTextNode($fmt(mArr)));
  document.getElementById('pctLibre')?.replaceChildren(document.createTextNode(`${pctLibre}%`));
  document.getElementById('libreMonto')?.replaceChildren(document.createTextNode($fmt(libreMonto)));
  document.getElementById('pctWarn')?.classList.toggle('hidden', sumPct<=100);

  // progreso alquiler hacia objetivo
  const objetivo = Math.max(0, Number(PLAN.alquilerObjetivo||0));
  const prog = objetivo>0 ? Math.min(100, Math.round((mAlq/objetivo)*100)) : 0;
  document.getElementById('alqPctProgreso')?.replaceChildren(document.createTextNode(`${prog}%`));
  const bar=document.getElementById('alqBar'); if(bar) bar.style.width = `${prog}%`;
  const falta=Math.max(0, objetivo - mAlq);
  document.getElementById('alqFalta')?.replaceChildren(document.createTextNode($fmt(falta)));

  // sueldos + franquero
  renderSueldosList();
  const franqTotal = Math.max(0, Math.round((Number(PLAN.franquero.horas)||0)*(Number(PLAN.franquero.tarifa)||0)));
  document.getElementById('franqTotal')?.replaceChildren(document.createTextNode($fmt(franqTotal)));
}

function bindPlanMesEvents(){
  $('#alqObjetivo').on('input', function(){ PLAN.alquilerObjetivo = Number(this.value||0); savePlanSettings(); renderPlanMes(); });
  $('#alqPct').on('input',       function(){ PLAN.pctAlquiler     = Math.min(100, Math.max(0, Number(this.value||0))); savePlanSettings(); renderPlanMes(); });
  $('#repPct').on('input',       function(){ PLAN.pctReposicion   = Math.min(100, Math.max(0, Number(this.value||0))); savePlanSettings(); renderPlanMes(); });
  $('#arrPct').on('input',       function(){ PLAN.pctArreglos     = Math.min(100, Math.max(0, Number(this.value||0))); savePlanSettings(); renderPlanMes(); });
  $('#btnAddSueldo').on('click', function(){ PLAN.sueldos.push({nombre:'',monto:0}); savePlanSettings(); renderSueldosList(); });
  $('#franqHoras').on('input',   function(){ PLAN.franquero.horas  = Number(this.value||0); savePlanSettings(); renderPlanMes(); });
  $('#franqTarifa').on('input',  function(){ PLAN.franquero.tarifa = Number(this.value||0); savePlanSettings(); renderPlanMes(); });
}

/* ================== Eventos UI ================== */
$('#btnReload').on('click', async ()=>{ await loadCSV(); renderPlanMes(); });
$('#mesFiltro').on('change', function(){ mesSelKey=$(this).val(); renderAll(); renderPlanMes(); });
$('#diaFiltro, #horaDesde, #horaHasta, #cierrePersonas, #cierreGastos').on('input change', renderKPIsDia);
$('#btnHoy').on('click', ()=>{ const t=new Date().toISOString().slice(0,10); $('#diaFiltro').val(t).trigger('change'); });
$('#btnAyer').on('click', ()=>{ const d=new Date(); d.setDate(d.getDate()-1); $('#diaFiltro').val(d.toISOString().slice(0,10)).trigger('change'); });
$('#btnMenos2').on('click', ()=>{ const d=new Date(); d.setDate(d.getDate()-2); $('#diaFiltro').val(d.toISOString().slice(0,10)).trigger('change'); });

document.getElementById('btnGuardarGasto')?.addEventListener('click', guardarGasto);
document.getElementById('btnRecargarGastos')?.addEventListener('click', cargarGastosRecientes);

/* ================== Init ================== */
(async function(){
  try{
    loadPlanSettings();
    bindPlanMesEvents();
    await loadCSV();
    await cargarGastosRecientes();
  }catch(e){
    console.error(e);
    $('#statusBadge').text('Error');
    $('#diag').text(String(e));
  }
})();
