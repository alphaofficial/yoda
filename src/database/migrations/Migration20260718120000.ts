import { Migration } from '@mikro-orm/migrations';

export class Migration20260718120000 extends Migration {
	override async up(): Promise<void> {
		this.addSql(`alter table \`dashboard_settings\` add column \`shortcut_limit\` integer not null default 8;`);
	}
}
