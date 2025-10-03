/* ================== Utils ================== */
const fmt = (n)=> new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(Number(n||0));
const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
const toDate = (s)=>{
  if(!s) return null;
  const t = String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
  if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
  const d = new Date(t); return isNaN(d) ? null : d;
};
const ymKey = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

/* ================== State ================== */
let ROWS = [];        // ventas del CSV normalizadas
let MES = '';         // yyyy-mm seleccionado
const LS_KEY_SETTINGS = 'onceydoce_plan_settings_v1';
const LS_KEY_SUELDOS  = 'onceydoce_sueldos_v1';

/* Valores por defecto */
let PLAN = {
  alquilerObjetivo: 990000,
  alquilerPct: 40,
  repPct: 40,
  arrPct: 20,
  franquero: { horas: 0, tarifa: 0 }
};
let SUELDOS = []; // [{nombre, monto}]

/* ================== LocalStorage ================== */
function loadLS(){
  try{
    const s = JSON.parse(localStorage.getItem(LS_KEY_SETTINGS)||'null');
    if(s){
      PLAN = { ...PLAN, ...s, franquero:{ horas:0, tarifa:0, ...(s.franquero||{}) } };
    }
  }catch{}
  try{
    const s2 = JSON.parse(localStorage.getItem(LS_KEY_SUELDOS)||'null');
    if(Array.isArray(s2)) SUELDOS = s2;
  }catch{}
}
function saveLS(){
  localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(PLAN));
  localStorage.setItem(LS_KEY_SUELDOS, JSON.stringify(SUELDOS));
}

/* ================== CSV ================== */
async function loadCSV(url){
  return new Promise((resolve,reject)=>{
    Papa.parse(url,{
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res)=>{
        try{
          const rows = (res.data||[]).map((r)=>{
            // detect columns
            const ts = r.Fecha || r.fecha || r.timestamp || r.Timestamp || r.ts || r.date || r.Date || r['Fecha (ISO)'] || '';
            const d  = toDate(ts);
            if(!d) return null;
            const total = Number(r.total || r.Total || r.monto || r.Monto || r.importe || r.Importe || 0);
            const metodo = (r.metodo || r.Metodo || r.metodoPago || r['Método'] || '').toString();
            return { date:d, total, metodo, y:d.getFullYear(), m:d.getMonth()+1, ym: ymKey(d) };
          }).filter(Boolean);
          ROWS = rows;
          resolve(rows);
        }catch(e){ reject(e); }
      },
      error: (err)=> reject(err)
    });
  });
}

function buildMesOptions(){
  const set = new Set(ROWS.map(r=>r.ym));
  const opts = [...set].sort().reverse();
  const sel = $('#mesFiltro').empty();
  opts.forEach(k=>{
    const [yy,mm] = k.split('-');
    const label = `${mm}/${yy}`;
    sel.append(`<option value="${k}">${label}</option>`);
  });
  if(opts.length && !MES){ MES = opts[0]; }
  sel.val(MES);
  $('#mesActual').text(sel.find('option:selected').text() || '-');
}

/* ================== Cálculos ================== */
function totalsForMes(ym){
  const rows = ROWS.filter(r=>r.ym===ym);
  const totalVentas = rows.reduce((a,x)=> a + (Number(x.total)||0), 0);
  return { totalVentas };
}

function calcPlan(){
  const { totalVentas } = totalsForMes(MES);
  const objetivo = Number(PLAN.alquilerObjetivo||0);
  const pctAlq   = clamp(Number(PLAN.alquilerPct||0), 0, 100);
  const pctRep   = clamp(Number(PLAN.repPct||0), 0, 100);
  const pctArr   = clamp(Number(PLAN.arrPct||0), 0, 100);
  const pctNo    = clamp(100 - (pctAlq+pctRep+pctArr), -100, 100);

  const destinadoMes = Math.round(totalVentas * pctAlq/100);
  const falta        = Math.max(0, objetivo - destinadoMes);
  const repMonto     = Math.round(totalVentas * pctRep/100);
  const arrMonto     = Math.round(totalVentas * pctArr/100);
  const noAsig       = Math.max(0, totalVentas - (destinadoMes+repMonto+arrMonto));

  const totalSueldos = SUELDOS.reduce((a,s)=> a + (Number(s.monto)||0), 0);
  const totalFr      = Math.round(Number(PLAN.franquero.horas||0) * Number(PLAN.franquero.tarifa||0));
  const ganancia     = Math.round(totalVentas - (destinadoMes + repMonto + arrMonto + totalSueldos + totalFr));

  return {
    totalVentas, objetivo, pctAlq, pctRep, pctArr, pctNo,
    destinadoMes, falta, repMonto, arrMonto, noAsig, totalSueldos, totalFr, ganancia
  };
}

