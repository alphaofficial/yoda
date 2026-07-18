import { Migration } from '@mikro-orm/migrations';

export class Migration20260718071900 extends Migration {
	override async up(): Promise<void> {
		this.addSql(`create table if not exists \`dashboard_settings\` (\`id\` text not null, \`display_name\` text not null, \`time_zone\` text not null, \`github_token\` text null, \`repositories\` text not null default '[]', \`pull_request_filters\` text not null default '{}', \`created_at\` datetime not null default CURRENT_TIMESTAMP, \`updated_at\` datetime not null default CURRENT_TIMESTAMP, primary key (\`id\`));`);
		this.addSql(`create table if not exists \`dashboard_shortcuts\` (\`id\` text not null, \`group_id\` text not null, \`group_label\` text not null, \`label\` text not null, \`url\` text not null, \`icon\` text not null, \`position\` integer not null, \`created_at\` datetime not null default CURRENT_TIMESTAMP, \`updated_at\` datetime not null default CURRENT_TIMESTAMP, primary key (\`id\`));`);
		this.addSql(`create index if not exists \`dashboard_shortcuts_group_position_index\` on \`dashboard_shortcuts\` (\`group_id\`, \`position\`);`);
	}
}
