// netlify/functions/gs-order.js
// Proxy a tu Google Apps Script Web App.
// Requiere la env var GS_WEBAPP_URL (URL del deployment del Apps Script, /exec).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const JSON_HDR = { ...CORS, "Content-Type": "application/json; charset=utf-8" };

function json(code, obj) {
  return { statusCode: code, headers: JSON_HDR, body: JSON.stringify(obj) };
}
function looksLikeJson(s = "") {
  const t = String(s).trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}
function safeErrPayload(text = "", status = 500) {
  const t = String(text || "").trim();
  if (looksLikeJson(t)) {
    try {
      const j = JSON.parse(t);
      return { ok: false, status, error: j.error || j.message || t.slice(0, 500) };
    } catch {
      return { ok: false, status, error: t.slice(0, 500) };
    }
  }
  if (t.startsWith("<!DOCTYPE") || t.startsWith("<html")) {
    return { ok: false, status, error: "Upstream devolvió HTML (posible 404/503/HTML de error)." };
  }
  return { ok: false, status, error: t.slice(0, 500) || "Error desconocido" };
}
async function fetchWithRetriesJSON(url, { method = "GET", headers = {}, body, retries = 2, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { method, headers: { accept: "application/json", ...headers }, body, signal: ctrl.signal });
      const text = await res.text();
      clearTimeout(timeout);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const isJson = ct.includes("application/json") || looksLikeJson(text);
      if (!res.ok) return { ok: false, status: res.status, ...safeErrPayload(text, res.status) };
      if (!isJson) return { ok: false, status: res.status, error: "Upstream no respondió JSON (content-type no válido)" };
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }
  }
  return { ok: false, status: 502, error: String(lastErr && lastErr.message || lastErr || "Timeout/Network error") };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  const WEBAPP_URL = process.env.GS_WEBAPP_URL;
  if (!WEBAPP_URL) return json(200, { ok: false, status: 500, error: "Falta GS_WEBAPP_URL en variables de entorno" });
  try {
    const isGET = event.httpMethod === "GET";
    const isPOST = event.httpMethod === "POST";
    if (!isGET && !isPOST) return json(200, { ok: false, status: 405, error: "Method not allowed" });
    const dst = new URL(WEBAPP_URL);
    if (event.rawQuery) dst.search = event.rawQuery;
    const fwdHeaders = {};
    const ct = event.headers["content-type"] || event.headers["Content-Type"];
    if (ct) fwdHeaders["Content-Type"] = ct;
    const upstreamJson = await fetchWithRetriesJSON(dst.toString(), {
      method: isGET ? "GET" : "POST",
      headers: fwdHeaders,
      body: isPOST ? event.body : undefined,
      retries: 2,
      timeoutMs: 8000,
    });
    return json(200, upstreamJson);
  } catch (err) {
    return json(200, { ok: false, status: 502, error: String(err?.message || err) });
  }
};
