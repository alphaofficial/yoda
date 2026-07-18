import { Migration } from '@mikro-orm/migrations';

export class Migration20260718180000 extends Migration {
	override async up(): Promise<void> {
		this.addSql(`alter table \`dashboard_settings\` add column \`theme\` text not null default 'light';`);
	}
}
