// netlify/functions/gs-order.js
// Proxy a tu Google Apps Script Web App.
// Requiere la env var GS_WEBAPP_URL (pegar la URL del deployment del Apps Script).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const WEBAPP_URL = process.env.GS_WEBAPP_URL; // <-- poné acá la URL como env var en Netlify
  if (!WEBAPP_URL) {
    return json(500, { ok: false, error: "Falta GS_WEBAPP_URL en variables de entorno" });
  }

  try {
    const isGET = event.httpMethod === "GET";
    const isPOST = event.httpMethod === "POST";

    // Construyo URL destino preservando querystring
    const url = new URL(WEBAPP_URL);
    if (event.rawQuery) {
      // mantengo los params que lleguen del front, ej: ?action=menu&limit=50
      url.search = event.rawQuery;
    }

    // Encabezados a reenviar (solo lo mínimo)
    const fwdHeaders = {};
    const ct = event.headers["content-type"] || event.headers["Content-Type"];
    if (ct) fwdHeaders["Content-Type"] = ct;

    let upstreamRes;

    if (isGET) {
      upstreamRes = await fetch(url.toString(), {
        method: "GET",
        headers: fwdHeaders,
      });
    } else if (isPOST) {
      // Reenvío el body tal cual llegue del front:
      // - application/x-www-form-urlencoded  (p.ej. payload=... o action=setStock&data=...)
      // - application/json                   (p.ej. {type:"expense",...})
      upstreamRes = await fetch(url.toString(), {
        method: "POST",
        headers: fwdHeaders,
        body: event.body,
      });
    } else {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    // Intento leer JSON; si no es JSON devuelvo texto
    const text = await upstreamRes.text();
    const isJson =
      upstreamRes.headers.get("content-type")?.includes("application/json") ||
      looksLikeJson(text);

    if (!upstreamRes.ok) {
      // subo el error del upstream con un cuerpo consistente
      return json(upstreamRes.status, {
        ok: false,
        status: upstreamRes.status,
        error: safeErr(text),
      });
    }

    if (isJson) {
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
        body: text,
      };
    } else {
      // (raro en Apps Script, pero por las dudas)
      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
        body: text,
      };
    }
  } catch (err) {
    return json(502, { ok: false, error: String(err?.message || err) });
  }
};

function json(code, obj) {
  return {
    statusCode: code,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function looksLikeJson(s = "") {
  const t = String(s).trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function safeErr(s = "") {
  const t = String(s).trim();
  if (looksLikeJson(t)) {
    try {
      const j = JSON.parse(t);
      return j.error || j.message || t.slice(0, 500);
    } catch {
      return t.slice(0, 500);
    }
  }
  // típicamente los 404 devuelven HTML con <!DOCTYPE...>
  if (t.startsWith("<!DOCTYPE")) return "Upstream devolvió HTML (posible 404/HTML de error).";
  return t.slice(0, 500);
}
