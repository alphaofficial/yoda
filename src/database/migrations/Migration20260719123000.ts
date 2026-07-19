import { Migration } from '@mikro-orm/migrations';

export class Migration20260719123000 extends Migration {
	override async up(): Promise<void> {
		this.addSql(`alter table \`dashboard_settings\` add column \`backup_interval_hours\` integer not null default 24;`);
		this.addSql(`alter table \`dashboard_settings\` add column \`backup_retention_days\` integer not null default 30;`);
	}
}
