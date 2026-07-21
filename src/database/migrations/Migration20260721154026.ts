import { Migration } from '@mikro-orm/migrations';

export class Migration20260721154026 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`dashboard_shortcuts\` rename column \`icon_url\` to \`emoji\`;`);
  }

}
