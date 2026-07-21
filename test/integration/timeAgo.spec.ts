import { describe, expect, it } from 'vitest';
import { timeAgo } from '@/views/lib/timeAgo';

const now = new Date('2026-07-20T12:00:00Z');

describe('timeAgo', () => {
	it('shows seconds for pull requests updated less than a minute ago', () => {
		expect(timeAgo('2026-07-20T11:59:55Z', now)).toBe('5 seconds ago');
	});

	it('shows minutes for pull requests updated less than an hour ago', () => {
		expect(timeAgo('2026-07-20T11:55:00Z', now)).toBe('5 minutes ago');
	});

	it('shows singular hour text for pull requests updated one hour ago', () => {
		expect(timeAgo('2026-07-20T11:00:00Z', now)).toBe('1 hour ago');
	});

	it('keeps day and week labels for older pull requests', () => {
		expect(timeAgo('2026-07-19T12:00:00Z', now)).toBe('1 day ago');
		expect(timeAgo('2026-07-06T12:00:00Z', now)).toBe('2 weeks ago');
	});
});
