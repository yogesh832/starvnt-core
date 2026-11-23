import { NearbyRequest, NearbyMetric } from './models.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { Quote } from '../external/models/Quote.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { OperatingLocation } from '../external/models/OperatingLocation.js';
import { VendorService } from '../external/models/VendorService.js';
import { evaluateVendorActivation } from '../external/services/vendorActivation.service.js';
import { serviceMatchingEligible } from '../common/vendorReadiness.js';

export async function vendorNearbyPerformance(vendor,months=6) {
  const from=new Date();from.setUTCMonth(from.getUTCMonth()-months);
  const [requests,metrics,opportunities]=await Promise.all([NearbyRequest.find({'candidates.vendor':vendor,createdAt:{$gte:from}}).lean(),NearbyMetric.aggregate([{$match:{vendor,createdAt:{$gte:from}}},{$group:{_id:'$kind',count:{$sum:1}}}]),Opportunity.find({vendor,nearbyRequest:{$ne:null},createdAt:{$gte:from}}).lean()]);
  const ids=opportunities.map(o=>o._id),quotes=await Quote.find({vendor,opportunity:{$in:ids}}).select('_id status commercialSnapshot').lean();
  const bookings=await CoreBooking.find({vendorId:vendor,opportunityId:{$in:ids.map(String)},bookingStatus:'CONFIRMED',paymentStatus:'PAYMENT_VERIFIED'}).select('totalAmount executionStatus').lean();
  const candidates=requests.flatMap(r=>r.candidates.filter(c=>String(c.vendor)===String(vendor))),responses=opportunities.filter(o=>o.slaResponse!=='PENDING'||o.status==='RESPONDED');
  const times=responses.map(o=>o.slaResponseTimeMs).filter(n=>Number.isFinite(n)&&n>=0);
  return {scope:'NEARBY_DISCOVERY_ONLY',period:{from,to:new Date(),months},metrics:Object.fromEntries(metrics.map(m=>[m._id,m.count])),eligibilityCount:candidates.length,matchingRequests:requests.length,notificationsDelivered:candidates.filter(c=>c.deliveredAt).length,enquiries:opportunities.length,responses:responses.length,responseRate:opportunities.length?Math.round(responses.length/opportunities.length*100):null,averageResponseTimeMs:times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null,quotations:quotes.filter(q=>q.commercialSnapshot?.version||['SUBMITTED','APPROVED'].includes(q.status)).length,confirmedBookings:bookings.length,attributedBookingValue:bookings.reduce((n,b)=>n+Number(b.totalAmount||0),0),deadLetters:candidates.filter(c=>c.state==='DEAD_LETTER').length};
}
export async function nearbyOverview() {
  const from=new Date(Date.now()-180*86400000);
  const [requests,bases,services]=await Promise.all([NearbyRequest.find({createdAt:{$gte:from}}).sort({createdAt:-1}).limit(500).lean(),OperatingLocation.find({operatingStatus:'ACTIVE'}).select('vendor locality city geoPoint coordinates publicVisibility').lean(),VendorService.find({status:'ACTIVE'}).select('vendor category').lean()]);
  const readiness=new Map(); const supply=new Map();
  for(const service of services) {
    const id=String(service.vendor); if(!readiness.has(id))readiness.set(id,await evaluateVendorActivation(service.vendor));
    if(!serviceMatchingEligible(readiness.get(id),service._id))continue;
    for(const base of bases.filter(b=>String(b.vendor)===id&&b.geoPoint?.coordinates?.length===2)) {
      const locality=base.locality||base.city||'Unknown';const key=`${locality}:${service.category}`;
      if(!supply.has(key))supply.set(key,{locality,city:base.city,category:service.category,vendors:new Set()});supply.get(key).vendors.add(id);
    }
  }
  const demand=new Map();
  for(const row of requests) {const locality=row.requirement.location.locality||row.requirement.location.city||'Unknown',key=`${locality}:${row.requirement.category}`; if(!demand.has(key))demand.set(key,{locality,category:row.requirement.category,requests:0,matched:0,delivered:0,responses:0});const d=demand.get(key);d.requests++;d.matched+=row.candidates.length;d.delivered+=row.candidates.filter(c=>c.deliveredAt).length;}
  return {period:{from,to:new Date()},requestLimit:500,requestLimitReached:requests.length===500,supply:[...supply.values()].map(s=>({...s,vendors:s.vendors.size,definition:'Activated vendors with indexed operating bases; date-specific capacity is checked during matching'})),demand:[...demand.values()],locationsMissingCoordinates:bases.filter(b=>!b.geoPoint?.coordinates?.length).length,requests:requests.map(r=>({id:r._id,requirement:r.requirement,status:r.status,createdAt:r.createdAt,expiresAt:r.expiresAt,matched:r.candidates.length,delivered:r.candidates.filter(c=>c.deliveredAt).length,deadLetters:r.candidates.filter(c=>c.state==='DEAD_LETTER').length,failure:r.failure,audit:r.audit.slice(-5)}))};
}
