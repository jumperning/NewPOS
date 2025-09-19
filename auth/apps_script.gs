/**
 * Google Apps Script Web App
 * Sheet structure (sheet name: 'users'):
 * headers: email | password | themeBg | themePanel | themeAccent | updatedAt
 */
const SHEET_NAME = 'users';

function _sheet() { return SpreadsheetApp.getActive().getSheetByName(SHEET_NAME); }
function _rows() {
  const sh = _sheet();
  const data = sh.getDataRange().getValues();
  const headers = data.shift();
  return { headers, rows: data, sh };
}
function _findRowIndexByEmail(email) {
  const { rows } = _rows();
  const idx = rows.findIndex(r => String(r[0]).toLowerCase().trim() === String(email).toLowerCase().trim());
  return (idx >= 0) ? (idx + 2) : -1; // +2: header + base1
}
function _resp(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) { return _resp({ ok: true, ping: true }); }
function doPost(e) {
  try {
    const body = JSON.parse(e.postData?.contents || '{}');
    const action = String(body.action || '').toLowerCase();
    if (action === 'login')    return _login(body);
    if (action === 'gettheme') return _getTheme(body);
    if (action === 'settheme') return _setTheme(body);
    return _resp({ ok: false, error: 'Acción no soportada' });
  } catch (err) {
    return _resp({ ok: false, error: String(err) });
  }
}

function _login({ email, password }) {
  if (!email || !password) return _resp({ ok: false, error: 'Faltan credenciales' });
  const { rows } = _rows();
  const i = rows.findIndex(r =>
    String(r[0]).toLowerCase().trim() === String(email).toLowerCase().trim() &&
    String(r[1]).trim() === String(password).trim()
  );
  if (i < 0) return _resp({ ok: false, error: 'Email o clave inválidos' });
  const row = rows[i];
  const user = {
    email: row[0],
    themeBg: row[2] || '#f7fafc',
    themePanel: row[3] || '#ffffff',
    themeAccent: row[4] || '#10b981',
  };
  return _resp({ ok: true, user });
}
function _getTheme({ email }) {
  if (!email) return _resp({ ok: false, error: 'Falta email' });
  const ri = _findRowIndexByEmail(email);
  if (ri < 0) return _resp({ ok: false, error: 'No existe el usuario' });
  const sh = _sheet();
  const themeBg     = sh.getRange(ri, 3).getValue() || '#f7fafc';
  const themePanel  = sh.getRange(ri, 4).getValue() || '#ffffff';
  const themeAccent = sh.getRange(ri, 5).getValue() || '#10b981';
  return _resp({ ok: true, theme: { themeBg, themePanel, themeAccent } });
}
function _setTheme({ email, theme }) {
  if (!email || !theme) return _resp({ ok: false, error: 'Faltan datos' });
  const { themeBg, themePanel, themeAccent } = theme;
  const ri = _findRowIndexByEmail(email);
  if (ri < 0) return _resp({ ok: false, error: 'No existe el usuario' });
  const sh = _sheet();
  if (themeBg)     sh.getRange(ri, 3).setValue(themeBg);
  if (themePanel)  sh.getRange(ri, 4).setValue(themePanel);
  if (themeAccent) sh.getRange(ri, 5).setValue(themeAccent);
  sh.getRange(ri, 6).setValue(new Date().toISOString());
  return _resp({ ok: true });
}
