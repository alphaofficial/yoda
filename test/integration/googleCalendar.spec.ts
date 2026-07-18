import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGoogleCalendarClient } from '@/integrations/calendar';

describe('Google Calendar integration', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockFetch: any;

	beforeEach(() => {
		mockFetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createMockResponse(options: {
		status?: number;
		ok?: boolean;
		headers?: Record<string, string>;
		body?: string;
	}): Response {
		const { status = 200, ok = true, headers = {}, body = '' } = options;
		return {
			ok,
			status,
			headers: {
				get: (name: string) => headers[name] ?? null,
			},
			text: async () => body,
		} as unknown as Response;
	}

	describe('unconfigured behavior', () => {
		it('returns unconfigured=true when clientId is missing', async () => {
			const client = createGoogleCalendarClient({
				clientId: '',
				clientSecret: 'secret',
				refreshToken: 'refresh',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
			});

			const result = await client.fetchEvents();

			expect(result.unconfigured).toBe(true);
			expect(result.items).toEqual([]);
		});

		it('returns unconfigured=true when clientSecret is missing', async () => {
			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: '',
				refreshToken: 'refresh',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
			});

			const result = await client.fetchEvents();

			expect(result.unconfigured).toBe(true);
			expect(result.items).toEqual([]);
		});

		it('returns unconfigured=true when refreshToken is missing', async () => {
			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: '',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
			});

			const result = await client.fetchEvents();

			expect(result.unconfigured).toBe(true);
			expect(result.items).toEqual([]);
		});

		it('returns unconfigured=true when calendarIds is empty', async () => {
			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh',
				calendarIds: [],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
			});

			const result = await client.fetchEvents();

			expect(result.unconfigured).toBe(true);
			expect(result.items).toEqual([]);
		});
	});

	describe('token handling', () => {
		it('uses application/x-www-form-urlencoded for token refresh', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'new_token', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'My Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			await client.fetchEvents();

			expect(mockFetch).toHaveBeenCalledWith(
				'https://oauth2.googleapis.com/token',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: expect.stringContaining('grant_type=refresh_token'),
				})
			);
		});

		it('reuses cached token until 60 seconds before expiry', async () => {
			mockFetch
				.mockReturnValueOnce(Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})))
				.mockReturnValueOnce(Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})))
				.mockReturnValueOnce(Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				})))
				.mockReturnValueOnce(Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})))
				.mockReturnValueOnce(Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				})));

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			await client.fetchEvents();
			await client.fetchEvents();

			expect(mockFetch).toHaveBeenCalledTimes(5);
		});

		it('renews token when less than 60 seconds before expiry', async () => {
			let callCount = 0;
			mockFetch.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ access_token: 'token123', expires_in: 55 }),
					}));
				}
				if (callCount === 2) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ summary: 'Calendar' }),
					}));
				}
				if (callCount === 3) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ items: [] }),
					}));
				}
				if (callCount === 4) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ access_token: 'token456', expires_in: 3600 }),
					}));
				}
				if (callCount === 5) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ summary: 'Calendar' }),
					}));
				}
				return Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				}));
			});

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			await client.fetchEvents();
			await client.fetchEvents();

			expect(callCount).toBe(6);
		});

		it('renews token on 401 and replays the request', async () => {
			let callCount = 0;
			mockFetch.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ access_token: 'expired_token', expires_in: 3600 }),
					}));
				}
				if (callCount === 2) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ summary: 'Calendar' }),
					}));
				}
				if (callCount === 3) {
					return Promise.resolve(createMockResponse({
						status: 401,
						body: 'Unauthorized',
					}));
				}
				if (callCount === 4) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ access_token: 'new_token', expires_in: 3600 }),
					}));
				}
				return Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				}));
			});

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.unconfigured).toBe(false);
			expect(callCount).toBe(5);
		});
	});

	describe('calendar metadata', () => {
		it('fetches calendar metadata using encoded calendar ID', async () => {
			let callCount = 0;
			mockFetch.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
					}));
				}
				if (callCount === 2) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ summary: 'Work Calendar' }),
					}));
				}
				return Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				}));
			});

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['work@example.com'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			await client.fetchEvents();

			expect(callCount).toBe(3);
			expect(mockFetch.mock.calls[1][0]).toContain('calendars/work%40example.com');
		});

		it('uses (Untitled event) when summary is missing', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ id: 'primary' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{
								id: 'event1',
								summary: '   ',
								start: { dateTime: '2024-06-15T14:00:00' },
								end: { dateTime: '2024-06-15T15:00:00' },
							},
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items[0].title).toBe('(Untitled event)');
		});
	});

	describe('event pagination', () => {
		it('fetches multiple pages of events', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [{ id: 'event1', summary: 'Event 1', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } }],
						nextPageToken: 'page2token',
					}),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [{ id: 'event2', summary: 'Event 2', start: { dateTime: '2024-06-15T16:00:00' }, end: { dateTime: '2024-06-15T17:00:00' } }],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items).toHaveLength(2);
			expect(result.items[0].title).toBe('Event 1');
			expect(result.items[1].title).toBe('Event 2');
		});

		it('encodes calendar ID in event fetch URL', async () => {
			let callCount = 0;
			mockFetch.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
					}));
				}
				if (callCount === 2) {
					return Promise.resolve(createMockResponse({
						status: 200,
						body: JSON.stringify({ summary: 'Calendar' }),
					}));
				}
				return Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify({ items: [] }),
				}));
			});

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['user@example.com'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			await client.fetchEvents();

			expect(callCount).toBe(3);
			expect(mockFetch.mock.calls[2][0]).toContain('user%40example.com/events');
		});
	});

	describe('concurrency', () => {
		it('fetches calendars with concurrency of 4', async () => {
			const responses = [
				{ access_token: 'token123', expires_in: 3600 },
				{ summary: 'Calendar 0', items: [] },
				{ items: [{ id: 'event0', summary: 'Event 0', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } }] },
				{ summary: 'Calendar 1', items: [] },
				{ items: [{ id: 'event1', summary: 'Event 1', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } }] },
				{ summary: 'Calendar 2', items: [] },
				{ items: [{ id: 'event2', summary: 'Event 2', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } }] },
				{ summary: 'Calendar 3', items: [] },
				{ items: [{ id: 'event3', summary: 'Event 3', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } }] },
				{ summary: 'Calendar 4', items: [] },
				{ items: [{ id: 'event4', summary: 'Event 4', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } }] },
				{ items: [] },
			];

			let callIndex = 0;
			mockFetch.mockImplementation(() => {
				const response = responses[callIndex] || { items: [] };
				callIndex++;
				return Promise.resolve(createMockResponse({
					status: 200,
					body: JSON.stringify(response),
				}));
			});

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['cal1', 'cal2', 'cal3', 'cal4', 'cal5'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			await client.fetchEvents();

			expect(callIndex).toBe(11);
		});
	});

	describe('event normalization', () => {
		it('normalizes timed events with dateTime', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{
								id: 'event1',
								summary: 'Team Meeting',
								start: { dateTime: '2024-06-15T14:00:00-04:00' },
								end: { dateTime: '2024-06-15T15:00:00-04:00' },
								htmlLink: 'https://calendar.google.com/event1',
							},
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items[0]).toMatchObject({
				id: 'event1',
				title: 'Team Meeting',
				start: '2024-06-15T14:00:00-04:00',
				end: '2024-06-15T15:00:00-04:00',
				allDay: false,
				url: 'https://calendar.google.com/event1',
			});
		});

		it('normalizes all-day events with date', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{
								id: 'event1',
								summary: 'Conference Day 1',
								start: { date: '2024-06-15' },
								end: { date: '2024-06-16' },
							},
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items[0]).toMatchObject({
				id: 'event1',
				title: 'Conference Day 1',
				start: '2024-06-15',
				end: '2024-06-16',
				allDay: true,
				url: null,
			});
		});

		it('excludes cancelled events', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{ id: 'event1', status: 'cancelled', summary: 'Cancelled Event' },
							{ id: 'event2', summary: 'Valid Event', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } },
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items).toHaveLength(1);
			expect(result.items[0].title).toBe('Valid Event');
		});

		it('excludes self-declined events', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{
								id: 'event1',
								summary: 'Declined Event',
								start: { dateTime: '2024-06-15T14:00:00' },
								end: { dateTime: '2024-06-15T15:00:00' },
								attendees: [{ self: true, responseStatus: 'declined' }],
							},
							{
								id: 'event2',
								summary: 'Accepted Event',
								start: { dateTime: '2024-06-15T16:00:00' },
								end: { dateTime: '2024-06-15T17:00:00' },
								attendees: [{ self: true, responseStatus: 'accepted' }],
							},
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items).toHaveLength(1);
			expect(result.items[0].title).toBe('Accepted Event');
		});

		it('deduplicates events by calendarId:eventId', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{ id: 'event1', summary: 'Event 1', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } },
							{ id: 'event1', summary: 'Event 1 Duplicate', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } },
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items).toHaveLength(1);
		});
	});

	describe('DST boundaries', () => {
		it('handles DST transition correctly using Luxon', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{
								id: 'event1',
								summary: 'Spring Forward Day',
								start: { dateTime: '2024-03-10T02:30:00' },
								end: { dateTime: '2024-03-10T03:30:00' },
							},
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-03-10T00:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items[0].title).toBe('Spring Forward Day');
		});
	});

	describe('sorting', () => {
		it('sorts events by start ascending', async () => {
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ access_token: 'token123', expires_in: 3600 }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({ summary: 'Calendar' }),
				})
			);
			mockFetch.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: JSON.stringify({
						items: [
							{ id: 'event3', summary: 'Third', start: { dateTime: '2024-06-15T16:00:00' }, end: { dateTime: '2024-06-15T17:00:00' } },
							{ id: 'event1', summary: 'First', start: { dateTime: '2024-06-15T10:00:00' }, end: { dateTime: '2024-06-15T11:00:00' } },
							{ id: 'event2', summary: 'Second', start: { dateTime: '2024-06-15T14:00:00' }, end: { dateTime: '2024-06-15T15:00:00' } },
						],
					}),
				})
			);

			const client = createGoogleCalendarClient({
				clientId: 'client123',
				clientSecret: 'secret',
				refreshToken: 'refresh_token',
				calendarIds: ['primary'],
				timeZone: 'America/New_York',
				lookaheadDays: 7,
				fetchImpl: mockFetch,
				now: new Date('2024-06-15T12:00:00Z'),
			});

			const result = await client.fetchEvents();

			expect(result.items[0].title).toBe('First');
			expect(result.items[1].title).toBe('Second');
			expect(result.items[2].title).toBe('Third');
		});
	});
});
