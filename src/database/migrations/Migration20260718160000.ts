import { Migration } from '@mikro-orm/migrations';

export class Migration20260718160000 extends Migration {
	override async up(): Promise<void> {
		this.addSql(`alter table \`dashboard_settings\` add column \`pull_request_window_days\` integer not null default 7;`);
	}
}
