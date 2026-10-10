import type { GCalClient } from "./gcal-client.js";
import type { CalendarEvent, SyncDiff, SyncResult, SyncedEvent } from "./types.js";

/**
 * TimeTree イベント (ICS由来) と Google Calendar の同期済みイベントを比較し、
 * 差分を計算して適用する
 */
export class SyncEngine {
  constructor(private gcal: GCalClient) {}

  /**
   * 差分を計算
   */
  computeDiff(
    sourceEvents: CalendarEvent[],
    syncedEvents: SyncedEvent[]
  ): SyncDiff {
    // Google Calendar 側のマップ: timetreeUid → SyncedEvent
    const syncedMap = new Map<string, SyncedEvent>();
    for (const se of syncedEvents) {
      syncedMap.set(se.timetreeUid, se);
    }

    // TimeTree 側のUID集合
    const sourceUids = new Set<string>();

    const toCreate: CalendarEvent[] = [];
    const toUpdate: SyncDiff["toUpdate"] = [];

    for (const event of sourceEvents) {
      sourceUids.add(event.uid);
      const existing = syncedMap.get(event.uid);

      if (!existing) {
        // Google Calendar に存在しない → 新規作成
        toCreate.push(event);
      } else {
        // 存在する → lastModified を比較して更新判定
        const sourceModified = event.lastModified?.toISOString() ?? "";
if (
  sourceModified !== existing.lastModified ||
  process.env.FORCE_UPDATE_ALL === "true"
) {
          toUpdate.push({
            source: event,
            googleEventId: existing.googleEventId,
          });
        }
      }
    }

    // Google Calendar にあって TimeTree にないイベント → 削除
    // 取得件数が異常に少ない場合は、誤削除を防ぐため同期を中止
if (
  syncedEvents.length >= 100 &&
  sourceEvents.length < syncedEvents.length * 0.8
) {
  throw new Error(
    `Safety stop: TimeTree events=${sourceEvents.length}, Google events=${syncedEvents.length}`
  );
}
    const toDelete: SyncDiff["toDelete"] = [];
    for (const se of syncedEvents) {
      if (!sourceUids.has(se.timetreeUid)) {
        toDelete.push({
          googleEventId: se.googleEventId,
          timetreeUid: se.timetreeUid,
        });
      }
    }

    return { toCreate, toUpdate, toDelete };
  }

  /**
   * 差分を Google Calendar に適用
   */
  async applyDiff(diff: SyncDiff): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: 0,
    };

    // 作成
    for (const event of diff.toCreate) {
      try {
        await this.gcal.createEvent(event);
        result.created++;
        console.log(`  Created: ${event.summary}`);
      } catch (err) {
        result.errors++;
        console.error(`  Failed to create "${event.summary}":`, err);
      }
    }

    // 更新
    for (const { source, googleEventId } of diff.toUpdate) {
      try {
        await this.gcal.updateEvent(googleEventId, source);
        result.updated++;
        console.log(`  Updated: ${source.summary}`);
      } catch (err) {
        result.errors++;
        console.error(`  Failed to update "${source.summary}":`, err);
      }
    }

    // 削除
    for (const { googleEventId, timetreeUid } of diff.toDelete) {
      try {
        await this.gcal.deleteEvent(googleEventId);
        result.deleted++;
        console.log(`  Deleted: ${timetreeUid}`);
      } catch (err) {
        result.errors++;
        console.error(`  Failed to delete "${timetreeUid}":`, err);
      }
    }

    return result;
  }
}
