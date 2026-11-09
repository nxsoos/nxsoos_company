import { describe, expect, it } from 'vitest';
import { idleBreak } from '../src/office-breaks';

describe('decorative office breaks', () => {
  it('keeps every employee at their desk for at least two minutes and staggers first breaks', () => {
    const starts = Array.from({ length: 5 }, (_, index) => idleBreak(index, 0).delay);
    expect(starts.every((delay) => delay >= 120)).toBe(true);
    expect(new Set(starts).size).toBe(5);
  });
  it('varies coffee and TV breaks with several minutes back at the desk between outings', () => {
    for (let role = 0; role < 5; role++) {
      const schedule = Array.from({ length: 8 }, (_, sequence) => idleBreak(role, sequence));
      expect(new Set(schedule.map((entry) => entry.activity))).toEqual(new Set(['coffee', 'tv']));
      expect(schedule.slice(1).every((entry) => entry.delay >= 180 && entry.delay <= 300)).toBe(
        true,
      );
      expect(new Set(schedule.slice(1).map((entry) => entry.delay)).size).toBeGreaterThan(1);
      expect(schedule.every((entry) => entry.duration >= 18 && entry.duration <= 55)).toBe(true);
    }
  });
});
