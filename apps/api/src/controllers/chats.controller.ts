import type { Request, Response } from 'express';

import { SuccessResponse } from '../core/responses/SuccessResponse.js';
import { createChatSchema, renameChatSchema } from '../core/validation/schemas/chats.schema.js';
import { resourceParamsSchema } from '../core/validation/schemas/documents.schema.js';
import { messagePageSchema } from '../core/validation/schemas/message-page.schema.js';
import * as chats from '../services/chats.service.js';
import { getChatThread } from '../services/chats/thread.service.js';
import { requireUserId } from '../utils/request-user.js';

export const createChat = async (req: Request, res: Response) => {
  const { title } = createChatSchema.parse(req.body);
  return new SuccessResponse(
    'Chat created',
    { chat: await chats.createChat(requireUserId(req), title) },
    201,
  ).send(req, res);
};

export const listChats = async (req: Request, res: Response) => {
  return new SuccessResponse('Chats loaded', {
    chats: await chats.listChats(requireUserId(req)),
  }).send(req, res);
};

export const renameChat = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  const { title } = renameChatSchema.parse(req.body);
  return new SuccessResponse('Chat renamed', {
    chat: await chats.renameChat(requireUserId(req), id, title),
  }).send(req, res);
};

export const deleteChat = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  await chats.deleteChat(requireUserId(req), id);
  return new SuccessResponse('Chat deleted', {}).send(req, res);
};

export const getMessages = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  const { before } = messagePageSchema.parse(req.query);
  return new SuccessResponse(
    'Thread loaded',
    await getChatThread(requireUserId(req), id, before),
  ).send(req, res);
};

export const getDocuments = async (req: Request, res: Response) => {
  const { id } = resourceParamsSchema.parse(req.params);
  return new SuccessResponse('Chat documents loaded', {
    documents: await chats.getChatDocuments(requireUserId(req), id),
  }).send(req, res);
};
