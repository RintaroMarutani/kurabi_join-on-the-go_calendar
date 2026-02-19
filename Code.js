// ==================== 設定 ====================
/**
 * スクリプトプロパティからCONFIGを取得
 * getProperties()で一括取得し、同一リクエスト内はキャッシュを使用
 */
let _cachedConfig = null;
function getConfig() {
  if (_cachedConfig) return _cachedConfig;
  const allProps = PropertiesService.getScriptProperties().getProperties();
  _cachedConfig = {
    SPREADSHEET_ID: allProps['SPREADSHEET_ID'] || '',
    SHEET_NAME: allProps['SHEET_NAME'] || '',
    WHATSAPP_NUMBER: allProps['WHATSAPP_NUMBER'] || '',
    WHATSAPP_ENDPOINT: allProps['WHATSAPP_ENDPOINT'] || '',
    CALENDAR_API_ENDPOINT: allProps['CALENDAR_API_ENDPOINT'] || ''
  };
  return _cachedConfig;
}

/**
 * カレンダーAPIエンドポイントを取得
 * クライアントサイドから呼び出し可能
 */
function getCalendarApiEndpoint() {
  const config = getConfig();
  return config.CALENDAR_API_ENDPOINT || '';
}

/**
 * WhatsApp APIエンドポイントを取得
 * クライアントサイドから呼び出し可能
 */
function getWhatsAppEndpoint() {
  const config = getConfig();
  return config.WHATSAPP_ENDPOINT || '';
}

