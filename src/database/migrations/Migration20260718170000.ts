import { Migration } from '@mikro-orm/migrations';

export class Migration20260718170000 extends Migration {
	override async up(): Promise<void> {
		this.addSql(`alter table \`dashboard_settings\` add column \`time_format\` text not null default '12';`);
	}
}
