import { Migration } from '@mikro-orm/migrations';

export class Migration20260718160500 extends Migration {
	override async up(): Promise<void> {
		const columns = await this.execute(`pragma table_info('dashboard_settings');`);
		if (!columns.some(column => column.name === 'pull_request_filters')) {
			this.addSql(`alter table \`dashboard_settings\` add column \`pull_request_filters\` text not null default '{}';`);
		}
	}
}
