
// ============================ Utilidades ============================
const $fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const toDate = (s) => {
  if(!s) return null;
  const t=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
  if(/^\d{2}\/\d{2}\/\d{4}/.test(t)){ const [d,m,y]=t.split('/'); return new Date(`${y}-${m}-${d}`); }
  const d=new Date(t); return isNaN(d)? null : d;
};
const sameYMonth = (d,y,m)=> d && d.getFullYear()===y && (d.getMonth()+1)===m;
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// ============================ Estado ============================
let ROWS=[];              // ventas del CSV
let MES_OPTS=[];          // [{key:'2025-10', label:'Octubre 2025'}]
let mesSelKey='';         // yyyy-mm
let EXPENSES=[];          // gastos desde API (tipo compra)
const API_G = '/.netlify/functions/gs-order';

// ============ Plan del mes (persistente) ============
const SETTINGS_KEY='reporte-plan-mes';
let PLAN = {
  alquilerObjetivo: 990000,
  pctAlquiler: 40,
  pctReposicion: 40,
  pctArreglos: 20,
  sueldos: [],
  franquero: { horas:0, tarifa:0 }
};
function loadPlan(){ try{ const r=localStorage.getItem(SETTINGS_KEY); if(r){ const s=JSON.parse(r)||{}; PLAN={...PLAN, ...s, franquero:{horas:0,tarifa:0, ...(s.franquero||{})}} } }catch{}
function savePlan(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(PLAN)); }catch{} }

// ============================ CSV ============================
async function loadCSV(){
  const url=$('#csvUrl').val().trim();
  $('#statusBadge').text('Cargando CSV…');
  return new Promise((resolve,reject)=>{
    Papa.parse(url,{
      download:true, header:true, skipEmptyLines:true,
      complete:(res)=>{
        try{
          ROWS=(res.data||[]).map(r=>{
            const ts=r.timestamp||r.fecha||r.Timestamp||'';
            const d=toDate(ts);
            return {
              ts, date:d,
              y:d?d.getFullYear():null, m:d?d.getMonth()+1:null, d:d?d.getDate():null,
              cliente:r.cliente||r.Cliente||'',
              mesa:r.mesa||r.Mesa||'',
              metodo:(r.metodoPago||r.metodo||r.Metodo||'').toString().trim(),
              total:Number(r.total||r.Total||0),
              totalCosto:Number(r.totalCosto||r.TotalCosto||0),
              ganancia:Number(r.ganancia||r.Ganancia|| (Number(r.total||0)-Number(r.totalCosto||0))),
              items:r['items(json)']||r.items||'[]'
            };
          }).filter(r=>r.date);
          buildMesOptions();
          $('#statusBadge').text('Menú sincronizado');
          resolve();
        }catch(e){ reject(e); }
      },
      error:reject
    });
  });
}
function buildMesOptions(){
  const set=new Set(ROWS.map(r=>`${r.y}-${String(r.m).padStart(2,'0')}`));
  MES_OPTS=[...set].sort().reverse().map(key=>{
    const [yy,mm]=key.split('-'); const d=new Date(Number(yy),Number(mm)-1,1);
    const label=d.toLocaleDateString('es-AR',{month:'long',year:'numeric'}); 
    return {key, label:label.charAt(0).toUpperCase()+label.slice(1)};
  });
  const sel=$('#mesFiltro'); sel.empty();
  MES_OPTS.forEach(o=> sel.append(`<option value="${o.key}">${o.label}</option>`));
  const now=new Date(); const nowKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  mesSelKey = MES_OPTS.find(o=>o.key===nowKey)?.key || MES_OPTS[0]?.key || '';
  if(mesSelKey) sel.val(mesSelKey);
  renderAll();
}

