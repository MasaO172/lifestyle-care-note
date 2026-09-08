# 生活習慣ケアノート v43 — GitHub Pages 公開用PWA

## 公開方法（最初の1回）
1. GitHubで新しいリポジトリを作成します。推奨名: `lifestyle-care-note`
2. このZIP内のファイルを、フォルダを作らずリポジトリ直下へアップロードします。
3. GitHubの `Settings` → `Pages` を開きます。
4. `Build and deployment` で `Deploy from a branch` を選び、Branch=`main`、Folder=`/(root)` を指定して保存します。
5. 数分後に表示される `https://<GitHubユーザー名>.github.io/lifestyle-care-note/` を開きます。
6. iPhoneではSafariで開き、共有 →「ホーム画面に追加」でPWAとして使用できます。

## 今後の更新
利用者側でHTMLファイルを差し替える必要はありません。
同じGitHubリポジトリの `index.html`、`sw.js`、`manifest.webmanifest` 等を新しい版に置き換えるだけで、同じURLから最新版が配信されます。
この版ではPWA起動時にService Workerの更新確認を行い、新版が有効になった場合は自動的に再読み込みします。

## データ保存について
患者データはブラウザ/PWAの端末内ストレージに保存されます。GitHubには患者データを送信しません。
ただし、端末変更、Safariのサイトデータ削除、PWA削除などに備えて、アプリ内の「完全バックアップ(JSON)」を定期的に保存してください。

## 公開時の注意
GitHub PagesをPublic repositoryから公開する場合、HTML/JavaScriptなどのソースコードも公開されます。
本ツールのライセンスは `LICENSE.txt` およびアプリ内表記に従います。

## ファイル構成
- `index.html` 本体
- `manifest.webmanifest` PWA設定
- `sw.js` オフラインキャッシュ・更新制御
- `icon-192.png`, `icon-512.png` ホーム画面アイコン
- `.nojekyll` GitHub Pages用
- `LICENSE.txt` ライセンス


## v43 変更
- 緑背景に白文字の「W」アイコンを廃止しました。
- 新しいアイコンは、ノート・記録・経過グラフ・生活習慣ケアをイメージしたデザインです。


## v43 変更
- ヘッダー左の緑背景・白文字「W」を廃止し、PWAアイコンと同じデザイン画像を表示するよう変更。
- 設定画面に「端末利用マニュアル」「生活習慣ケアノート利用マニュアル」を追加。
- マニュアルはPDFを直接開かず、各ページを画像として縦に並べて表示。
- マニュアル画面に「ツールに戻る」ボタンを上部・下部に配置。
- GitHub Pages公開URLのQRコード画像を別ファイルとして作成。
