import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { requireExternalAuth,requireAccountType } from '../external/middleware/requireExternalAuth.js';
import { requireAdminAuth,requirePermission } from '../admin/middleware/requireAdminAuth.js';
import { NearbyRequest,NearbySearch,NearbyMetric } from './models.js';
import { readNearbyPolicy,writeNearbyPolicy } from './policy.js';
import { validateSearch,fail } from './rules.js';
import { nearbyMatches } from './matching.js';
import { createNearbyRequest,processNearbyRequest,requestProjection,cancelNearbyRequest,respondNearbyOpportunity } from './requests.js';
import { vendorNearbyPerformance,nearbyOverview } from './reporting.js';
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const validId=(req,res,next)=>mongoose.isValidObjectId(req.params.id)?next():res.status(400).json({error:'INVALID_ID'});
export const nearbyCustomerRoutes=Router(),nearbyVendorRoutes=Router(),nearbyAdminRoutes=Router();
nearbyCustomerRoutes.use(requireExternalAuth,requireAccountType('CUSTOMER'));
nearbyCustomerRoutes.use(rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
nearbyCustomerRoutes.get('/policy',h(async(req,res)=>res.json({ok:true,policy:await readNearbyPolicy()})));
nearbyCustomerRoutes.post('/search',h(async(req,res)=>{
  const policy=await readNearbyPolicy(),requirement=validateSearch(req.body,policy),matches=await nearbyMatches(requirement,policy);
  let results=matches.results;
  if(req.body.withinBudget===true&&requirement.budgetMax!=null)results=results.filter(r=>r.estimatedTotal<=requirement.budgetMax);
  if(req.body.minimumRating!=null) {const min=Number(req.body.minimumRating);if(!Number.isFinite(min)||min<0||min>5)fail('INVALID_MINIMUM_RATING');if(min>0)results=results.filter(r=>r.rating!=null&&r.rating>=min);}
  const sorts={nearby:(a,b)=>a.distanceKm-b.distanceKm,rated:(a,b)=>(b.rating??-1)-(a.rating??-1),budget:(a,b)=>a.estimatedTotal-b.estimatedTotal,premium:(a,b)=>b.estimatedTotal-a.estimatedTotal,responsive:(a,b)=>(b.responseRate??-1)-(a.responseRate??-1)};
  if(sorts[req.body.sort])results.sort(sorts[req.body.sort]);
  const search=await NearbySearch.create({customer:req.externalUser._id,services:results.map(r=>({service:r.serviceId,vendor:r.vendorId})),locality:requirement.location.locality||requirement.location.city,expiresAt:new Date(Date.now()+3600000)});
  res.json({ok:true,...matches,results,searchId:search._id,policy,requirement});
}));
nearbyCustomerRoutes.post('/interactions',h(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.body.searchId)||!Array.isArray(req.body.serviceIds)||req.body.serviceIds.length>100||!['LIST_IMPRESSION','MAP_IMPRESSION','PROFILE_VIEW'].includes(req.body.kind))fail('INVALID_INTERACTION');
  const search=await NearbySearch.findOne({_id:req.body.searchId,customer:req.externalUser._id,expiresAt:{$gt:new Date()}}).lean();if(!search)fail('SEARCH_EXPIRED',404);
  const selected=search.services.filter(s=>req.body.serviceIds.map(String).includes(String(s.service)));
  if(new Set(req.body.serviceIds.map(String)).size!==selected.length)fail('SERVICE_NOT_IN_SEARCH');
  for(const s of selected)await NearbyMetric.updateOne({key:`${search._id}:${s.service}:${req.body.kind}`},{$setOnInsert:{customer:req.externalUser._id,vendor:s.vendor,service:s.service,kind:req.body.kind,locality:search.locality}},{upsert:true});
  res.json({ok:true,recorded:selected.length});
}));
nearbyCustomerRoutes.post('/requests',h(async(req,res)=>{const row=await createNearbyRequest(req.externalUser._id,req.body);res.status(202).json({ok:true,request:await requestProjection(row)});}));
nearbyCustomerRoutes.get('/requests',h(async(req,res)=>{const rows=await NearbyRequest.find({customer:req.externalUser._id}).sort({createdAt:-1}).limit(50);res.json({ok:true,requests:await Promise.all(rows.map(requestProjection))});}));
nearbyCustomerRoutes.get('/requests/:id',validId,h(async(req,res)=>{const row=await NearbyRequest.findOne({_id:req.params.id,customer:req.externalUser._id});if(!row)fail('REQUEST_NOT_FOUND',404);res.json({ok:true,request:await requestProjection(row)});}));
nearbyCustomerRoutes.post('/requests/:id/cancel',validId,h(async(req,res)=>res.json({ok:true,request:await requestProjection(await cancelNearbyRequest(req.params.id,req.externalUser._id))})));
nearbyVendorRoutes.use(requireExternalAuth,requireAccountType('VENDOR'));
nearbyVendorRoutes.use((req,res,next)=>req.externalUser.vendorOrganization?next():res.status(403).json({error:'VENDOR_ORGANIZATION_REQUIRED'}));
nearbyVendorRoutes.get('/performance',h(async(req,res)=>{const months=Number(req.query.months||6);if(![1,6].includes(months))fail('REPORT_PERIOD_MUST_BE_1_OR_6_MONTHS');res.json({ok:true,report:await vendorNearbyPerformance(req.externalUser.vendorOrganization,months)});}));
nearbyVendorRoutes.post('/opportunities/:id/respond',validId,h(async(req,res)=>{await respondNearbyOpportunity(req.params.id,req.externalUser.vendorOrganization,req.body.response);res.json({ok:true,bookingConfirmed:false});}));
nearbyAdminRoutes.use(requireAdminAuth);
nearbyAdminRoutes.get('/policy',requirePermission('settings.read'),h(async(req,res)=>res.json({ok:true,policy:await readNearbyPolicy()})));
nearbyAdminRoutes.put('/policy',requirePermission('settings.update'),h(async(req,res)=>res.json({ok:true,policy:await writeNearbyPolicy(req.body,req.admin._id)})));
nearbyAdminRoutes.get('/overview',requirePermission('vendors.read'),h(async(req,res)=>res.json({ok:true,...await nearbyOverview()})));
nearbyAdminRoutes.post('/search',requirePermission('vendors.read'),h(async(req,res)=>{const policy=await readNearbyPolicy();res.json({ok:true,...await nearbyMatches(validateSearch(req.body,policy),policy)});}));
nearbyAdminRoutes.post('/requests/:id/advance',validId,requirePermission('settings.update'),h(async(req,res)=>{
  if(!String(req.body.reason||'').trim())fail('OVERRIDE_REASON_REQUIRED');
  const row=await NearbyRequest.findOneAndUpdate({_id:req.params.id,status:{$in:['OPEN','EXHAUSTED']},expiresAt:{$gt:new Date()},$or:[{leaseUntil:null},{leaseUntil:{$lte:new Date()}}]},{$set:{status:'OPEN',nextBatchAt:new Date()},$push:{audit:{action:'ADMIN_ADVANCE',actor:String(req.admin._id),at:new Date(),reason:String(req.body.reason).slice(0,500)}}},{new:true});
  if(!row)fail('REQUEST_BUSY_OR_CLOSED',409);
  res.json({ok:true,result:await processNearbyRequest(row._id)});
}));
nearbyAdminRoutes.post('/requests/:id/retry',validId,requirePermission('settings.update'),h(async(req,res)=>{
  if(!String(req.body.reason||'').trim())fail('OVERRIDE_REASON_REQUIRED');
  const row=await NearbyRequest.findOneAndUpdate({_id:req.params.id,status:{$in:['OPEN','EXHAUSTED']},expiresAt:{$gt:new Date()},$or:[{leaseUntil:null},{leaseUntil:{$lte:new Date()}}]},{$set:{status:'OPEN',nextBatchAt:new Date(),'candidates.$[c].state':'RETRY','candidates.$[c].attempts':0},$push:{audit:{action:'ADMIN_RETRY',actor:String(req.admin._id),at:new Date(),reason:String(req.body.reason).slice(0,500)}}},{arrayFilters:[{'c.state':'DEAD_LETTER'}],new:true});
  if(!row)fail('REQUEST_BUSY_OR_CLOSED',409);res.json({ok:true});
}));