// ==================== メインハンドラー ====================
function doGet(e) {
  try {
    const path = e && e.parameter ? e.parameter.path : null;

    // WhatsApp予約ID取得API
    if (path === 'whatsapp') {
      return handleWhatsAppRequest(e);
    }

    // 通常のカレンダー表示
    const utmSource = (e && e.parameter && e.parameter.utm_source) || '';
    const utmMedium = (e && e.parameter && e.parameter.utm_medium) || '';
    const utmContent = (e && e.parameter && e.parameter.utm_content) || '';

    // テンプレートを作成してUTMパラメータを設定
    const template = HtmlService.createTemplateFromFile('index');
    template.utmSource = utmSource;
    template.utmMedium = utmMedium;
    template.utmContent = utmContent;

    return template.evaluate()
      .setTitle('Kurabi Calendar')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    Logger.log('ERROR in doGet: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return HtmlService.createHtmlOutput(
      '<html><body><h1>Error</h1><pre>' + error.toString() + '\n\n' + error.stack + '</pre></body></html>'
    );
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==================== WhatsApp関連処理 ====================
/**
 * WhatsApp予約リクエストを処理
 *
 * 処理フロー:
 * 1. リクエストパラメータからイベント情報とUTMパラメータを取得
 * 2. 一意の予約IDを生成
 * 3. 予約情報をスプレッドシートに保存
 * 4. WhatsAppメッセージを作成
 * 5. WhatsAppへのリダイレクトページを返す
 *
 * @param {Object} e - doGet()から渡されるイベントオブジェクト
 * @param {Object} e.parameter - URLパラメータ
 * @param {string} e.parameter.utm_source - UTMソース（流入元トラッキング）
 * @param {string} e.parameter.utm_medium - UTMメディウム
 * @param {string} e.parameter.utm_content - UTMコンテンツ
 * @param {string} e.parameter.event_title - イベントタイトル
 * @param {string} e.parameter.event_date - イベント日付
 * @param {string} e.parameter.event_time - イベント時間
 * @param {string} e.parameter.event_price - イベント料金
 * @returns {HtmlOutput} WhatsAppへリダイレクトするHTMLページ
 */
function handleWhatsAppRequest(e) {
  try {
    const CONFIG = getConfig();

    // WHATSAPP_NUMBERの存在チェック
    if (!CONFIG.WHATSAPP_NUMBER) {
      return HtmlService.createHtmlOutput(
        '<!DOCTYPE html>' +
        '<html>' +
        '<head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:50px;text-align:center;}.error{color:red;margin:20px 0;}</style></head>' +
        '<body>' +
        '<h1 class="error">設定エラー</h1>' +
        '<p>WHATSAPP_NUMBER が設定されていません。</p>' +
        '<p>スクリプトプロパティで設定してください。</p>' +
        '<p><a href="javascript:history.back()">戻る</a></p>' +
        '</body>' +
        '</html>'
      );
    }

    const params = e.parameter;

    const utmSource = params.utm_source || '';
    const utmMedium = params.utm_medium || '';
    const utmContent = params.utm_content || '';
    const eventTitle = params.event_title || '';
    const eventDate = params.event_date || '';
    const eventTime = params.event_time || '';
    const eventPrice = params.event_price || '';

    const reservationId = generateUniqueToken();
    const timestamp = new Date();

    // スプレッドシート保存をキューに追加（非同期処理）
    queueSaveToSpreadsheet(timestamp, reservationId, utmSource, utmMedium, utmContent);

    const message = createWhatsAppMessage(eventTitle, eventDate, eventTime, eventPrice, reservationId);
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = 'https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' + encodedMessage;

    // JSONレスポンスを返す
    const response = {
      success: true,
      reservationId: reservationId,
      whatsappUrl: whatsappUrl,
      message: message
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('ERROR in handleWhatsAppRequest: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html>' +
      '<html>' +
      '<head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:50px;text-align:center;}pre{text-align:left;background:#f5f5f5;padding:15px;border-radius:5px;}</style></head>' +
      '<body>' +
      '<h1 style="color:red;">エラーが発生しました</h1>' +
      '<p>' + error.toString() + '</p>' +
      '<pre>' + error.stack + '</pre>' +
      '<p><a href="javascript:history.back()">戻る</a></p>' +
      '</body>' +
      '</html>'
    );
  }
}

/**
 * イベント情報からWhatsAppメッセージを生成
 *
 * @param {string} eventTitle - イベントタイトル
 * @param {string} eventDate - イベント日付（例: "Today", "Tomorrow", "Monday 23/01"）
 * @param {string} eventTime - イベント時間（例: "12:00 - 14:00"）
 * @param {string} eventPrice - イベント料金（例: "¥3,000"）
 * @param {string} reservationId - 予約ID（generateUniqueToken()で生成されたID）
 * @returns {string} WhatsAppで送信するメッセージテキスト（改行区切り）
 */
function createWhatsAppMessage(eventTitle, eventDate, eventTime, eventPrice, reservationId) {
  const lines = [];

  if (eventTitle) {
    lines.push(`[Event] ${eventTitle}`);
  }

  if (eventDate) {
    lines.push(`[Date] ${eventDate}`);
  }

  if (eventTime) {
    lines.push(`[Time] ${eventTime}`);
  }

  lines.push('');
  lines.push(`[Reservation ID] ${reservationId}`);

  return lines.join('\n');
}

/**
 * 一意のトークン（予約ID）を生成
 *
 * 生成される予約IDは以下の形式:
 * - 日付部分: YYYYMMDD（年月日）
 * - 時刻部分: HHMMSS（時分秒）
 * - ランダム部分: 4桁の英数字（A-Z, 0-9）
 *
 * @returns {string} 予約ID（例: "20250123-143052-A7B9"）
 * @example
 * const id = generateUniqueToken();
 * // => "20250123-143052-A7B9"
 */
function generateUniqueToken() {
  const now = new Date();

  // 日付部分: YYYYMMDD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  // 時刻部分: HHMMSS
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timePart = `${hours}${minutes}${seconds}`;

  // ランダム部分: 4桁の英数字
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${datePart}-${timePart}-${randomPart}`;
}

/**
 * スプレッドシートに予約情報を保存
 *
 * スプレッドシートの構造:
 * - 列1: 予約日時 (Date)
 * - 列2: 予約ID (String)
 * - 列3: utm_source (String)
 * - 列4: utm_medium (String)
 * - 列5: utm_content (String)
 *
 * @param {Date} timestamp - 予約日時
 * @param {string} reservationId - 予約ID
 * @param {string} utmSource - UTMソース（流入元）
 * @param {string} utmMedium - UTMメディウム（メディア種別）
 * @param {string} utmContent - UTMコンテンツ（コンテンツ識別子）
 * @throws {Error} スプレッドシートへのアクセスまたは書き込みに失敗した場合
 */
function saveToSpreadsheet(timestamp, reservationId, utmSource, utmMedium, utmContent) {
  try {
    const CONFIG = getConfig();
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

    // シートが存在しない場合は作成
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      // ヘッダー行を追加
      sheet.appendRow(['予約日時', '予約ID', 'utm_source', 'utm_medium', 'utm_content']);
      // ヘッダー行をフォーマット
      const headerRange = sheet.getRange(1, 1, 1, 5);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f3f3');
    }

    // データを追加
    sheet.appendRow([
      timestamp,
      reservationId,
      utmSource,
      utmMedium,
      utmContent
    ]);

  } catch (error) {
    Logger.log('Error in saveToSpreadsheet: ' + error.toString());
    throw error;
  }
}

/**
 * スプレッドシート保存をキューに追加（非同期処理用）
 * CacheServiceを使用してデータを一時保存し、トリガーで後から処理する
 *
 * @param {Date} timestamp - 予約日時
 * @param {string} reservationId - 予約ID
 * @param {string} utmSource - UTMソース
 * @param {string} utmMedium - UTMメディウム
 * @param {string} utmContent - UTMコンテンツ
 */
function queueSaveToSpreadsheet(timestamp, reservationId, utmSource, utmMedium, utmContent) {
  try {
    const cache = CacheService.getScriptCache();
    const queueKey = 'spreadsheet_queue';

    // 既存のキューを取得
    const existingQueue = cache.get(queueKey);
    const queue = existingQueue ? JSON.parse(existingQueue) : [];

    // 新しいデータをキューに追加
    queue.push({
      timestamp: timestamp.toISOString(),
      reservationId: reservationId,
      utmSource: utmSource,
      utmMedium: utmMedium,
      utmContent: utmContent
    });

    // キューを保存（最大6時間キャッシュ）
    cache.put(queueKey, JSON.stringify(queue), 21600);

    // トリガーが存在しない場合は作成
    ensureProcessQueueTrigger();
  } catch (error) {
    // キュー追加に失敗した場合は同期的に保存（フォールバック）
    Logger.log('Queue failed, falling back to sync save: ' + error.toString());
    saveToSpreadsheet(timestamp, reservationId, utmSource, utmMedium, utmContent);
  }
}

/**
 * キュー処理用のトリガーが存在することを確認し、なければ作成
 */
function ensureProcessQueueTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const hasQueueTrigger = triggers.some(trigger =>
    trigger.getHandlerFunction() === 'processSpreadsheetQueue'
  );

  if (!hasQueueTrigger) {
    // 1分後に実行するトリガーを作成
    ScriptApp.newTrigger('processSpreadsheetQueue')
      .timeBased()
      .after(60 * 1000) // 1分後
      .create();
  }
}

/**
 * キューに溜まったデータをスプレッドシートに保存
 * 時間ベースのトリガーから呼び出される
 */
function processSpreadsheetQueue() {
  const cache = CacheService.getScriptCache();
  const queueKey = 'spreadsheet_queue';

  try {
    const queueData = cache.get(queueKey);
    if (!queueData) {
      return; // キューが空
    }

    const queue = JSON.parse(queueData);
    if (queue.length === 0) {
      return;
    }

    // キューをクリア（処理中に新しいデータが追加されても問題ないように先にクリア）
    cache.remove(queueKey);

    // 各アイテムを処理
    for (const item of queue) {
      saveToSpreadsheet(
        new Date(item.timestamp),
        item.reservationId,
        item.utmSource,
        item.utmMedium,
        item.utmContent
      );
    }
  } catch (error) {
    Logger.log('Error in processSpreadsheetQueue: ' + error.toString());
  } finally {
    // このトリガーを削除（1回限りの実行）
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === 'processSpreadsheetQueue') {
        ScriptApp.deleteTrigger(trigger);
      }
    }
  }
}
