export class PasswordReset {
    email!: string;
    tokenHash!: string;
    createdAt: Date = new Date();
}
