import { Router } from 'express';
import * as publicPages from '@/controllers/public';
import * as aboutPages from '@/controllers/about';
import * as userPages from '@/controllers/users';
import * as authHandlers from '@/controllers/auth';
import { applyInertia } from '@/middleware/inertia';
import { auth, guest } from '@/middleware/auth';
import { authRateLimit, featureRateLimit } from '@/middleware/rateLimit';

const route = Router();

// Apply Inertia middleware to all routes
route.use(applyInertia);

// Apply rate limiter once to all sensitive auth POSTs
route.post(['/login', '/register', '/forgot-password', '/reset-password'], authRateLimit());
route.post('/email/resend-verification', featureRateLimit());

// Guest routes (only accessible when not authenticated)
route.get('/login', guest, authHandlers.showLogin);
route.post('/login', guest, authHandlers.login);
route.get('/register', guest, authHandlers.showRegister);
route.post('/register', guest, authHandlers.register);
route.get('/forgot-password', guest, authHandlers.showForgotPassword);
route.post('/forgot-password', guest, authHandlers.forgotPassword);
route.get('/reset-password/:token', guest, authHandlers.showResetPassword);
route.post('/reset-password', guest, authHandlers.resetPassword);

// Email verification routes (require auth, not necessarily verified)
route.get('/verify-email', auth, authHandlers.showVerifyEmail);
route.get('/verify-email/:token', auth, authHandlers.verifyEmail);
route.post('/email/resend-verification', auth, authHandlers.resendVerification);

// Public routes
route.get('/', publicPages.index);

// Protected routes (require authentication)
route.get('/about', auth, aboutPages.index);
route.get('/home', auth, authHandlers.dashboard);
route.post('/logout', auth, authHandlers.logout);
route.get('/users', auth, userPages.index);
route.get('/users/:id', auth, userPages.show);


export default route;
