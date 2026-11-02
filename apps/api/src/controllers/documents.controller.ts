import type { Request, Response } from 'express';

import { SuccessResponse } from '../core/responses/SuccessResponse.js';
import {
  resourceParamsSchema,
  uploadsSchema,
} from '../core/validation/schemas/documents.schema.js';
import {
  completeUpload,
  createUploads,
  removeDocument,
  retryDocument,
} from '../services/documents.service.js';
import {
  getOwnedDocument,
  listOwnedDocuments,
  publicDocument,
} from '../services/documents/document.repository.js';
import { requireUserId } from '../utils/request-user.js';

export const uploadDocuments = async (req: Request, res: Response) => {
  const { files } = uploadsSchema.parse(req.body);
  return new SuccessResponse(
    'Uploads created',
    await createUploads(requireUserId(req), files),
    201,
  ).send(req, res);
};

export const completeDocument = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  const document = await completeUpload(requireUserId(req), id);
  return new SuccessResponse('Document accepted', { document }, 202).send(req, res);
};

export const getDocument = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  const document = publicDocument(await getOwnedDocument(requireUserId(req), id));
  return new SuccessResponse('Document loaded', { document }).send(req, res);
};

export const getDocuments = async (req: Request, res: Response) => {
  return new SuccessResponse('Documents loaded', {
    documents: await listOwnedDocuments(requireUserId(req)),
  }).send(req, res);
};

export const retryDocumentUpload = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  const document = await retryDocument(requireUserId(req), id);
  return new SuccessResponse('Document accepted', { document }, 202).send(req, res);
};

export const deleteDocument = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  await removeDocument(requireUserId(req), id);
  return new SuccessResponse('Document deleted', {}).send(req, res);
};
