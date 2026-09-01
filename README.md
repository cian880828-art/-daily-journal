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

第一版不串接 AI，用關鍵字比對、情緒標籤與紀錄內容做整理與呈現。

## 技術

- React + TypeScript + Tailwind CSS（Vite）
- 資料儲存在瀏覽器 `localStorage`，不需登入、不需資料庫
- 支援安裝為 PWA（加入主畫面、可離線開啟）
- 資料層以 `JournalRepository` 介面封裝（見 `src/lib/journalRepository.ts`），
  之後要換成 Supabase 或其他後端，只需要新增一個實作並替換 `journalRepo`
  這個 singleton，其餘頁面與元件完全不需要改動。

### 專案結構

```
src/
  types/journal.ts        # JournalEntry 型別、情緒清單
  lib/
    journalRepository.ts  # 資料存取介面 + localStorage 實作
    useJournalEntries.ts  # 讀寫資料的 React hook
    dateUtils.ts          # 日期／連續天數工具
    analytics.ts          # 週回顧、月度 Insights、關鍵字擷取邏輯
  components/              # EmotionPicker、MoodSlider、BottomNav 等共用元件
  pages/                   # Home、DailyEntry、History、WeeklyReview、Insights
```

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
