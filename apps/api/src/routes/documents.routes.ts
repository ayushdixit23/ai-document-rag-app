import { Router } from 'express';

import * as controller from '../controllers/documents.controller.js';
import {
  resourceParamsSchema,
  uploadsSchema,
} from '../core/validation/schemas/documents.schema.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validateRequest } from '../middlewares/validation.js';

const router = Router();
router.use(requireAuth);
router.post(
  '/uploads',
  validateRequest({ body: uploadsSchema }),
  asyncHandler(controller.uploadDocuments),
);
router.get('/', asyncHandler(controller.getDocuments));
router.use('/:id', validateRequest({ params: resourceParamsSchema }));
router.post('/:id/complete', asyncHandler(controller.completeDocument));
router.post('/:id/retry', asyncHandler(controller.retryDocumentUpload));
router.get('/:id', asyncHandler(controller.getDocument));
router.delete('/:id', asyncHandler(controller.deleteDocument));

export default router;
