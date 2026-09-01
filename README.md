# 認識自己 · Daily Journal

一個簡單、療癒、適合每天使用的自我認識日記小程式。每天回答固定的幾個問題，
長期累積後，幫助你更了解自己的情緒、喜好、壓力來源與生活中真正重視的事情。

不是流水帳日記——是給自己的資料庫。

## 功能

- **每日紀錄**：7 個固定問題（開心的事、難過的事、感謝的事、做得不錯的事、
  給自己的一句話、心情評分 1–10、主要情緒複選），日期預設今天、可修改。
- **首頁**：今天是否已紀錄、連續紀錄天數、本月紀錄天數、近 7 天平均心情。
- **歷史紀錄**：月曆檢視（每天的心情用顏色圓點標示）與列表檢視，點擊可查看
  ／編輯任一天的紀錄。
- **每週回顧**：自動整理最近 7 天——平均心情、最高／最低的一天、最常出現的
  情緒、反覆出現的主題、開心／不舒服／感謝的內容摘要，以及一段「本週的我」
  文字摘要。
- **月度 Insights**：每日心情折線圖、情緒出現次數長條圖、每週平均心情，加上
  幾個簡單問題的文字回答（什麼讓我開心／焦慮、低潮通常在哪天、最近趨勢是
  變好還是變差）。
- **AI 情緒分析與建議（選用、免費）**：在「每週回顧」「Insights」頁面按下
  「AI 分析」，會用 Google Gemini API 的免費額度，針對該週／該月的紀錄產生
  情緒分析、可能的壓力來源、具體建議與一句鼓勵的話。完全選用——不設定
  API Key 也不影響其他任何功能，仍會顯示免費的關鍵字式分析。

不設定 AI 的話，全部功能都用關鍵字比對、情緒標籤與紀錄內容做整理與呈現，
不需要網路、不需要任何帳號。

## 技術

- React + TypeScript + Tailwind CSS（Vite）
- 資料儲存在瀏覽器 `localStorage`，不需登入、不需資料庫
- 支援安裝為 PWA（加入主畫面、可離線開啟）
- 資料層以 `JournalRepository` 介面封裝（見 `src/lib/journalRepository.ts`），
  之後要換成 Supabase 或其他後端，只需要新增一個實作並替換 `journalRepo`
  這個 singleton，其餘頁面與元件完全不需要改動。
- AI 分析採「自備 API Key」（BYOK）模式：Key 存在瀏覽器 localStorage，分析時
  直接從瀏覽器呼叫 Gemini API，沒有後端、沒有伺服器會經手你的日記內容。

### 專案結構

```
src/
  types/
    journal.ts             # JournalEntry 型別、情緒清單
    aiInsight.ts            # AI 分析結果型別
  lib/
    journalRepository.ts    # 資料存取介面 + localStorage 實作
    useJournalEntries.ts     # 讀寫資料的 React hook
    dateUtils.ts             # 日期／連續天數工具
    analytics.ts             # 週回顧、月度 Insights、關鍵字擷取邏輯
    aiSettings.ts            # AI Key / 模型設定（localStorage）
    aiClient.ts              # 呼叫 Gemini API、prompt、JSON 解析
    useAiInsight.ts           # AI 分析結果的 on-demand 呼叫 + 快取 hook
  components/                # EmotionPicker、MoodSlider、BottomNav 等共用元件
  pages/                     # Home、DailyEntry、History、WeeklyReview、Insights、Settings
```

### 關於 AI 分析功能

- 到 [aistudio.google.com/apikey](https://aistudio.google.com/apikey) 免費申請一組
  Gemini API Key（不需要信用卡），貼到 App 的「設定」頁（首頁右上角齒輪圖示）。
- 免費額度有速率限制（依模型而異，通常每分鐘 10～30 次請求），一般個人每週
  按一兩次分析完全足夠。
- 分析只在你按下「開始 AI 分析」時才會呼叫一次，結果會快取起來，資料沒變的
  話重新整理頁面不會重複呼叫。
- 如果 Google 之後調整了免費模型的名稱，可以直接在設定頁把模型名稱改成新的，
  不需要更新程式碼（預設 `gemini-2.5-flash`）。

## 本機啟動方式

需要 Node.js 18 以上版本。

```bash
npm install
npm run dev
```

啟動後開啟終端機顯示的網址（預設 http://localhost:5173）。手機瀏覽器打開
同一個網址（需與電腦同一網路，或部署後用手機開啟），點選「加入主畫面」即可
像 App 一樣使用。

其他指令：

```bash
npm run build     # 產生正式版靜態檔案（dist/）
npm run preview   # 預覽正式版build
```

## 資料備份提醒

資料儲存在瀏覽器的 localStorage，僅存在該瀏覽器、該裝置上。清除瀏覽器資料
或換裝置會遺失紀錄，之後若接上資料庫（如 Supabase）即可跨裝置同步。
