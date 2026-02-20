// ==================== 流入経路取得用GAS (Traffic Source Tracking) ====================
// GitHub Pages のカレンダーフロントエンドから sendBeacon で呼び出される
// 予約ID + UTMパラメータをスプレッドシートに記録する

// ==================== 設定 ====================
/**
 * スクリプトプロパティからCONFIGを取得
 * 必要なプロパティ: SPREADSHEET_ID, SHEET_NAME
 */
let _cachedConfig = null;
function getConfig() {
  if (_cachedConfig) return _cachedConfig;
  const allProps = PropertiesService.getScriptProperties().getProperties();
  _cachedConfig = {
    SPREADSHEET_ID: allProps['SPREADSHEET_ID'] || '',
    SHEET_NAME: allProps['SHEET_NAME'] || ''
  };
  return _cachedConfig;
}

// ==================== メインハンドラー ====================
/**
 * GETリクエストを処理
 * fetchフォールバック用: ?path=log&reservation_id=...&utm_source=... で呼び出される
 */
function doGet(e) {
  try {
    const path = e && e.parameter ? e.parameter.path : null;

    if (path === 'log') {
      return handleLogRequest(e);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      service: 'kurabi-reservation-log',
      usage: 'GET/POST ?path=log&reservation_id=XXX&utm_source=...&utm_medium=...&utm_content=...'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('ERROR in doGet: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POSTリクエストを処理（sendBeacon互換）
 * navigator.sendBeacon() はPOSTを送信するため、doGetと同じログ処理を行う
 */
function doPost(e) {
  return doGet(e);
}

// ==================== ログ処理 ====================
/**
 * 予約ログをスプレッドシートに保存
 * GitHub Pages のクライアントサイドから sendBeacon / fetch で呼び出される
 */
function handleLogRequest(e) {
  try {
    const params = e.parameter;
    const reservationId = params.reservation_id || '';
    const utmSource = params.utm_source || '';
    const utmMedium = params.utm_medium || '';
    const utmContent = params.utm_content || '';

    if (reservationId) {
      saveToSpreadsheet(new Date(), reservationId, utmSource, utmMedium, utmContent);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('ERROR in handleLogRequest: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== スプレッドシート保存 ====================
/**
 * スプレッドシートに予約情報を同期的に保存
 *
 * 列: 予約日時 | 予約ID | utm_source | utm_medium | utm_content
 */
function saveToSpreadsheet(timestamp, reservationId, utmSource, utmMedium, utmContent) {
  const CONFIG = getConfig();
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(['予約日時', '予約ID', 'utm_source', 'utm_medium', 'utm_content']);
    const headerRange = sheet.getRange(1, 1, 1, 5);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f3f3f3');
  }

  sheet.appendRow([timestamp, reservationId, utmSource, utmMedium, utmContent]);
}
