import { Migration } from '@mikro-orm/migrations';

export class Migration20260621181352 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`password_resets\` (\`email\` text not null, \`token_hash\` text not null, \`created_at\` datetime not null default CURRENT_TIMESTAMP, primary key (\`email\`));`);

    this.addSql(`create table \`queue_jobs\` (\`id\` text not null, \`name\` text not null, \`payload\` text not null, \`status\` text not null default 'pending', \`attempts\` integer not null default 0, \`available_at\` integer not null, \`locked_at\` integer null, \`locked_by\` text null, \`last_error\` text null, \`created_at\` integer not null, \`updated_at\` integer not null, primary key (\`id\`));`);
    this.addSql(`create index \`queue_jobs_pending_index\` on \`queue_jobs\` (\`status\`, \`available_at\`, \`created_at\`);`);
    this.addSql(`create index \`queue_jobs_locked_index\` on \`queue_jobs\` (\`status\`, \`locked_at\`);`);

    this.addSql(`create table \`sessions\` (\`id\` text not null, \`secret_hash\` text not null, \`user_id\` text null, \`ip_address\` text null, \`user_agent\` text null, \`payload\` text not null, \`last_activity\` integer not null, \`created_at\` integer not null, primary key (\`id\`));`);
    this.addSql(`create index \`sessions_user_id_index\` on \`sessions\` (\`user_id\`);`);
    this.addSql(`create index \`sessions_last_activity_index\` on \`sessions\` (\`last_activity\`);`);

    this.addSql(`create table \`users\` (\`id\` text not null, \`name\` text not null, \`email\` text not null, \`password\` text not null, \`email_verified_at\` datetime null, \`remember_token\` text null, \`created_at\` datetime not null default CURRENT_TIMESTAMP, \`updated_at\` datetime not null default CURRENT_TIMESTAMP, primary key (\`id\`));`);
    this.addSql(`create unique index \`users_email_unique\` on \`users\` (\`email\`);`);
  }

}
