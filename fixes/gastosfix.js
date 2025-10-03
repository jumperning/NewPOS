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
      const fecha = (tds[0].textContent||'').trim();    // YYYY-MM-DD
      const monto = toNum(tds[3].textContent);
      return { fecha, ym: ymKey(fecha), monto };
    }).filter(Boolean);
  }
  const gastosDelDia  = (fechaISO) => leerGastosDesdeTabla().filter(r => r.fecha === fechaISO).reduce((a,x)=>a+x.monto, 0);
  const gastosDelMes  = (ym)       => leerGastosDesdeTabla().filter(r => r.ym === ym).reduce((a,x)=>a+x.monto, 0);

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

    // Mostrar "Costo del mes" en Plan del mes = Gastos del mes (no ventas)
    const costoEl = document.getElementById('alqCostoMes');
    if (costoEl) costoEl.textContent = fmt(mes);
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