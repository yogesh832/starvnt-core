import mongoose from 'mongoose';
import { externalConn, adminConn } from '../db/index.js';
const { Schema } = mongoose;
const policySchema = new Schema({ _id:{type:String,default:'nearby'}, policy:Schema.Types.Mixed, revision:{type:Number,default:1}, history:[{actor:String,at:Date,reason:String,before:Schema.Types.Mixed,after:Schema.Types.Mixed}] },{timestamps:true});
export const NearbyPolicy = adminConn.model('NearbyPolicy',policySchema);
const requestSchema = new Schema({
  customer:{type:Schema.Types.ObjectId,ref:'ExternalUser',required:true,index:true}, customerEvent:{type:Schema.Types.ObjectId,ref:'CustomerEvent',default:null},
  requestKey:{type:String,required:true}, inputHash:{type:String,required:true}, requirement:{type:Schema.Types.Mixed,required:true}, policy:Schema.Types.Mixed,
  candidates:[{vendor:{type:Schema.Types.ObjectId,ref:'VendorOrganization'},service:{type:Schema.Types.ObjectId,ref:'VendorService'},name:String,businessName:String,distanceKm:Number,estimatedTotal:Number,score:Number,opportunity:Schema.Types.ObjectId, state:{type:String,default:'PENDING'}, attempts:{type:Number,default:0}, deliveredAt:Date, responseAt:Date,response:String,lastError:String}],
  status:{type:String,enum:['MATCHING','OPEN','EXHAUSTED','EXPIRED','CANCELLED','FAILED'],default:'MATCHING',index:true},
  expiresAt:Date,nextBatchAt:{type:Date,index:true},leaseUntil:Date,leaseToken:String,
  audit:[{action:String,actor:String,at:Date,reason:String}], failure:String,
},{timestamps:true});
requestSchema.index({customer:1,requestKey:1},{unique:true});
requestSchema.index({status:1,nextBatchAt:1,leaseUntil:1});
export const NearbyRequest = externalConn.model('NearbyRequest',requestSchema);
const metricSchema=new Schema({key:{type:String,required:true,unique:true},customer:Schema.Types.ObjectId,vendor:{type:Schema.Types.ObjectId,index:true},service:Schema.Types.ObjectId,kind:{type:String,enum:['LIST_IMPRESSION','MAP_IMPRESSION','PROFILE_VIEW'],required:true},locality:String},{timestamps:true});
export const NearbyMetric=externalConn.model('NearbyMetric',metricSchema);
const searchSchema=new Schema({customer:{type:Schema.Types.ObjectId,required:true},services:[{service:Schema.Types.ObjectId,vendor:Schema.Types.ObjectId}],locality:String,expiresAt:{type:Date,required:true}},{timestamps:true});
searchSchema.index({expiresAt:1},{expireAfterSeconds:0});
export const NearbySearch=externalConn.model('NearbySearch',searchSchema);
