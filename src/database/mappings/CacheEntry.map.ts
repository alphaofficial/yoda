import { EntitySchema } from '@mikro-orm/core';
import { CacheEntry } from '@/models/CacheEntry';

export const CacheEntryMapper = new EntitySchema<CacheEntry>({
	class: CacheEntry,
	tableName: 'cache_entries',
	properties: {
		key: { type: 'string', primary: true },
		value: { type: 'text' },
		expiresAt: { type: 'number', fieldName: 'expires_at', nullable: true },
	},
	indexes: [
		{ name: 'cache_entries_expires_at_index', properties: ['expiresAt'] },
	],
});
