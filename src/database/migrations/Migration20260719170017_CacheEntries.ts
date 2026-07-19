import { Migration } from '@mikro-orm/migrations';

export class Migration20260719170017_CacheEntries extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`cache_entries\` (\`key\` text not null, \`value\` text not null, \`expires_at\` integer null, primary key (\`key\`));`);
    this.addSql(`create index \`cache_entries_expires_at_index\` on \`cache_entries\` (\`expires_at\`);`);
  }

}
