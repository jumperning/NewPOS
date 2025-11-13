// netlify/functions/gs-order.js
// Proxy a tu Google Apps Script Web App.
// Necesita env var: GS_WEBAPP_URL (URL del deployment /exec del Apps Script)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const JSON_HDR = {
  ...CORS,
  "Content-Type": "application/json; charset=utf-8",
};

const json = (code, obj) => ({
  statusCode: code,
  headers: JSON_HDR,
  body: JSON.stringify(obj),
});

const looksLikeJson = (s = "") => {
  const t = String(s).trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
};

const looksLikeHtml = (s = "") => {
  const t = String(s).trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
};

async function fetchWithRetriesAny(
  url,
  { method = "GET", headers = {}, body, retries = 2, timeoutMs = 8000 } = {}
) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);

      const res = await fetch(url, {
        method,
        headers: { accept: "application/json,text/plain,*/*", ...headers },
        body,
        signal: ctrl.signal,
      });

      const text = await res.text();
      clearTimeout(to);

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const isJson = ct.includes("application/json") || looksLikeJson(text);

      // HTTP no-OK: devolvemos error legible
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: text.slice(0, 500) || res.statusText || "Upstream error",
        };
      }

      // Si parece JSON, intentamos parsear
      if (isJson) {
        try {
          const parsed = JSON.parse(text);
          return parsed; // lo reenviamos tal cual
        } catch {
          return {
            ok: false,
            status: res.status,
            error: "Upstream envió JSON inválido",
          };
        }
      }

      // HTML en 200 casi seguro es error de login/404 de Apps Script
      if (looksLikeHtml(text)) {
        return {
          ok: false,
          status: res.status,
          error: "Upstream devolvió HTML (posible login/404/503).",
        };
      }

      // Texto plano: devolvemos result
      const trimmed = text.trim();
      if (/^ok\b/i.test(trimmed)) {
        return { ok: true, status: res.status, result: trimmed };
      }
      return { ok: true, status: res.status, result: trimmed };
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  return {
    ok: false,
    status: 502,
    error: String(lastErr?.message || lastErr || "Timeout/Network error"),
  };
}

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const WEBAPP_URL = process.env.GS_WEBAPP_URL;
  if (!WEBAPP_URL) {
    return json(200, {
      ok: false,
      status: 500,
      error: "Falta GS_WEBAPP_URL en variables de entorno",
    });
  }

  try {
    const isGET = event.httpMethod === "GET";
    const isPOST = event.httpMethod === "POST";

    if (!isGET && !isPOST) {
      return json(200, {
        ok: false,
        status: 405,
        error: "Method not allowed",
      });
    }

    // Construir URL destino preservando querystring del front
    const dst = new URL(WEBAPP_URL);
    if (event.rawQuery) {
      dst.search = event.rawQuery;
    }

    // Encabezados mínimos a reenviar
    const fwdHeaders = {};
    const ct = event.headers["content-type"] || event.headers["Content-Type"];
    if (ct) fwdHeaders["Content-Type"] = ct;

    // Body: manejar base64 si hace falta
    let body = undefined;
    if (isPOST) {
      body = event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : event.body;
    }

    // Llamar a Apps Script
    const upstream = await fetchWithRetriesAny(dst.toString(), {
      method: isGET ? "GET" : "POST",
      headers: fwdHeaders,
      body,
      retries: 2,
      timeoutMs: 8000,
    });

    // Siempre devolvemos JSON al front
    return json(200, upstream);
  } catch (err) {
    return json(200, {
      ok: false,
      status: 502,
      error: String(err?.message || err),
    });
  }
};
