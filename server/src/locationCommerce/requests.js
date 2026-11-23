import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { NearbyRequest } from './models.js';
import { readNearbyPolicy } from './policy.js';
import { validateSearch, fail } from './rules.js';
import { nearbyMatches } from './matching.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { Quote } from '../external/models/Quote.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { CustomerEvent } from '../customer/models/index.js';
import { notifyCustomer, notifyVendor } from '../notifications/notification.service.js';
import { checkTrueAvailability } from '../external/services/availability.service.js';

const keyOf=(request,service)=>`nearby:${request}:${service}`;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function createNearbyRequest(customer,body) {
  if(!/^[\w:-]{8,100}$/.test(body.idempotencyKey||'')) fail('IDEMPOTENCY_KEY_REQUIRED');
  const inputHash=hash({requirement:body.requirement,eventId:body.eventId||null});
  let row=await NearbyRequest.findOne({customer,requestKey:body.idempotencyKey});
  if(row) {if(row.inputHash!==inputHash) fail('REQUEST_KEY_REUSED_FOR_DIFFERENT_SCOPE',409);return row;}
  if(body.eventId && (!mongoose.isValidObjectId(body.eventId)||!await CustomerEvent.exists({_id:body.eventId,customer}))) fail('EVENT_NOT_FOUND',404);
  const policy=await readNearbyPolicy(),requirement=validateSearch(body.requirement,policy);
  if(requirement.date < new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})) fail('EVENT_DATE_IN_PAST');
  const matches=await nearbyMatches(requirement,policy);
  // One vendor receives one request even if several services qualify.
  const seen=new Set(),candidates=matches.results.filter(r=>!seen.has(r.vendorId)&&seen.add(r.vendorId)).map(r=>({vendor:r.vendorId,service:r.serviceId,name:r.serviceName,businessName:r.businessName,distanceKm:r.distanceKm,estimatedTotal:r.estimatedTotal,score:r.score,state:'PENDING'}));
  try {row=await NearbyRequest.create({customer,customerEvent:body.eventId||null,requestKey:body.idempotencyKey,inputHash,requirement,policy,candidates,status:candidates.length?'OPEN':'EXHAUSTED',expiresAt:new Date(Date.now()+policy.expiryHours*3600000),nextBatchAt:new Date(),audit:[{action:'REQUEST_SUBMITTED',actor:String(customer),at:new Date(),reason:`${candidates.length} eligible vendors`} ]});}
  catch(err) {if(err.code!==11000)throw err;row=await NearbyRequest.findOne({customer,requestKey:body.idempotencyKey});if(row.inputHash!==inputHash)fail('REQUEST_KEY_REUSED_FOR_DIFFERENT_SCOPE',409);}
  return row;
}
export async function processNearbyRequest(id,{now=new Date()}={}) {
  const token=crypto.randomUUID();
  const row=await NearbyRequest.findOneAndUpdate({_id:id,status:{$in:['OPEN','EXHAUSTED']},nextBatchAt:{$lte:now},$or:[{leaseUntil:{$exists:false}},{leaseUntil:null},{leaseUntil:{$lte:now}}]},{$set:{leaseToken:token,leaseUntil:new Date(now.getTime()+300000)}},{new:true});
  if(!row)return {claimed:false};
  const locked={_id:row._id,leaseToken:token};
  try {
    if(row.expiresAt<=now) {
      await Opportunity.updateMany({nearbyRequest:row._id,status:{$in:['NEW','VIEWED']}},{$set:{status:'EXPIRED',action:'Request expired'}});
      await NearbyRequest.updateOne(locked,{$set:{status:'EXPIRED',nextBatchAt:null},$push:{audit:{action:'REQUEST_EXPIRED',actor:'CORE',at:now}}});return {expired:true};
    }
    const existing=await Opportunity.find({nearbyRequest:row._id}).select('status slaResponse').lean();
    const count=existing.filter(o=>o.slaResponse==='CAN_EXECUTE'||o.status==='RESPONDED').length;
    if(count>=row.policy.responseTarget) {await NearbyRequest.updateOne(locked,{$set:{nextBatchAt:row.expiresAt}});return {satisfied:true};}
    const selectable=row.candidates.filter(c=>['PENDING','RETRY'].includes(c.state)).slice(0,row.policy.batchSize);
    if(!selectable.length) {await NearbyRequest.updateOne(locked,{$set:{status:'EXHAUSTED',nextBatchAt:row.expiresAt}});return {exhausted:true};}
    const fresh=await nearbyMatches(row.requirement,row.policy),eligible=new Set(fresh.results.map(c=>c.serviceId));
    for(const c of selectable) {
      const query={...locked,'candidates._id':c._id};
      if(!eligible.has(String(c.service))) {await NearbyRequest.updateOne(query,{$set:{'candidates.$.state':'UNAVAILABLE','candidates.$.lastError':'Current eligibility or availability changed'}});continue;}
      try {
        const deadline=new Date(Math.min(row.expiresAt.getTime(),now.getTime()+row.policy.responseWindowMinutes*60000));
        const opportunity=await Opportunity.findOneAndUpdate({crmSourceKey:keyOf(row._id,c.service)},{$setOnInsert:{vendor:c.vendor,customer:row.customer,vendorService:c.service,customerEvent:row.customerEvent,nearbyRequest:row._id,serviceName:c.name,eventDate:row.requirement.date,serviceLocation:row.requirement.location,guestCount:row.requirement.guestCount,matchingDistanceKm:c.distanceKm,budgetRange:{min:row.requirement.budgetMin,max:row.requirement.budgetMax},requiredCapability:row.requirement.specialization||row.requirement.eventType||'Event service',slaExpiresAt:deadline,status:'NEW'}},{upsert:true,new:true,runValidators:true});
        const notification=await notifyVendor({vendorId:c.vendor,title:'New nearby service request',message:`${c.name} · ${row.requirement.location.locality||row.requirement.location.city||'Event locality'} · ${c.distanceKm} km straight-line · ${row.requirement.date}`,type:'ENQUIRY',link:`/vendor/enquiries?record=${opportunity._id}`,idempotencyKey:`nearby.notification.${opportunity._id}`,metadata:{opportunityId:String(opportunity._id),nearbyRequestId:String(row._id)}});
        await NearbyRequest.updateOne(query,{$set:{'candidates.$.state':notification.skipped?'MUTED':'DELIVERED','candidates.$.opportunity':opportunity._id,'candidates.$.deliveredAt':notification.skipped?null:now,'candidates.$.lastError':''},$inc:{'candidates.$.attempts':1}});
      } catch(err) {
        await NearbyRequest.updateOne(query,{$set:{'candidates.$.state':c.attempts>=4?'DEAD_LETTER':'RETRY','candidates.$.lastError':String(err.code||'DELIVERY_FAILED').slice(0,120)},$inc:{'candidates.$.attempts':1}});
      }
      await NearbyRequest.updateOne(locked,{$set:{leaseUntil:new Date(Date.now()+300000)}});
    }
    await NearbyRequest.updateOne(locked,{$set:{nextBatchAt:new Date(now.getTime()+row.policy.responseWindowMinutes*60000)},$push:{audit:{action:'NOTIFICATION_BATCH_PROCESSED',actor:'CORE',at:now,reason:`${selectable.length} candidate attempts`}}});
    await notifyCustomer({customerId:row.customer,eventId:row.customerEvent,title:'Nearby vendor search updated',body:'Your request is being sent to eligible vendors. A response is interest, not a booking.',type:'nearby_matching',actionUrl:`/customer/nearby?request=${row._id}`,idempotencyKey:`nearby.batch.${row._id}.${row.candidates.filter(c=>c.state!=='PENDING').length}`});
    return {claimed:true};
  } catch(err) {await NearbyRequest.updateOne(locked,{$set:{failure:String(err.code||'BATCH_PROCESSING_FAILED'),nextBatchAt:new Date(now.getTime()+60000)}});throw err;}
  finally {await NearbyRequest.updateOne(locked,{$unset:{leaseToken:1,leaseUntil:1}});}
}
export async function runNearbyBatch() {
  const due=await NearbyRequest.find({status:{$in:['OPEN','EXHAUSTED']},nextBatchAt:{$lte:new Date()}}).sort({nextBatchAt:1}).limit(10).select('_id').lean();
  for(const row of due)await processNearbyRequest(row._id);
  return {processed:due.length};
}
export async function requestProjection(row) {
  const [opportunities,quotes,bookings]=await Promise.all([Opportunity.find({nearbyRequest:row._id}).select('_id status slaResponse').lean(),Quote.find({opportunity:{$in:row.candidates.map(c=>c.opportunity).filter(Boolean)},status:{$in:['SUBMITTED','APPROVED']}}).select('_id vendor serviceName pricingBreakdown validUntil status').lean(),CoreBooking.find({opportunityId:{$in:row.candidates.map(c=>String(c.opportunity)).filter(s=>s!=='undefined')}}).select('_id bookingReference bookingStatus paymentStatus').lean()]);
  const counts={matched:row.candidates.length,notified:row.candidates.filter(c=>c.deliveredAt).length,responded:opportunities.filter(o=>o.slaResponse==='CAN_EXECUTE'||o.status==='RESPONDED').length,declined:opportunities.filter(o=>o.status==='DECLINED').length,quotations:quotes.length,confirmed:bookings.filter(b=>b.bookingStatus==='CONFIRMED'&&b.paymentStatus==='PAYMENT_VERIFIED').length};
  const stage=counts.confirmed?'BOOKING_CONFIRMED':bookings.length?'PAYMENT_PENDING':quotes.some(q=>q.status==='APPROVED')?'VENDOR_SELECTED':counts.quotations?'QUOTATIONS_RECEIVED':counts.responded?'RESPONSES_RECEIVED':counts.notified?'VENDORS_NOTIFIED':'MATCHING_COMPLETED';
  return {id:String(row._id),eventId:row.customerEvent,status:row.status,stage:['CANCELLED','EXPIRED'].includes(row.status)?row.status:stage,requirement:row.requirement,counts,expiresAt:row.expiresAt,createdAt:row.createdAt,quotes:quotes.map(q=>({...q,vendorName:row.candidates.find(c=>String(c.vendor)===String(q.vendor))?.businessName||'Vendor'})),bookings,audit:row.audit};
}
export async function cancelNearbyRequest(id,customer) {
  const row=await NearbyRequest.findOne({_id:id,customer});if(!row)fail('REQUEST_NOT_FOUND',404);
  if(row.status==='CANCELLED')return row;
  if(await CoreBooking.exists({opportunityId:{$in:row.candidates.map(c=>String(c.opportunity)).filter(s=>s!=='undefined')},bookingStatus:'CONFIRMED',paymentStatus:'PAYMENT_VERIFIED'}))fail('USE_BOOKING_CANCELLATION_WORKFLOW',409);
  const changed=await NearbyRequest.findOneAndUpdate({_id:id,customer,status:{$in:['OPEN','EXHAUSTED']},$or:[{leaseUntil:{$exists:false}},{leaseUntil:null},{leaseUntil:{$lte:new Date()}}]},{$set:{status:'CANCELLED',nextBatchAt:null},$push:{audit:{action:'CUSTOMER_CANCELLED',actor:String(customer),at:new Date()}}},{new:true});
  if(!changed)fail('REQUEST_BUSY_OR_CLOSED_RETRY',409);
  await Opportunity.updateMany({nearbyRequest:id,status:{$in:['NEW','VIEWED','RESPONDED']}},{$set:{status:'EXPIRED',slaExpiresAt:new Date(),action:'Customer cancelled request'}});
  return changed;
}
export async function respondNearbyOpportunity(id,vendor,response) {
  if(!['ACCEPT','DECLINE'].includes(response))fail('INVALID_RESPONSE');
  const opp=await Opportunity.findOne({_id:id,vendor});if(!opp?.nearbyRequest)fail('NEARBY_OPPORTUNITY_NOT_FOUND',404);
  const row=await NearbyRequest.findOne({_id:opp.nearbyRequest,status:{$in:['OPEN','EXHAUSTED']},expiresAt:{$gt:new Date()}});
  if(!row||!['NEW','VIEWED','RESPONDED'].includes(opp.status)||!opp.slaExpiresAt||opp.slaExpiresAt<=new Date())fail('RESPONSE_DEADLINE_PASSED',409);
  if(response==='ACCEPT') {const a=await checkTrueAvailability({vendorId:vendor,vendorServiceId:opp.vendorService,date:row.requirement.date,startTime:row.requirement.startTime,endTime:row.requirement.endTime,serviceLocation:row.requirement.location});if(!a.feasible)fail('VENDOR_UNAVAILABLE',409);}
  if(opp.slaResponse!=='PENDING') {if(opp.slaResponse===(response==='ACCEPT'?'CAN_EXECUTE':'NOT_AVAILABLE'))return opp;fail('RESPONSE_ALREADY_RECORDED',409);}
  const result=await Opportunity.findOneAndUpdate({_id:id,vendor,slaResponse:'PENDING',status:{$in:['NEW','VIEWED']},slaExpiresAt:{$gt:new Date()}},{$set:{slaResponse:response==='ACCEPT'?'CAN_EXECUTE':'NOT_AVAILABLE',slaResponseTimeMs:Date.now()-opp.createdAt.getTime(),status:response==='DECLINE'?'DECLINED':'VIEWED',action:response==='ACCEPT'?'Interested — submit quotation':'Declined'}},{new:true});
  if(!result)fail('RESPONSE_CHANGED_RELOAD',409);
  await notifyCustomer({customerId:opp.customer,eventId:opp.customerEvent,type:'nearby_response',title:'Vendor response received',body:response==='ACCEPT'?'A vendor is interested. Compare a formal quotation before selecting.':'A vendor declined; other eligible vendors can still respond.',actionUrl:`/customer/nearby?request=${row._id}`,idempotencyKey:`nearby.response.${opp._id}`});
  return result;
}
