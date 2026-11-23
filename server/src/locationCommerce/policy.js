import { NearbyPolicy } from './models.js';
import { defaultNearbyPolicy, validatePolicy, fail } from './rules.js';
export async function readNearbyPolicy() { const row=await NearbyPolicy.findById('nearby').lean(); return { ...validatePolicy(row?.policy || defaultNearbyPolicy), revision:row?.revision || 0 }; }
export async function writeNearbyPolicy(body,actor) {
  if(!String(body.reason||'').trim()) fail('CHANGE_REASON_REQUIRED');
  const policy=validatePolicy(body.policy); const old=await NearbyPolicy.findById('nearby').lean();
  if(Number(body.revision)!==(old?.revision||0)) fail('POLICY_CHANGED_RELOAD',409);
  try {
    const row=await NearbyPolicy.findOneAndUpdate({_id:'nearby',...(old?{revision:old.revision}:{revision:{$exists:false}})},{$set:{policy},$inc:{revision:1},$push:{history:{actor:String(actor),at:new Date(),reason:String(body.reason).slice(0,500),before:old?.policy||defaultNearbyPolicy,after:policy}}},{new:true,upsert:!old,runValidators:true});
    if(!row) fail('POLICY_CHANGED_RELOAD',409); return {...row.policy,revision:row.revision};
  } catch(err) {if(err.code===11000) fail('POLICY_CHANGED_RELOAD',409);throw err;}
}
