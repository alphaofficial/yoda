import { Request, Response, NextFunction } from 'express';
import { User } from '@/models/User';

export function auth(req: Request, res: Response, next: NextFunction) {
    if (req.is_authenticated()) {
        next();
    } else {
        return res.redirect('/login');
    }
}

export function guest(req: Request, res: Response, next: NextFunction) {
    if (req.is_authenticated()) {
        return res.redirect('/home');
    } else {
        next();
    }
}

export async function verified(req: Request, res: Response, next: NextFunction) {
    if (!req.is_authenticated()) {
        return res.redirect('/login');
    }
    const user = await req.user() as User | null;
    if (!user?.emailVerifiedAt) {
        return res.redirect('/verify-email');
    }
    next();
}
