import mongoose from 'mongoose';
import { VendorMessageThread } from '../../external/models/VendorMessageThread.js';
import { ExternalUser } from '../../external/models/ExternalUser.js';
import { notifyVendor } from '../../notifications/notification.service.js';
import { badRequest, notFound, conflict } from '../utils/http.js';

export async function ownedCustomerThread(customerId, threadId) {
  if (!mongoose.isValidObjectId(threadId)) throw notFound('Conversation not found');
  const thread = await VendorMessageThread.findOne({ _id: threadId, customer: customerId });
  if (!thread) throw notFound('Conversation not found');
  return thread;
}

const serialize = (m) => ({
  id: String(m._id), senderType: m.sender === 'CLIENT' ? 'customer' : m.sender === 'VENDOR' ? 'vendor' : 'system',
  senderName: m.sender === 'CLIENT' ? 'You' : m.senderName || 'STARVNT', body: m.text, createdAt: m.createdAt,
});

export async function readCustomerThread(customerId, threadId) {
  const thread = await ownedCustomerThread(customerId, threadId);
  const unread = thread.unreadClientCount || (thread.messages || []).some((m) => m.sender !== 'CLIENT' && !m.isRead);
  if (unread) {
    await VendorMessageThread.updateOne({ _id: thread._id, customer: customerId }, {
      $set: { unreadClientCount: 0, 'messages.$[received].isRead': true },
    }, { arrayFilters: [{ 'received.sender': { $ne: 'CLIENT' } }] });
  }
  return { messages: (thread.messages || []).map(serialize) };
}

export async function postCustomerThreadMessage(customerId, threadId, body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text || text.length > 2000) throw badRequest('INVALID_BODY', 'Message must be 1–2000 characters');
  const thread = await ownedCustomerThread(customerId, threadId);
  if (thread.status === 'BLOCKED') throw conflict('THREAD_BLOCKED', 'This conversation is closed.');
  const customer = await ExternalUser.findById(customerId).select('fullName').lean();
  const message = { sender: 'CLIENT', senderName: customer?.fullName || 'Customer', text, isRead: false, createdAt: new Date() };
  thread.messages.push(message);
  thread.lastMessageText = text;
  thread.lastMessageAt = message.createdAt;
  thread.unreadVendorCount = (thread.unreadVendorCount || 0) + 1;
  await thread.save();
  await notifyVendor({
    vendorId: thread.vendor, title: `${message.senderName} replied`, message: text.slice(0, 180), type: 'MESSAGE',
    link: `/vendor/updates?tab=messages&thread=${thread._id}`,
    metadata: { threadId: String(thread._id) },
    idempotencyKey: `vendor.thread-reply.${thread._id}.${thread.messages.length}`,
  });
  return { message: serialize(thread.messages[thread.messages.length - 1]) };
}