// ============================ Gastos (API) ============================
async function cargarGastosRecientes(){
  try{
    const res=await fetch(`${API_G}?action=items&limit=200`);
    const json=await res.json().catch(()=>null);
    if(!json || json.ok!==true){ console.warn('API gastos', json); return; }
    EXPENSES=(json.items||[]).filter(x=> String(x.tipo).toLowerCase()==='compra')
      .map(r=>({ fecha:(r.fecha||'').toString().slice(0,10), monto:Number(r.subtotal||r.costo_unit||0), categoria:r.categoria_gasto||'', concepto:r.concepto||'' }));
    // pintar tabla
    const $tb=document.getElementById('tbodyGastos'); if($tb){
      $tb.innerHTML = EXPENSES.slice(0,50).map(r=>`
        <tr><td class="p-2">${r.fecha}</td><td class="p-2">${r.categoria}</td><td class="p-2">${r.concepto}</td><td class="p-2 text-right">${$fmt(r.monto)}</td></tr>
      `).join('');
    }
    // refrescar cierre día
    renderKPIsDia();
  }catch(e){ console.error('cargarGastosRecientes',e); }
}
async function guardarGasto(){
  const fecha = ($('#gFecha').val()||'').trim();
  const categoria = ($('#gCategoria').val()||'Otros').trim();
  const concepto = ($('#gConcepto').val()||'').trim();
  const proveedor = ($('#gProveedor').val()||'').trim();
  const monto = Number($('#gMonto').val()||0);
  const nota = ($('#gNota').val()||'').trim();
  if(!fecha || !concepto || !(monto>0)){ alert('Completá Fecha, Concepto y un Monto válido.'); return; }
  const payload={ type:'expense', fecha, categoria_gasto:categoria, concepto, proveedor, qty:1, costo_unit:monto, nota };
  const $btn=$('#btnGuardarGasto'); const $msg=$('#gMsg');
  try{
    $btn.prop('disabled',true).text('Guardando…'); $msg.text('');
    const res=await fetch(API_G,{method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:'payload='+encodeURIComponent(JSON.stringify(payload))});
    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.ok!==true) throw new Error(data.error||`HTTP ${res.status}`);
    $('#gConcepto,#gProveedor,#gMonto,#gNota').val('');
    $msg.text('✅ Gasto guardado');
    await cargarGastosRecientes();
  }catch(e){ alert('No se pudo guardar el gasto: '+e.message); }
  finally{ $btn.prop('disabled',false).text('Guardar gasto'); }
}

// ============================ Render general ============================
function mediosMap(m){
  const s=(m||'').toLowerCase();
  if(s.includes('efect')) return 'efectivo';
  if(s.includes('mp')||s.includes('mercado')||s.includes('qr')) return 'mp';
  return 'otros';
}

function renderAll(){
  if(!mesSelKey) return;
  const [yy,mm]=mesSelKey.split('-').map(Number);
  const monthRows=ROWS.filter(r=> sameYMonth(r.date,yy,mm));

  // KPIs mes
  const ventas = monthRows.length;
  const unidades = monthRows.reduce((a,r)=>{ let n=0; try{ const arr=JSON.parse(r.items||'[]'); if(Array.isArray(arr)) n=arr.reduce((s,x)=>s+(Number(x.qty)||0),0);}catch{} return a+n; },0);
  const ingresos = monthRows.reduce((a,r)=>a+Number(r.total||0),0);
  const costoMes = monthRows.reduce((a,r)=>a+Number(r.totalCosto||0),0);
  const ganMes = monthRows.reduce((a,r)=>a+Number(r.ganancia||0),0);
  const byMethod={efectivo:0,mp:0,otros:0}; monthRows.forEach(r=> byMethod[mediosMap(r.metodo)] += Number(r.total||0));

  $('#kpiVentas').text(ventas);
  $('#kpiUnidades').text(unidades);
  $('#kpiIngresos').text($fmt(ingresos));
  $('#kpiGananciaMes').text($fmt(ganMes));
  $('#kpiEfectivoMes').text($fmt(byMethod.efectivo));
  $('#kpiMpMes').text($fmt(byMethod.mp));

  // Tabla (simple)
  const $tb=$('#tbodyVentas'); $tb.empty();
  monthRows.slice().sort((a,b)=>b.date-a.date).forEach(r=>{
    let itemsTxt=''; try{ const arr=JSON.parse(r.items||'[]'); itemsTxt=Array.isArray(arr)?arr.map(x=>`${x.nombre||''} x${x.qty||1}`).join(', '):''; }catch{}
    $tb.append(`<tr>
      <td class="p-2">${(r.ts||'').toString().slice(0,19).replace('T',' ')}</td>
      <td class="p-2">${r.cliente||''}</td>
      <td class="p-2">${r.mesa||''}</td>
      <td class="p-2">${r.metodo||''}</td>
      <td class="p-2">${itemsTxt}</td>
      <td class="p-2 text-right">${$fmt(r.total)}</td>
      <td class="p-2 text-right">${$fmt(r.ganancia)}</td>
    </tr>`);
  });

  // Plan del mes
  renderPlanMes(costoMes, ganMes);

  // KPIs del día / cierre
  renderKPIsDia();
}

