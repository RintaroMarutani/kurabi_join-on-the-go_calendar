/**
 * WhatsAppボタンの設定とイベントハンドラー
 * モーダル内のWhatsAppボタンにクリックイベントを設定する
 * WhatsApp URLをクライアントサイドで直接生成し、即座にWhatsApp画面を開く
 *
 * @param {Object} config - 設定オブジェクト
 * @param {string} config.whatsappNumber - WhatsApp番号（国番号付き、例: "81901234567"）
 * @param {string} config.title - イベントタイトル
 * @param {string} config.dateText - イベント日付
 * @param {string} config.timeStr - イベント時間
 * @param {string} config.price - イベント料金
 */
function setupWhatsAppButton(config) {
  const whatsappButton = document.getElementById('modal-whatsapp');

  if (!whatsappButton) {
    return;
  }

  // 既存のイベントリスナーを削除するため、ボタンを複製して置き換え
  const newWhatsappButton = whatsappButton.cloneNode(true);
  whatsappButton.parentNode.replaceChild(newWhatsappButton, whatsappButton);

  // WhatsAppボタンのクリックイベント
  newWhatsappButton.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    // 予約IDをクライアントサイドで生成
    const reservationId = generateReservationId();

    // WhatsAppメッセージを構築
    const lines = [];
    if (config.title) lines.push('[Event] ' + config.title);
    if (config.dateText) lines.push('[Date] ' + config.dateText);
    if (config.timeStr) lines.push('[Time] ' + config.timeStr);
    lines.push('');
    lines.push('[Reservation ID] ' + reservationId);

    const message = lines.join('\n');
    const whatsappUrl = 'https://wa.me/' + config.whatsappNumber + '?text=' + encodeURIComponent(message);

    // UTMパラメータを取得してスプレッドシートに非同期保存
    const utm = getUTMParams();
    logReservation(config.logEndpoint, reservationId, utm);

    // WhatsApp画面を即座に開く（サーバー往復不要）
    window.open(whatsappUrl, '_blank');
  });
}

/**
 * 予約IDを生成（YYYYMMDD-HHMMSS-XXXX形式）
 */
function generateReservationId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
  const timePart = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return datePart + '-' + timePart + '-' + rand;
}

/**
 * UTMパラメータを取得（複数の方法を試行）
 */
function getUTMParams() {
  let utmSource = '';
  let utmMedium = '';
  let utmContent = '';

  // 方法1: グローバル変数から取得
  if (window.receivedUTMParams) {
    utmSource = window.receivedUTMParams.utm_source || '';
    utmMedium = window.receivedUTMParams.utm_medium || '';
    utmContent = window.receivedUTMParams.utm_content || '';
  }

  // 方法2: document.referrerから取得
  if (!utmSource && !utmMedium && !utmContent && document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      utmSource = referrerUrl.searchParams.get('utm_source') || '';
      utmMedium = referrerUrl.searchParams.get('utm_medium') || '';
      utmContent = referrerUrl.searchParams.get('utm_content') || '';
    } catch (e) {
      // URL解析エラー
    }
  }

  // 方法3: 親ページのURLから取得（iframe内の場合）
  if (!utmSource && !utmMedium && !utmContent) {
    try {
      if (window.parent && window.parent !== window) {
        const parentUrl = new URL(window.parent.location.href);
        utmSource = parentUrl.searchParams.get('utm_source') || '';
        utmMedium = parentUrl.searchParams.get('utm_medium') || '';
        utmContent = parentUrl.searchParams.get('utm_content') || '';
      }
    } catch (e) {
      // クロスオリジン制限
    }
  }

  // 方法4: iframe自身のURLから取得
  if (!utmSource && !utmMedium && !utmContent) {
    const currentUrl = new URL(window.location.href);
    utmSource = currentUrl.searchParams.get('utm_source') || '';
    utmMedium = currentUrl.searchParams.get('utm_medium') || '';
    utmContent = currentUrl.searchParams.get('utm_content') || '';
  }

  return { utm_source: utmSource, utm_medium: utmMedium, utm_content: utmContent };
}

/**
 * 予約情報をサーバーに非同期送信（スプレッドシート保存用）
 * sendBeaconを使用してページ遷移をブロックしない
 */
function logReservation(endpoint, reservationId, utm) {
  if (!endpoint) return;

  const params = new URLSearchParams();
  params.set('path', 'log');
  params.set('reservation_id', reservationId);
  if (utm.utm_source) params.set('utm_source', utm.utm_source);
  if (utm.utm_medium) params.set('utm_medium', utm.utm_medium);
  if (utm.utm_content) params.set('utm_content', utm.utm_content);

  const url = endpoint + '?' + params.toString();

  // sendBeaconでページ遷移をブロックしない非同期送信
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url);
  } else {
    fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => {});
  }
}
