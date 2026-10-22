import assert from 'node:assert/strict';
import test from 'node:test';
import { GCalClient } from '../src/gcal-client.ts';

// Exercise the public update path with an in-memory PATCH endpoint; no credentials/API.
const timed = {
  uid: 'test-event', summary: 'Test', description: '', location: '', categories: [],
  start: new Date('2026-10-19T02:00:00Z'), end: new Date('2026-10-19T05:00:00Z'),
  allDay: false, recurrence: [], lastModified: null,
};
const allDay = { ...timed, allDay: true,
  start: new Date(2026, 9, 19), end: new Date(2026, 9, 20) };

for (const [name, source, initial] of [
  ['all-day to timed clears date', timed, { start: { date: '2026-10-19' }, end: { date: '2026-10-20' } }],
  ['timed to all-day clears dateTime and timeZone', allDay, { start: { dateTime: '2026-10-19T02:00:00Z', timeZone: 'Asia/Tokyo' }, end: { dateTime: '2026-10-19T05:00:00Z', timeZone: 'Asia/Tokyo' } }],
  ['timed to timed stays timed', timed, { start: { dateTime: '2026-10-18T02:00:00Z' }, end: { dateTime: '2026-10-18T05:00:00Z' } }],
  ['all-day to all-day stays all-day', allDay, { start: { date: '2026-10-18' }, end: { date: '2026-10-19' } }],
]) {
  test(name, async () => {
    const client = Object.create(GCalClient.prototype);
    client.calendarId = 'test-calendar';
    let calls = 0;
    client.calendar = { events: { patch: async ({ calendarId, eventId, requestBody }) => {
      calls++;
      assert.equal(calendarId, 'test-calendar');
      assert.equal(eventId, 'test-id');
      // JSON round-trip ensures nulls survive serialization to the API.
      const body = JSON.parse(JSON.stringify(requestBody));
      for (const field of ['start', 'end']) {
        const merged = { ...initial[field], ...body[field] };
        if (source.allDay) {
          assert.equal(body[field].dateTime, null);
          assert.equal(body[field].timeZone, null);
          assert.equal(merged.date, field === 'start' ? '2026-10-19' : '2026-10-20');
        } else {
          assert.equal(body[field].date, null);
          assert.equal(merged.dateTime, source[field].toISOString());
          assert.equal(merged.timeZone, 'Asia/Tokyo');
        }
        assert.notEqual(Boolean(merged.date), Boolean(merged.dateTime));
      }
      assert.equal(body.extendedProperties.private.timetreeUid, source.uid);
    } } };
    await client.updateEvent('test-id', source);
    assert.equal(calls, 1);
  });
}
