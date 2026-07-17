import { SendWelcomeEmailPayload, sendWelcomeEmail } from '@/core/mail';
import { Queue } from '@/primitives/queue';

Queue.on<SendWelcomeEmailPayload>('sendWelcomeEmail', (_ctx, payload) => sendWelcomeEmail(payload));
