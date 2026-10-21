import mongoose from 'mongoose';
import { adminConn } from '../../db/index.js';

const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    updatedBy: { type: String, default: 'SYSTEM' },
  },
  { timestamps: true }
);

export const PlatformSetting = adminConn.model('PlatformSetting', platformSettingSchema);
