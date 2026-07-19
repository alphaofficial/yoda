import { Migration } from '@mikro-orm/migrations';

export class Migration20260719203000_RemoveShortcutIcon extends Migration {
	override async up(): Promise<void> {
		this.addSql('alter table `dashboard_shortcuts` drop column `icon`;');
	}
}
