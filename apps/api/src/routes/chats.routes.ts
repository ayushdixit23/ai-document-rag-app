import { Router } from 'express';

import { generateTitle } from '../controllers/chat-title.controller.js';
import * as controller from '../controllers/chats.controller.js';
import { sendMessage } from '../controllers/messages.controller.js';
import {
  createChatSchema,
  renameChatSchema,
  sendMessageSchema,
} from '../core/validation/schemas/chats.schema.js';
import { resourceParamsSchema } from '../core/validation/schemas/documents.schema.js';
import { messagePageSchema } from '../core/validation/schemas/message-page.schema.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validateRequest } from '../middlewares/validation.js';

const router = Router();
router.use(requireAuth);
router.post('/', validateRequest({ body: createChatSchema }), asyncHandler(controller.createChat));
router.get('/', asyncHandler(controller.listChats));
router.use('/:id', validateRequest({ params: resourceParamsSchema }));
router.patch(
  '/:id',
  validateRequest({ body: renameChatSchema }),
  asyncHandler(controller.renameChat),
);
router.delete('/:id', asyncHandler(controller.deleteChat));
router.post('/:id/title', asyncHandler(generateTitle));
router.get('/:id/documents', asyncHandler(controller.getDocuments));
router.get(
  '/:id/messages',
  validateRequest({ query: messagePageSchema }),
  asyncHandler(controller.getMessages),
);
router.post(
  '/:id/messages',
  validateRequest({ body: sendMessageSchema }),
  asyncHandler(sendMessage),
);

export default router;
