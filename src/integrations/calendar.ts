import { DateTime } from 'luxon';
import { requestJson, IntegrationRequestError } from '@/integrations/http';
import type { CalendarEventItem } from '@/types/dashboard';

interface GoogleTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

interface GoogleCalendarMetadata {
	id: string;
	summary: string;
}

interface GoogleCalendarEvent {
	id: string;
	status?: string;
	summary?: string;
	start?: {
		dateTime?: string;
		date?: string;
	};
	end?: {
		dateTime?: string;
		date?: string;
	};
	htmlLink?: string;
	attendees?: Array<{
		self?: boolean;
		responseStatus?: string;
	}>;
}

interface GoogleEventsResponse {
	items: GoogleCalendarEvent[];
	nextPageToken?: string;
}

interface CalendarClientOptions {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	calendarIds: string[];
	timeZone: string;
	lookaheadDays: number;
	fetchImpl?: typeof fetch;
	now?: Date;
}

interface FetchResult {
	items: CalendarEventItem[];
	unconfigured: boolean;
}

interface CachedToken {
	accessToken: string;
	expiresAtMs: number;
}

export function createGoogleCalendarClient(options: CalendarClientOptions) {
	const {
		clientId,
		clientSecret,
		refreshToken,
		calendarIds,
		timeZone,
		lookaheadDays,
		fetchImpl = fetch,
		now = new Date(),
	} = options;

	const unconfigured = !clientId || !clientSecret || !refreshToken || calendarIds.length === 0;

	let cachedToken: CachedToken | null = null;

	async function getAccessToken(): Promise<string> {
		if (cachedToken && Date.now() < cachedToken.expiresAtMs - 60_000) {
			return cachedToken.accessToken;
		}

		const params = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		});

		const tokenResponse = await requestJson<GoogleTokenResponse>({
			url: 'https://oauth2.googleapis.com/token',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params.toString(),
			provider: 'google',
			fetchImpl,
		});

		const expiresAtMs = Date.now() + tokenResponse.expires_in * 1000;
		cachedToken = {
			accessToken: tokenResponse.access_token,
			expiresAtMs,
		};

		return cachedToken.accessToken;
	}

	async function renewAccessToken(): Promise<string> {
		cachedToken = null;
		return getAccessToken();
	}

	async function fetchWithAuth<T>(url: string, accessToken: string): Promise<T> {
		try {
			return await requestJson<T>({
				url,
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				provider: 'google',
				fetchImpl,
			});
		} catch (error) {
			if (
				error instanceof IntegrationRequestError &&
				error.status === 401
			) {
				const newToken = await renewAccessToken();
				return requestJson<T>({
					url,
					method: 'GET',
					headers: {
						Authorization: `Bearer ${newToken}`,
					},
					provider: 'google',
					fetchImpl,
				});
			}
			throw error;
		}
	}

	async function fetchCalendarMetadata(
		calendarId: string,
		accessToken: string
	): Promise<string> {
		const encodedCalendarId = encodeURIComponent(calendarId);
		const metadata = await fetchWithAuth<GoogleCalendarMetadata>(
			`https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}`,
			accessToken
		);
		return metadata.summary || '(Untitled event)';
	}

	async function fetchEventsForCalendar(
		calendarId: string,
		calendarName: string,
		accessToken: string,
		timeMin: string,
		timeMax: string
	): Promise<CalendarEventItem[]> {
		const encodedCalendarId = encodeURIComponent(calendarId);
		const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;
		const params = new URLSearchParams({
			singleEvents: 'true',
			orderBy: 'startTime',
			timeMin,
			timeMax,
			maxResults: '250',
		});

		const events: CalendarEventItem[] = [];
		const seen = new Set<string>();

		let pageToken: string | undefined;
		while (true) {
			if (pageToken) {
				params.set('pageToken', pageToken);
			}

			const url = `${baseUrl}?${params.toString()}`;
			const response = await fetchWithAuth<GoogleEventsResponse>(url, accessToken);

			for (const event of response.items) {
				if (event.status === 'cancelled') {
					continue;
				}

				const selfAttendee = event.attendees?.find((a) => a.self === true);
				if (selfAttendee?.responseStatus === 'declined') {
					continue;
				}

				const dedupKey = `${calendarId}:${event.id}`;
				if (seen.has(dedupKey)) {
					continue;
				}
				seen.add(dedupKey);

				const title = event.summary?.trim() || '(Untitled event)';

				let start: string;
				let end: string;
				let allDay: boolean;

				if (event.start?.dateTime) {
					start = event.start.dateTime;
					end = event.end?.dateTime || event.start.dateTime;
					allDay = false;
				} else if (event.start?.date) {
					start = event.start.date;
					end = event.end?.date || event.start.date;
					allDay = true;
				} else {
					continue;
				}

				events.push({
					id: event.id,
					calendarId,
					calendarName,
					title,
					start,
					end,
					allDay,
					url: event.htmlLink || null,
				});
			}

			pageToken = response.nextPageToken;
			if (!pageToken) {
				break;
			}
		}

		return events;
	}

	async function fetchEventsInternal(): Promise<FetchResult> {
		if (unconfigured) {
			return { items: [], unconfigured: true };
		}

		const accessToken = await getAccessToken();

		const dtNow = DateTime.fromJSDate(now).setZone(timeZone);
		const startOfToday = dtNow.startOf('day');
		const endBoundary = startOfToday.plus({ days: lookaheadDays });

		const timeMin = startOfToday.toISO()!;
		const timeMax = endBoundary.toISO()!;

		const calendarChunks = chunkArray(calendarIds, 4);
		const allEvents: CalendarEventItem[] = [];

		for (const chunk of calendarChunks) {
			const chunkPromises = chunk.map(async (calendarId) => {
				const calendarName = await fetchCalendarMetadata(calendarId, accessToken);
				const events = await fetchEventsForCalendar(
					calendarId,
					calendarName,
					accessToken,
					timeMin,
					timeMax
				);
				return events;
			});

			const chunkResults = await Promise.all(chunkPromises);
			for (const events of chunkResults) {
				allEvents.push(...events);
			}
		}

		allEvents.sort((a, b) => a.start.localeCompare(b.start));

		return { items: allEvents, unconfigured: false };
	}

	return { fetchEvents: fetchEventsInternal };
}

function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}
