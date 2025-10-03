(function(){
  const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  const toNum = (txt) => Number(String(txt||'').replace(/[^\d.-]/g,'')||0);
  const todayISO = () => new Date().toISOString().slice(0,10);
  const ymKey = (d) => d.slice(0,7);

  function leerGastosDesdeTabla() {
    const rows = Array.from(document.querySelectorAll('#tbodyGastos tr'));
    return rows.map(tr => {
      const tds = tr.querySelectorAll('td');
      if (!tds || tds.length < 4) return null;
      const fecha = (tds[0].textContent||'').trim();
      const monto = toNum(tds[3].textContent);
      return { fecha, ym: ymKey(fecha), monto };
    }).filter(Boolean);
  }
  function gastosDelDia(fechaISO) {
    const rows = leerGastosDesdeTabla();
    return rows.filter(r => r.fecha === fechaISO).reduce((a,x)=>a+x.monto, 0);
  }
  function gastosDelMes(ym) {
    const rows = leerGastosDesdeTabla();
    return rows.filter(r => r.ym === ym).reduce((a,x)=>a+x.monto, 0);
  }

  function renderGastosKPI() {
    const hoy = todayISO();
    const ym  = hoy.slice(0,7);
    const dia = gastosDelDia(hoy);
    const mes = gastosDelMes(ym);

    const elDia = document.getElementById('kpiGastosDia');
    if (elDia) elDia.textContent = fmt(dia);

    const elMes = document.getElementById('kpiGastosMes');
    if (elMes) {
      elMes.textContent = fmt(mes);
      const card = elMes.closest('[class*="card"], .rounded-2xl, .rounded-xl, .p-4, .p-3') || elMes.parentElement;
      if (card) {
        const titulo = card.querySelector('h3, h4, .text-slate-600, .text-slate-500, .kpi-title');
        if (titulo && /unidades/i.test(titulo.textContent)) titulo.textContent = 'Gastos del mes';
      }
    }

    // Ajustar "Costo del mes" en Plan del mes restando Gastos del mes
    let ymPlan = ym;
    const labelMes = document.getElementById('planMesLabel')?.textContent || '';
    const m = labelMes.match(/(\d{1,2})\/(\d{4})/);
    if (m) { const mm = String(m[1]).padStart(2,'0'); ymPlan = `${m[2]}-${mm}`; }
    const gastoMesPlan = gastosDelMes(ymPlan);
    const costoEl = document.getElementById('alqCostoMes');
    if (costoEl) {
      const actual = toNum(costoEl.textContent);
      const ajustado = Math.max(0, actual - gastoMesPlan);
      costoEl.textContent = fmt(ajustado);
    }
  }

  let tries = 0;
  const t = setInterval(() => {
    const ok = document.querySelector('#tbodyGastos tr');
    tries++;
    if (ok || tries > 30) {
      clearInterval(t);
      renderGastosKPI();
    }
  }, 250);

  document.getElementById('btnRecargarGastos')?.addEventListener('click', () => {
    setTimeout(renderGastosKPI, 800);
  });
  document.getElementById('mesFiltro')?.addEventListener('change', () => {
    setTimeout(renderGastosKPI, 100);
  });
})();