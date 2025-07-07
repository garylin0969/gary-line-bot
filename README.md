# Gary LINE Bot

一個基於 Cloudflare Workers 建置的多功能 LINE 機器人，提供星座運勢查詢、隨機圖片以及互動遊戲等功能。

## 功能特色

- **星座運勢**: 每日星座運勢預測
- **隨機圖片**: 產生隨機圖片
- **骰子遊戲**: 互動式多人骰子遊戲
- **文字轉換**: 繁簡中文轉換
- **趣味文字**: 各種娛樂性文字功能

## 技術架構

- Cloudflare Workers
- TypeScript
- LINE Messaging API
- Cloudflare KV 快取系統
- Durable Objects 遊戲狀態管理

## 安裝設定

1. 複製專案

```bash
git clone https://github.com/garylin0969/gary-line-bot
cd gary-line-bot
```

2. 安裝相依套件

```bash
pnpm install
```

3. 在 `wrangler.jsonc` 設定環境變數：

- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Channel Access Token
- `HOROSCOPE_CACHE`: 星座運勢快取用的 KV namespace
- `GAME_STATE`: 遊戲狀態用的 Durable Object namespace

4. 部署至 Cloudflare Workers

```bash
pnpm run deploy
```

## 指令列表

- `!rollnum <數字>`: 指定玩家人數開始骰子遊戲
- `!roll`: 骰子
- `<星座>`: 查詢指定星座運勢
- `抽`: 取得隨機妹子圖片
- `!騷話`: 取得隨機騷話文字
- `!舔狗`: 取得隨機舔狗文字

## 開發相關

```bash
# 監控 Worker 即時日誌
wrangler tail
```

### 日誌監控說明

使用 `wrangler tail` 指令可以即時查看 Worker 的運行日誌，對於開發和除錯非常有幫助：

- 可以看到所有 `console.log()` 的輸出
- 可以監控 Worker 的錯誤訊息
- 支援過濾特定類型的日誌
- 適合在開發時即時偵錯

常用的日誌監控選項：

```bash
# 過濾出只包含特定關鍵字的日誌
wrangler tail --format=pretty --filter="error"

# 查看完整的請求和回應內容
wrangler tail --format=json
```
