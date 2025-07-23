# Gary LINE Bot

一個基於 Cloudflare Workers 建置的多功能 LINE 機器人，提供星座運勢查詢、隨機圖片以及互動遊戲等功能。

## 功能特色

- **星座運勢**: 每日星座運勢預測，支援自動快取和預載
- **隨機圖片**: 產生各種類型的隨機圖片（一般、黑絲、白絲、NSFW）
- **骰子遊戲**: 互動式多人骰子遊戲，支援 2-10 人參與
- **智慧文案**: 情話、幹話、騷話等各種娛樂性文字內容
- **關鍵字回覆**: 智慧識別特定關鍵字並自動回覆
- **文字轉換**: 繁簡中文轉換
- **舔狗語錄**: 隨機舔狗文字生成

## 技術架構

- **平台**: Cloudflare Workers (邊緣運算)
- **語言**: TypeScript (完整型別支援)
- **API**: LINE Messaging API
- **快取**: Cloudflare KV (分層快取策略)
- **狀態管理**: Durable Objects (遊戲狀態持久化)
- **架構**: 模組化設計，易於維護和擴展

## 專案結構

```
src/
├── config/
│   └── constants.ts        # 配置常數和 API 端點
├── types/
│   └── index.ts           # TypeScript 型別定義
├── utils/
│   ├── common.ts          # 通用工具函數
│   └── date.ts            # 日期處理工具
├── durable-objects/
│   └── GameStateObject.ts # 遊戲狀態 Durable Object
├── services/
│   ├── api.ts             # LINE API 和外部 API 服務
│   ├── horoscope.ts       # 占星運勢服務
│   ├── copywriting.ts     # 文案內容服務
│   └── game.ts            # 遊戲邏輯服務
├── handlers/
│   └── messageHandler.ts  # 訊息處理核心邏輯
└── index.ts               # 主程式入口點
```

### 模組說明

- **config**: 集中管理所有配置，包括 API 端點、關鍵字回覆等
- **types**: 完整的 TypeScript 型別定義，確保型別安全
- **utils**: 可重用的工具函數，如日期處理、字符串操作等
- **services**: 核心業務邏輯，每個服務負責特定功能
- **handlers**: 處理 LINE 訊息的主要邏輯
- **durable-objects**: Cloudflare Durable Objects，用於遊戲狀態管理

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

3. 設定環境變數

在 `wrangler.jsonc` 中設定以下環境變數：

```json
{
	"vars": {
		"LINE_CHANNEL_ACCESS_TOKEN": "your_line_channel_access_token"
	},
	"kv_namespaces": [
		{
			"binding": "HOROSCOPE_CACHE",
			"id": "your_horoscope_kv_namespace_id"
		},
		{
			"binding": "COPYWRITING_CACHE",
			"id": "your_copywriting_kv_namespace_id"
		}
	],
	"durable_objects": {
		"bindings": [
			{
				"name": "GAME_STATE",
				"class_name": "GameStateObject"
			}
		]
	}
}
```

4. 部署至 Cloudflare Workers

```bash
pnpm wrangler deploy
```

## 指令列表

### 遊戲指令

- `!rollnum <數字>`: 指定玩家人數開始骰子遊戲 (2-10 人)
- `!roll`: 參與骰子遊戲

### 圖片指令

- `抽`: 取得隨機妹子圖片
- `!黑絲`: 取得黑絲圖片
- `!白絲`: 取得白絲圖片
- `色色`: 取得隨機 NSFW 圖片

### 文案指令

- `!情話`: 取得隨機情話
- `!幹話`: 取得隨機幹話
- `!騷話`: 取得隨機騷話
- `!舔狗`: 取得隨機舔狗語錄

### 星座指令

- `<星座名>`: 查詢指定星座當日運勢 (如: `牡羊`、`金牛`、`雙子` 等)

### 關鍵字自動回覆

機器人會自動識別特定關鍵字並回覆相應內容

## 開發指南

### 本地開發

```bash
# 啟動開發伺服器
pnpm run dev

# 執行測試
pnpm run test

# 監控即時日誌
pnpm wrangler tail
```

### 新增功能

1. **新增服務**: 在 `src/services/` 目錄下建立新的服務檔案
2. **新增處理器**: 在 `src/handlers/messageHandler.ts` 中新增對應的處理邏輯
3. **新增型別**: 在 `src/types/index.ts` 中定義相關型別
4. **新增配置**: 在 `src/config/constants.ts` 中新增必要的配置

### 快取策略

- **占星資料**: 每日 00:10 (UTC+8) 自動預載，快取 25 小時
- **文案內容**: 每 2 小時自動更新，快取 2 小時
- **遊戲狀態**: 使用 Durable Objects 持久化，30 分鐘無活動自動清理

### 日誌監控

使用 `wrangler tail` 指令可以即時查看 Worker 的運行日誌：

```bash
# 基本日誌監控
pnpm wrangler tail

# 過濾特定類型的日誌
pnpm wrangler tail --filter="DEBUG"

# JSON 格式輸出
pnpm wrangler tail --format=json
```

### 手動預載

專案提供手動預載端點：

```bash
# 預載所有資料 (占星 + 文案)
curl https://your-worker.your-subdomain.workers.dev/preload

# 只預載文案資料
curl https://your-worker.your-subdomain.workers.dev/preload-copywriting
```

## 部署說明

### 生產環境部署

1. 確保所有環境變數都已正確設定
2. 建立必要的 KV Namespaces
3. 設定 Durable Objects 綁定
4. 執行部署指令

```bash
pnpm wrangler deploy
```

### 環境變數設定

- `LINE_CHANNEL_ACCESS_TOKEN`: LINE 官方帳號的 Channel Access Token
- `HOROSCOPE_CACHE`: 占星資料快取的 KV Namespace
- `COPYWRITING_CACHE`: 文案內容快取的 KV Namespace
- `GAME_STATE`: 遊戲狀態管理的 Durable Object
