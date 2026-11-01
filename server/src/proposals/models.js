import mongoose from 'mongoose';
import { externalConn } from '../db/index.js';

const { Schema } = mongoose;
// One Core-owned dossier per event. The revision guard serializes all writers.
const dossier = new Schema({
  event: { type: Schema.Types.ObjectId, required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, required: true, index: true },
  revision: { type: Number, default: 0 },
  draft: { type: Schema.Types.Mixed, default: {} },
  agreements: { type: [Schema.Types.Mixed], default: [] },
  commercial: { type: Schema.Types.Mixed, default: null },
  versions: { type: [Schema.Types.Mixed], default: [] },
  changes: { type: [Schema.Types.Mixed], default: [] },
  audit: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true, collection: 'core_proposal_dossiers', minimize: false });
export const ProposalDossier = externalConn.model('ProposalDossier', dossier);

const document = new Schema({
  dossier: { type: Schema.Types.ObjectId, required: true },
  versionId: { type: String, required: true, unique: true },
  sha256: { type: String, required: true },
  bytes: { type: Buffer, required: true, select: false },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'core_proposal_documents' });
export const ProposalDocument = externalConn.model('ProposalDocument', document);

const access = new Schema({
  dossier: { type: Schema.Types.ObjectId, required: true, index: true },
  versionId: { type: String, required: true },
  customer: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, default: 'DOCUMENT_DOWNLOADED' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'core_proposal_document_access' });
export const ProposalDocumentAccess = externalConn.model('ProposalDocumentAccess', access);
