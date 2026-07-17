export class User {
    id: string;
    name: string;
    email: string;
    password: string;
    emailVerifiedAt?: Date;
    rememberToken?: string;
    createdAt: Date = new Date();
    updatedAt: Date = new Date();

    constructor(id: string, name: string, email: string, password: string) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.password = password;
    }
}