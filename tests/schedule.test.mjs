import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSlotISO } from '../lib/schedule.mjs';

test('nextSlotISO returns today UTC slot when comfortably in the future', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  assert.equal(nextSlotISO('22:35', now), '2026-10-20T22:35:00Z');
});

test('nextSlotISO rolls to tomorrow when the slot is nearer than 35 minutes', () => {
  const now = new Date('2026-10-20T22:10:00Z'); // 25 min before 22:35
  assert.equal(nextSlotISO('22:35', now), '2026-10-21T22:35:00Z');
});

test('nextSlotISO rolls to tomorrow when the slot already passed', () => {
  const now = new Date('2026-10-20T23:50:00Z');
  assert.equal(nextSlotISO('22:35', now), '2026-10-21T22:35:00Z');
});