function renderKPIsDia(){
  if(!mesSelKey) return;
  const [yy,mm]=mesSelKey.split('-').map(Number);
  // set default day if empty
  if(!$('#diaFiltro').val()){
    const today=new Date(); const key=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    if(key===mesSelKey) $('#diaFiltro').val(today.toISOString().slice(0,10));
  }
  const selDia=$('#diaFiltro').val(); if(!selDia) return;

  const hFrom=$('#horaDesde').val()||null; const hTo=$('#horaHasta').val()||null;
  const inRange = (dt)=>{
    if(!hFrom && !hTo) return true;
    const hhmm = dt.toTimeString().slice(0,5);
    if(hFrom && hhmm < hFrom) return false;
    if(hTo && hhmm > hTo) return false;
    return true;
  };

  const rowsDia=ROWS.filter(r => sameYMonth(r.date,yy,mm) && r.date.toISOString().slice(0,10)===selDia && inRange(r.date));
  const ing = rowsDia.reduce((a,r)=>a+r.total,0);
  const cos = rowsDia.reduce((a,r)=>a+r.totalCosto,0);
  const gan = rowsDia.reduce((a,r)=>a+r.ganancia,0);
  const uni = rowsDia.reduce((a,r)=>{ let n=0; try{ const arr=JSON.parse(r.items||'[]'); if(Array.isArray(arr)) n=arr.reduce((s,x)=>s+(Number(x.qty)||0),0);}catch{} return a+n; },0);

  $('#kpiIngDia').text($fmt(ing));
  $('#kpiCostoDia').text($fmt(cos));
  $('#kpiGanDia').text($fmt(gan));
  $('#kpiVentasDia').text(rowsDia.length);
  $('#kpiUniDia').text(uni);

  // Cierre y reparto
  $('#cierreIng').text($fmt(ing));
  $('#cierreCosto').text($fmt(cos));
  $('#cierreBruta').text($fmt(ing-cos));

  // Gastos del local (API) + input manual
  const manual = Number($('#cierreGastos').val()||0);
  const gastosDia = EXPENSES.filter(g => g.fecha===selDia).reduce((a,g)=>a+Number(g.monto||0),0);
  const totalGastos = gastosDia + manual;
  $('#cierreGastosLbl').text($fmt(totalGastos));
  const neta = (ing - cos) - totalGastos;
  $('#cierreNeta').text($fmt(neta));
  const personas = Math.max(1, Number($('#cierrePersonas').val()||1));
  $('#cierrePorPersona').text($fmt(neta/personas));
  $('#cierreRangoLbl').text(`${selDia}${(hFrom||hTo)?` · ${hFrom||'00:00'}–${hTo||'23:59'}`:''}`);
  $('#kpiGanDiaLbl').text(`${rowsDia.length} ventas · ${uni} unid.`);
}

// ============================ Plan del mes (UI) ============================
function renderSueldosList(){
  const wrap=document.getElementById('sueldosList'); if(!wrap) return;
  wrap.innerHTML='';
  PLAN.sueldos.forEach((s,idx)=>{
    const row=document.createElement('div');
    row.className='grid grid-cols-12 gap-2 items-center';
    row.innerHTML=`
      <input data-idx="${idx}" data-k="nombre" class="col-span-6 rounded-xl border-gray-300 px-2 py-1 text-sm" placeholder="Nombre" value="${s.nombre||''}">
      <input data-idx="${idx}" data-k="monto" type="number" min="0" step="1000" class="col-span-4 rounded-xl border-gray-300 px-2 py-1 text-sm" placeholder="Monto" value="${Number(s.monto||0)}">
      <button data-idx="${idx}" data-k="del" class="col-span-2 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs">✕</button>
    `;
    wrap.appendChild(row);
  });
  const tot=PLAN.sueldos.reduce((a,s)=>a+Number(s.monto||0),0);
  document.getElementById('sueldosTotal').textContent=$fmt(tot);

  // delegación (una sola vez por render)
  wrap.oninput = (e)=>{
    const idx=Number(e.target.getAttribute('data-idx')), k=e.target.getAttribute('data-k');
    if(!Number.isInteger(idx)||!k) return;
    if(k==='nombre') PLAN.sueldos[idx].nombre=e.target.value;
    if(k==='monto')  PLAN.sueldos[idx].monto =Number(e.target.value||0);
    savePlan(); renderSueldosList();
  };
  wrap.onclick = (e)=>{
    if(e.target.getAttribute('data-k')==='del'){
      const idx=Number(e.target.getAttribute('data-idx'));
      PLAN.sueldos.splice(idx,1); savePlan(); renderSueldosList();
    }
  };
}

