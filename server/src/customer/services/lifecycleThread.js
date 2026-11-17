import { VendorMessageThread } from '../../external/models/VendorMessageThread.js';
import { quoteCreationHash } from '../../common/quoteCreationCommand.js';

// Opt-in durable path for Core events. Legacy chat callers keep their contract.
export async function recordLifecycleThreadAtomically({ thread, contextFilter, logicalKey, sender, senderName, text, metadata, type, now }) {
  const identity = { vendor: String(thread.vendor?._id || thread.vendor), customer: String(thread.customer?._id || thread.customer), context: Object.fromEntries(Object.entries(contextFilter).map(([key, value]) => [key, String(value?._id || value)])) };
  const contextKey = quoteCreationHash(identity);
  if (thread.isNew) {
    const fields = thread.toObject(); delete fields._id; delete fields.__v;
    fields.lifecycleContextKey = contextKey;
    try { thread = await VendorMessageThread.findOneAndUpdate({ vendor: identity.vendor, lifecycleContextKey: contextKey }, { $setOnInsert: fields }, { upsert: true, new: true, runValidators: true }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      thread = await VendorMessageThread.findOne({ vendor: identity.vendor, lifecycleContextKey: contextKey });
    }
  } else {
    try {
      thread = await VendorMessageThread.findOneAndUpdate({ _id: thread._id, vendor: identity.vendor, $or: [{ lifecycleContextKey: null }, { lifecycleContextKey: contextKey }] }, { $set: { lifecycleContextKey: contextKey } }, { new: true });
    } catch (error) {
      if (error.code === 11000) throw new Error('LIFECYCLE_CONTEXT_AMBIGUOUS');
      throw error;
    }
  }
  if (!thread || String(thread.customer?._id || thread.customer) !== identity.customer || Object.entries(identity.context).some(([key, value]) => String(thread[key]?._id || thread[key]) !== value)) throw new Error('LIFECYCLE_CONTEXT_CHANGED');
  if (thread.status === 'BLOCKED') throw new Error('LIFECYCLE_THREAD_BLOCKED');
  const updated = await VendorMessageThread.findOneAndUpdate({ _id: thread._id, status: { $ne: 'BLOCKED' }, 'messages.metadata.eventKey': { $ne: logicalKey } }, {
    $set: { lastMessageText: text, lastMessageAt: now, status: 'ACTIVE' },
    $inc: sender === 'CLIENT' ? { unreadVendorCount: 1 } : { unreadClientCount: 1 },
    $push: { messages: { sender: sender === 'VENDOR' ? 'VENDOR' : sender === 'CLIENT' ? 'CLIENT' : 'SYSTEM', senderName: senderName || 'STARVNT Core', text, isRead: false, createdAt: now, metadata: { ...(metadata || { type }), eventKey: logicalKey } } },
  }, { new: true, runValidators: true });
  const result = updated || await VendorMessageThread.findById(thread._id);
  if (!result || result.status === 'BLOCKED') throw new Error('LIFECYCLE_THREAD_BLOCKED');
  return result;
}
