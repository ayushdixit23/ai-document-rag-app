import { Router } from 'express';

import { getIndex } from '../controllers/index.controller.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import chatsRoutes from './chats.routes.js';
import documentsRoutes from './documents.routes.js';
import healthRoutes from './health.routes.js';
import meRoutes from './me.routes.js';

const router = Router();

router.get('/', asyncHandler(getIndex));
router.use('/health', healthRoutes);
router.use('/api/me', meRoutes);
router.use('/api/documents', documentsRoutes);
router.use('/api/chats', chatsRoutes);

export default router;
