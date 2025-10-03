
(() => {
  // === Utilidades ===
  const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
  const toNum = (txt) => Number(String(txt||'').replace(/[^\d.-]/g,'')||0);
  const todayISO = () => new Date().toISOString().slice(0,10);
  const ymKey = (d) => d.slice(0,7); // 'YYYY-MM' para fechas ISO

  // === Lee "Últimos gastos" (tabla #tbodyGastos) ===
  function leerGastosDesdeTabla() {
    const rows = Array.from(document.querySelectorAll('#tbodyGastos tr'));
    return rows.map(tr => {
      const tds = tr.querySelectorAll('td');
      if (!tds || tds.length < 4) return null;
      const fecha = (tds[0].textContent||'').trim();    // 'YYYY-MM-DD'
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

  // === Pinta los KPIs ===
  function renderGastosKPI() {
    const hoy = todayISO();
    const ym  = hoy.slice(0,7);

    const dia = gastosDelDia(hoy);
    const mes = gastosDelMes(ym);

    const elDia = document.getElementById('kpiGastosDia');
    if (elDia) elDia.textContent = fmt(dia);

    // Cambiar título "Unidades (mes)" -> "Gastos del mes" si hace falta
    // (busca un nodo cercano al valor para renombrar)
    const elMes = document.getElementById('kpiGastosMes');
    if (elMes) {
      elMes.textContent = fmt(mes);
      // intenta ubicar el título dentro del mismo card
      const card = elMes.closest('[class*="card"], .rounded-2xl, .rounded-xl, .p-4, .p-3') || elMes.parentElement;
      if (card) {
        const titulo = card.querySelector('h3, h4, .text-slate-600, .text-slate-500, .kpi-title');
        if (titulo && /unidades/i.test(titulo.textContent)) titulo.textContent = 'Gastos del mes';
      }
    }

    // --- Hook para "Plan del mes" -> restar Gastos del mes del "Costo del mes" ---
    // Si tu Plan del mes lo calcula desde una variable global MES/ROWS, usamos el mismo mes visible:
    const labelMes = document.getElementById('planMesLabel')?.textContent || ''; // ej "10/2025"
    // Si no encontramos formato "mm/yyyy", caemos al mes actual (ym)
    let ymPlan = ym;
    const m = labelMes.match(/(\d{1,2})\/(\d{4})/);
    if (m) {
      const mm = String(m[1]).padStart(2,'0');
      ymPlan = `${m[2]}-${mm}`;
    }
    const gastoMesPlan = gastosDelMes(ymPlan);

    // Encontrá el nodo que muestra el "Costo del mes" en Plan del mes:
    // por ID según tu HTML:
    const costoEl = document.getElementById('alqCostoMes'); // <- este es el que vimos en tu captura
    if (costoEl) {
      // Obtenemos el valor actual (ya formateado), lo pasamos a número y le restamos los gastos del mes
      const actual = toNum(costoEl.textContent);
      const ajustado = Math.max(0, actual - gastoMesPlan);
      costoEl.textContent = fmt(ajustado);
    }
  }

  // Render inicial (cuando termina de popularse la tabla de gastos)
  // Reintenta un ratito por si la tabla se llena después del fetch.
  let tries = 0;
  const t = setInterval(() => {
    const ok = document.querySelector('#tbodyGastos tr');
    tries++;
    if (ok || tries > 30) {
      clearInterval(t);
      renderGastosKPI();
    }
  }, 250);

  // También re-render cuando toques "Recargar" gastos si tenés ese botón:
  document.getElementById('btnRecargarGastos')?.addEventListener('click', () => {
    setTimeout(renderGastosKPI, 800); // pequeño delay para esperar la recarga
  });

  // Si cambiás el "Mes" del Plan del mes, volvemos a ajustar "Costo del mes":
  document.getElementById('mesFiltro')?.addEventListener('change', () => {
    setTimeout(renderGastosKPI, 100);
  });
})();
