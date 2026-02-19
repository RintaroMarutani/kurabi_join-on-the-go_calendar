/**
 * WhatsAppボタンの設定とイベントハンドラー
 * モーダル内のWhatsAppボタンにクリックイベントを設定する
 *
 * @param {Object} config - 設定オブジェクト
 * @param {string} config.apiEndpoint - Google Apps ScriptのエンドポイントURL
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

    // iOS Safari対策: ユーザーアクション直後に即座にウィンドウを開く
    // 非同期処理後だとtransient activationが切れてブロックされるため
    const win = window.open('about:blank', '_blank');

    // UTMパラメータの取得（複数の方法を試行）
    let utmSource = '';
    let utmMedium = '';
    let utmContent = '';

    // 方法1: グローバル変数から取得（document.referrerまたはpostMessageで設定済み）
    if (window.receivedUTMParams) {
      utmSource = window.receivedUTMParams.utm_source || '';
      utmMedium = window.receivedUTMParams.utm_medium || '';
      utmContent = window.receivedUTMParams.utm_content || '';
    }

    // 方法2: document.referrerから取得（フォールバック）
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

    // 方法3: 親ページのURLから取得を試みる（iframe内の場合）
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

    // 方法4: iframe自身のURLから取得（最終フォールバック）
    if (!utmSource && !utmMedium && !utmContent) {
      const currentUrl = new URL(window.location.href);
      utmSource = currentUrl.searchParams.get('utm_source') || '';
      utmMedium = currentUrl.searchParams.get('utm_medium') || '';
      utmContent = currentUrl.searchParams.get('utm_content') || '';
    }

    // APIリクエスト用のURLパラメータを構築
    const params = new URLSearchParams();
    params.set('path', 'whatsapp');

    // UTMパラメータを追加（存在する場合のみ）
    if (utmSource) params.set('utm_source', utmSource);
    if (utmMedium) params.set('utm_medium', utmMedium);
    if (utmContent) params.set('utm_content', utmContent);

    // イベント情報を追加
    params.set('event_title', config.title);
    params.set('event_date', config.dateText);
    params.set('event_time', config.timeStr);
    params.set('event_price', config.price);

    // サーバーにリクエストを送信
    const apiUrl = config.apiEndpoint + '?' + params.toString();

    // ボタンを無効化してローディング状態にする
    newWhatsappButton.disabled = true;
    newWhatsappButton.style.opacity = '0.6';
    newWhatsappButton.style.cursor = 'not-allowed';
    const originalText = newWhatsappButton.querySelector('.wa-label').textContent;
    newWhatsappButton.querySelector('.wa-label').textContent = 'Processing...';

    // ボタンを元に戻すヘルパー関数
    const resetButton = () => {
      newWhatsappButton.disabled = false;
      newWhatsappButton.style.opacity = '1';
      newWhatsappButton.style.cursor = 'pointer';
      newWhatsappButton.querySelector('.wa-label').textContent = originalText;
    };

    // サーバーから予約情報を取得
    fetch(apiUrl)
      .then(response => response.json())
      .then(data => {
        if (data.success && data.whatsappUrl) {
          // 既に開いたウィンドウのURLをWhatsAppに更新
          if (win && !win.closed) {
            win.location.href = data.whatsappUrl;
          } else {
            // ウィンドウが閉じられた場合のフォールバック
            window.location.href = data.whatsappUrl;
          }
          resetButton();
        } else {
          // 失敗時はウィンドウを閉じる
          if (win && !win.closed) {
            win.close();
          }
          resetButton();
          alert('予約処理に失敗しました。もう一度お試しください。');
        }
      })
      .catch(error => {
        // エラー時はウィンドウを閉じる
        if (win && !win.closed) {
          win.close();
        }
        resetButton();
        alert('予約処理中にエラーが発生しました。もう一度お試しください。');
      });
  });
}
