import { OperatingLocation } from '../external/models/OperatingLocation.js';
import { VendorService } from '../external/models/VendorService.js';
import { VendorCapability } from '../external/models/VendorCapability.js';
import { ServiceCoverage } from '../external/models/ServiceCoverage.js';
import { VendorReview } from '../external/models/VendorReview.js';
import { Opportunity } from '../external/models/Opportunity.js';
import { CoreBooking } from '../admin/models/CoreBooking.js';
import { evaluateVendorActivation } from '../external/services/vendorActivation.service.js';
import { serviceMatchingEligible } from '../common/vendorReadiness.js';
import { checkTrueAvailability } from '../external/services/availability.service.js';
import { calculateValidatedTotalCost } from '../external/services/totalCost.service.js';
import { normalizeCategory } from '../customer/services/planCatalog.js';
import { coordinates, geoPoint, straightLineKm, coverageAllows, rankCandidate, fail } from './rules.js';

export async function nearbyMatches(requirement, policy) {
  const category=normalizeCategory(requirement.category); if(!category) fail('UNKNOWN_SERVICE_CATEGORY');
  const origin=requirement.location.coordinates;
  const bases=await OperatingLocation.find({operatingStatus:'ACTIVE',geoPoint:{$nearSphere:{$geometry:geoPoint(origin),$maxDistance:requirement.radiusKm*1000}}}).limit(2000).lean();
  const vendorIds=[...new Set(bases.map(b=>String(b.vendor)))];
  const services=await VendorService.find({vendor:{$in:vendorIds},status:'ACTIVE'}).populate('vendor').lean();
  const results=[],exclusions={category:0,coverage:0,activation:0,availability:0,specialization:0,capacity:0};
  const readiness=new Map();
  for(const service of services) {
    if(normalizeCategory(service.category)!==category) {exclusions.category++;continue;}
    const vendor=service.vendor; if(!vendor) continue;
    const capability=await VendorCapability.findOne({vendor:vendor._id,vendorService:service._id}).lean();
    if(requirement.specialization && ![service.name,...(capability?.styles||[]),...(service.deliverables||[])].some(s=>String(s).toLowerCase().includes(requirement.specialization.toLowerCase()))) {exclusions.specialization++;continue;}
    const guestLimit=Number(capability?.categoryAttributes?.maxGuests || capability?.categoryAttributes?.guestCapacity || 0);
    if(guestLimit>0 && requirement.guestCount>guestLimit) {exclusions.capacity++;continue;}
    const coverages=await ServiceCoverage.find({vendor:vendor._id,vendorService:service._id}).lean();
    const eligibleBases=bases.filter(b=>String(b.vendor)===String(vendor._id)).map(base=>({base,distance:straightLineKm(origin,coordinates(base.coordinates))})).filter(row=>coverages.some(c=>coverageAllows(c,row.base,requirement.location,row.distance))).sort((a,b)=>a.distance-b.distance);
    if(!eligibleBases.length) {exclusions.coverage++;continue;}
    if(!readiness.has(String(vendor._id))) readiness.set(String(vendor._id),await evaluateVendorActivation(vendor._id));
    if(!serviceMatchingEligible(readiness.get(String(vendor._id)),service._id)) {exclusions.activation++;continue;}
    const availability=await checkTrueAvailability({vendorId:vendor._id,vendorServiceId:service._id,date:requirement.date,startTime:requirement.startTime,endTime:requirement.endTime,serviceLocation:requirement.location});
    if(!availability.feasible) {exclusions.availability++;continue;}
    const hour=t=>Number(t.slice(0,2))+Number(t.slice(3))/60;
    const cost=await calculateValidatedTotalCost({vendorId:vendor._id,vendorServiceId:service._id,serviceLocation:requirement.location,guestCount:requirement.guestCount,durationHours:hour(requirement.endTime)-hour(requirement.startTime)});
    const verifiedBookings=await CoreBooking.find({vendorId:vendor._id,paymentStatus:'PAYMENT_VERIFIED',executionStatus:'COMPLETION_VERIFIED'}).select('_id').lean();
    const reviews=await VendorReview.find({vendor:vendor._id,isVerified:true,source:'STARVNT',status:'PUBLISHED',booking:{$in:verifiedBookings.map(b=>b._id)}}).select('rating').lean();
    const average=reviews.length ? reviews.reduce((n,r)=>n+r.rating,0)/reviews.length : null;
    const since=new Date(Date.now()-180*86400000);
    const [opportunities,responses]=await Promise.all([Opportunity.countDocuments({vendor:vendor._id,createdAt:{$gte:since}}),Opportunity.countDocuments({vendor:vendor._id,createdAt:{$gte:since},slaResponse:{$ne:'PENDING'}})]);
    const {base,distance}=eligibleBases[0];
    const ranking=rankCandidate({verifiedRating:average,reviewCount:reviews.length,estimatedTotal:cost.validatedTotalCost,budgetMax:requirement.budgetMax,distanceKm:distance,radiusKm:requirement.radiusKm,responses,opportunities},policy.weights);
    results.push({vendorId:String(vendor._id),serviceId:String(service._id),businessName:vendor.businessName,serviceName:service.name,category:service.category,description:service.description,locality:base.publicVisibility==='EXACT'?base.locality:'',city:base.city,coordinates:base.publicVisibility==='EXACT'?coordinates(base.coordinates):null,locationDisclosure:base.publicVisibility==='EXACT'?'PUBLIC_EXACT':'CITY_ONLY',distanceKm:Math.round(distance*10)/10,distanceBasis:'STRAIGHT_LINE',roadDistanceKm:null,estimatedTotal:cost.validatedTotalCost,costStatus:'ESTIMATE_REQUIRES_QUOTATION',rating:average,reviewCount:reviews.length,verified:true,available:true,responseRate:opportunities?Math.round(responses/opportunities*100):null,score:ranking.score,rankingFactors:ranking.factors,sponsored:false,budgetCompatible:requirement.budgetMax==null?null:cost.validatedTotalCost<=requirement.budgetMax});
  }
  results.sort((a,b)=>b.score-a.score || a.serviceId.localeCompare(b.serviceId));
  return {results,exclusions,evaluated:services.length,radiusKm:requirement.radiusKm,locationBasis:'EVENT_LOCATION',distanceBasis:'STRAIGHT_LINE',candidateScanLimit:2000,scanLimitReached:bases.length===2000};
}
