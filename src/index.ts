import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { parseIcsFile } from "./ics-parser.js";
import { GCalClient } from "./gcal-client.js";
import { SyncEngine } from "./sync-engine.js";

async function main(): Promise<void> {
  console.log("=== TimeTree → Google Calendar Sync ===\n");

  // 1. 設定読み込み
  const config = loadConfig();
  console.log("Config loaded.");

  // 2. timetree-exporter CLI で ICS エクスポート
  console.log("Exporting events from TimeTree...");
  exportFromTimeTree(config);

  if (!existsSync(config.icsFilePath)) {
    throw new Error(`ICS file not found: ${config.icsFilePath}`);
  }

  // 3. ICS パース
  console.log("Parsing ICS file...");
  const events = parseIcsFile(config.icsFilePath);
  console.log(`  Found ${events.length} events in ICS.`);
  
  // ラベル情報の確認専用モード（Google Calendarにはアクセスしない）
  if (process.env.CHECK_LABELS === "true") {
    const labelCounts = new Map<string, number>();

    for (const event of events) {
      for (const label of event.categories) {
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }
    }

    console.log("\n=== TimeTree Label Check ===");
    console.log(`Total events: ${events.length}`);
    console.log(
      `Events with categories: ${
        events.filter((event) => event.categories.length > 0).length
      }`
    );
    console.log("Category counts:");

    for (const [label, count] of labelCounts) {
      console.log(`  ${label}: ${count}`);
    }

    console.log("Label check finished. Google Calendar was not accessed.");
    return;
  }


  // 4. Google Calendar クライアント初期化
  const gcal = new GCalClient(config.googleCredentials, config.googleCalendarId);

  // 5. 同期済みイベント取得
  console.log("Fetching synced events from Google Calendar...");
  const syncedEvents = await gcal.listSyncedEvents();
  console.log(`  Found ${syncedEvents.length} synced events in Google Calendar.`);

  // 6. 差分計算
  const engine = new SyncEngine(gcal);
  const diff = engine.computeDiff(events, syncedEvents);
  console.log(
    `\nDiff: ${diff.toCreate.length} to create, ${diff.toUpdate.length} to update, ${diff.toDelete.length} to delete`
  );

  // 差分確認専用モード：予定を変更せず終了
  if (process.env.DRY_RUN === "true") {
    console.log("\n=== DRY RUN ===");
    console.log(`Create: ${diff.toCreate.length}`);
    console.log(`Update: ${diff.toUpdate.length}`);
    console.log(`Delete: ${diff.toDelete.length}`);
    console.log("No Google Calendar events were modified.");
    return;
  }

  // 7. 差分適用
  if (
    diff.toCreate.length === 0 &&
    diff.toUpdate.length === 0 &&
    diff.toDelete.length === 0
  ) {
    console.log("\nNo changes to sync.");
    return;
  }

  console.log("\nApplying changes...");
  const result = await engine.applyDiff(diff);

  console.log(
    `\nSync complete: created=${result.created}, updated=${result.updated}, deleted=${result.deleted}, errors=${result.errors}`
  );

  if (result.errors > 0) {
    process.exitCode = 1;
  }
}

function exportFromTimeTree(config: {
  timetreeEmail: string;
  timetreePassword: string;
  timetreeCalendarCode: string;
  icsFilePath: string;
}): void {
  const cmd = [
    "timetree-exporter",
    "-e", config.timetreeEmail,
    "-c", config.timetreeCalendarCode,
    "-o", config.icsFilePath,
  ].join(" ");

  execSync(cmd, {
    env: {
      ...process.env,
      TIMETREE_PASSWORD: config.timetreePassword,
    },
    stdio: "inherit",
  });
}

main().catch((err) => {
  console.error("::error::Sync failed:", err);
  process.exitCode = 1;
});