/* ================== Render ================== */
function renderPlan(){
  const c = calcPlan();

  $('#alquilerObjetivo').text(fmt(PLAN.alquilerObjetivo||0));
  $('#alquilerPct').text(String(PLAN.alquilerPct||0));
  $('#costoMes').text(fmt(c.totalVentas));
  $('#destinadoMes').text(fmt(c.destinadoMes));
  const p = c.objetivo>0 ? clamp(Math.round((c.destinadoMes/c.objetivo)*100), 0, 100) : 0;
  $('#barAlquiler').css('width', p + '%');
  $('#alquilerFalta').text(fmt(c.falta));

  $('#repPct').text(String(PLAN.repPct||0));
  $('#arrPct').text(String(PLAN.arrPct||0));
  $('#noasigPct').text(`${clamp(100 - (Number(PLAN.alquilerPct||0) + Number(PLAN.repPct||0) + Number(PLAN.arrPct||0)), -100, 100)}%`);
  $('#repMonto').text(fmt(c.repMonto));
  $('#arrMonto').text(fmt(c.arrMonto));
  $('#noasigMonto').text(fmt(c.noAsig));

  // Sueldos
  const ul = $('#listaSueldos').empty();
  if(SUELDOS.length===0){
    ul.append(`<li class="text-slate-500 text-sm">No hay sueldos cargados.</li>`);
  }else{
    SUELDOS.forEach((s,i)=>{
      ul.append(`<li class="flex items-center justify-between bg-slate-50 border rounded-lg px-3 py-2">
        <span>${s.nombre}</span>
        <span class="mono">${fmt(s.monto)}</span>
        <button data-i="${i}" class="btn btn-sm btnDelSueldo">Borrar</button>
      </li>`);
    });
  }
  $('#totalSueldos').text(fmt(c.totalSueldos));

  // Franquero
  $('#horasFr').val(PLAN.franquero.horas||0);
  $('#tarifaFr').val(PLAN.franquero.tarifa||0);
  $('#totalFr').text(fmt(c.totalFr));

  // Ganancia
  $('#gananciaMes').text(fmt(c.ganancia));
}

/* ================== Events ================== */
function bindEvents(){
  $('#btnCargar').on('click', async()=>{
    const url = $('#csvUrl').val().trim();
    if(!url){ alert('Pegá la URL CSV'); return; }
    $('#statusBadge').text('Cargando…');
    try{
      await loadCSV(url);
      buildMesOptions();
      renderPlan();
      $('#statusBadge').text('Listo');
    }catch(e){
      console.error(e); $('#statusBadge').text('Error al cargar'); alert(e.message||e);
    }
  });

  $('#mesFiltro').on('change', ()=>{
    MES = $('#mesFiltro').val();
    $('#mesActual').text($('#mesFiltro option:selected').text() || '-');
    renderPlan();
  });

  $('#btnAddSueldo').on('click', ()=>{
    const nombre = prompt('Nombre del sueldo (ej: Maxi / Javier / Matías):','');
    if(!nombre) return;
    const monto = Number(prompt('Monto ARS:', '0')||0);
    SUELDOS.push({nombre, monto});
    saveLS();
    renderPlan();
  });

  $(document).on('click','.btnDelSueldo', function(){
    const i = Number(this.dataset.i);
    SUELDOS.splice(i,1);
    saveLS();
    renderPlan();
  });

  $('#horasFr').on('input', ()=>{
    PLAN.franquero.horas = Number($('#horasFr').val()||0);
    saveLS(); renderPlan();
  });
  $('#tarifaFr').on('input', ()=>{
    PLAN.franquero.tarifa = Number($('#tarifaFr').val()||0);
    saveLS(); renderPlan();
  });
}

/* ================== Init ================== */
$(function(){
  loadLS();
  bindEvents();
  buildMesOptions();
  renderPlan();
});
