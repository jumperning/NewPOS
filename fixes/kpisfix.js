(function(){
  const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  const toNumAR = (txt) => { 
    const s = String(txt||'').replace(/\./g,'').replace(/,/g,'').replace(/[^\d-]/g,'');
    const n = Number(s || 0); 
    return isFinite(n) ? n : 0; 
  };
  const ymKey = (iso) => String(iso||'').slice(0,7);

  function leerGastosDesdeTabla(){
    const rows = Array.from(document.querySelectorAll('#tbodyGastos tr'));
    return rows.map(tr=>{
      const tds = tr.querySelectorAll('td');
      if (!tds || tds.length < 4) return null;
      const fechaISO = (tds[0].textContent||'').trim();
      const monto = toNumAR(tds[3].textContent);
      return { fecha: fechaISO, ym: ymKey(fechaISO), monto };
    }).filter(Boolean);
  }
  const gastosDelMes = (ym) => leerGastosDesdeTabla().filter(r=>r.ym===ym).reduce((a,x)=>a+x.monto,0);
  const gastosDelDia = (iso) => leerGastosDesdeTabla().filter(r=>r.fecha===iso).reduce((a,x)=>a+x.monto,0);

  function findCardContainerFrom(el){
    if(!el) return null;
    let p = el.parentElement;
    for(let i=0;i<6 && p;i++,p=p.parentElement){
      if((p.className||'').match(/grid|flex|cards|kpi|gap/)) return p;
    }
    return el.parentElement;
  }

  function ensureCostoMesCard(){
    if (document.getElementById('kpiCostoMes')) return;
    const gm = document.getElementById('kpiGastosMes');
    const targetRow = findCardContainerFrom(gm || document.getElementById('kpiIngresosMes') || document.body);
    if (!targetRow) return;
    const card = document.createElement('div');
    card.className = 'rounded-2xl border bg-white p-6 shadow-sm';
    card.innerHTML = `
      <div class="text-slate-600">Costo del mes</div>
      <div class="mt-2 text-3xl font-bold"><span id="kpiCostoMes">$ 0</span></div>
    `;
    if (gm && gm.closest('div')) {
      const ref = gm.closest('div');
      ref.parentElement?.insertBefore(card, ref.nextSibling);
    } else {
      targetRow.appendChild(card);
    }
  }

  function removeUnidadesDiaCard(){
    const headings = Array.from(document.querySelectorAll('h3, h4, .text-slate-600, .text-slate-500'));
    const h = headings.find(x => /unidades\s*\(d[ií]a\)/i.test(x.textContent||''));
    if (!h) return;
    let card = h;
    for(let i=0;i<5 && card;i++,card=card.parentElement){
      if((card.className||'').match(/rounded|border|card|shadow/)){ card.remove(); break; }
    }
  }

  function render(){
    const hoy = new Date().toISOString().slice(0,10);
    const ym  = hoy.slice(0,7);
    ensureCostoMesCard();

    const totalMes = gastosDelMes(ym);
    const totalDia = gastosDelDia(hoy);

    const kDia = document.getElementById('kpiGastosDia'); if (kDia) kDia.textContent = fmt(totalDia);
    const kMes = document.getElementById('kpiGastosMes'); if (kMes) kMes.textContent = fmt(totalMes);
    const kCostoMes = document.getElementById('kpiCostoMes'); if (kCostoMes) kCostoMes.textContent = fmt(totalMes);
  }

  function init(){
    let tries = 0;
    const t = setInterval(()=>{
      tries++;
      const haveRows = document.querySelector('#tbodyGastos tr');
      if (haveRows || tries>30){ clearInterval(t); render(); }
    }, 250);
    document.getElementById('btnRecargarGastos')?.addEventListener('click', ()=> setTimeout(render, 800));

    // Descomentá para sacar la tarjeta "Unidades (día)":
    // removeUnidadesDiaCard();
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();