function renderPlanMes(costoMes, ganMes){
  // label del mes
  const label = MES_OPTS.find(o=>o.key===mesSelKey)?.label || '-';
  document.getElementById('planMesLabel').textContent = label;

  // setear inputs desde PLAN
  $('#alqObjetivo').val(PLAN.alquilerObjetivo);
  $('#alqPct').val(PLAN.pctAlquiler);
  $('#repPct').val(PLAN.pctReposicion);
  $('#arrPct').val(PLAN.pctArreglos);
  $('#franqHoras').val(PLAN.franquero.horas);
  $('#franqTarifa').val(PLAN.franquero.tarifa);

  // números base del mes
  $('#ganMesLbl').text($fmt(ganMes));
  $('#alqCostoMes').text($fmt(costoMes));

  // cálculos por % (sobre el COSTO del mes)
  const mAlq=Math.max(0, Math.round(costoMes * (PLAN.pctAlquiler/100)));
  const mRep=Math.max(0, Math.round(costoMes * (PLAN.pctReposicion/100)));
  const mArr=Math.max(0, Math.round(costoMes * (PLAN.pctArreglos/100)));
  const sumPct = PLAN.pctAlquiler + PLAN.pctReposicion + PLAN.pctArreglos;
  const pctLibre = Math.max(0, 100 - sumPct);
  const libreMonto = Math.max(0, Math.round(costoMes*(pctLibre/100)));

  $('#alqDestinado').text($fmt(mAlq));
  $('#repMonto').text($fmt(mRep));
  $('#arrMonto').text($fmt(mArr));
  $('#libreMonto').text($fmt(libreMonto));
  $('#pctLibre').text(`${pctLibre}%`);
  document.getElementById('pctWarn').classList.toggle('hidden', sumPct<=100);

  // progreso vs objetivo
  const objetivo=Math.max(0, Number(PLAN.alquilerObjetivo||0));
  const prog = objetivo>0 ? Math.min(100, Math.round((mAlq/objetivo)*100)) : 0;
  $('#alqPctProgreso').text(`${prog}%`);
  document.getElementById('alqBar').style.width = `${prog}%`;
  $('#alqFalta').text($fmt(Math.max(0, objetivo - mAlq)));

  // sueldos & franquero
  renderSueldosList();
  const franqTotal = Math.max(0, Math.round((Number(PLAN.franquero.horas)||0) * (Number(PLAN.franquero.tarifa)||0)));
  $('#franqTotal').text($fmt(franqTotal));
}

// ============================ Eventos ============================
function bindEvents(){
  // Mes
  $('#mesFiltro').on('change', function(){ mesSelKey=$(this).val(); renderAll(); });

  // Día / horario / cierre
  $('#diaFiltro,#horaDesde,#horaHasta,#cierrePersonas,#cierreGastos').on('input change', renderKPIsDia);
  $('#btnHoy').on('click', ()=>{ const t=new Date().toISOString().slice(0,10); $('#diaFiltro').val(t).trigger('change'); });
  $('#btnAyer').on('click', ()=>{ const d=new Date(); d.setDate(d.getDate()-1); $('#diaFiltro').val(d.toISOString().slice(0,10)).trigger('change'); });
  $('#btnMenos2').on('click', ()=>{ const d=new Date(); d.setDate(d.getDate()-2); $('#diaFiltro').val(d.toISOString().slice(0,10)).trigger('change'); });

  // Plan del mes inputs
  $('#alqObjetivo').on('input', function(){ PLAN.alquilerObjetivo=Number(this.value||0); savePlan(); renderAll(); });
  $('#alqPct').on('input', function(){ PLAN.pctAlquiler=Math.min(100,Math.max(0,Number(this.value||0))); savePlan(); renderAll(); });
  $('#repPct').on('input', function(){ PLAN.pctReposicion=Math.min(100,Math.max(0,Number(this.value||0))); savePlan(); renderAll(); });
  $('#arrPct').on('input', function(){ PLAN.pctArreglos=Math.min(100,Math.max(0,Number(this.value||0))); savePlan(); renderAll(); });

  $('#btnAddSueldo').on('click', ()=>{ PLAN.sueldos.push({nombre:'',monto:0}); savePlan(); renderSueldosList(); });

  $('#franqHoras').on('input', function(){ PLAN.franquero.horas=Number(this.value||0); savePlan(); renderAll(); });
  $('#franqTarifa').on('input', function(){ PLAN.franquero.tarifa=Number(this.value||0); savePlan(); renderAll(); });

  // Gastos
  $('#btnGuardarGasto').on('click', guardarGasto);
  $('#btnRecargarGastos').on('click', cargarGastosRecientes);

  // Recargar CSV
  $('#btnReload').on('click', async()=>{ await loadCSV(); });
}

// ============================ Init ============================
(async function(){
  loadPlan();
  const hoy=new Date().toISOString().slice(0,10);
  if(!$('#gFecha').val()) $('#gFecha').val(hoy);
  try{
    await loadCSV();
    await cargarGastosRecientes();
  }catch(e){
    console.error(e);
    $('#statusBadge').text('Error'); $('#diag').text(String(e));
  }
  bindEvents();
})();
