import * as ops from '../services/ops.service.js';
import * as commerce from '../services/commerce.service.js';

export const verifyPayment = async (req, res) => res.json(await ops.verifyPaymentManually(req.params.id, req.body));
export const message = async (req, res) => res.status(201).json(await ops.postOpsMessage(req.params.id, req.body));
export const execution = async (req, res) => res.json(await ops.updateExecution(req.params.id, req.body));
export const complete = async (req, res) => res.json(await ops.completeEvent(req.params.id, req.body));
export const simulateVendorCancellation = async (req, res) => res.json(await ops.simulateVendorCancellation(req.body));
export const reset = async () => ops.resetRefused();

export const razorpayWebhook = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  res.json(await commerce.handleRazorpayWebhook(raw, req.headers));
};
