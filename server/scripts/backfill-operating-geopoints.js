import { connectDB, externalConn, adminConn } from '../src/db/index.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { geoPoint } from '../src/locationCommerce/rules.js';
// Read-only by default. Run --apply only against the explicitly selected release DB.
await connectDB();
let valid=0, missing=0, changed=0;
for await(const location of OperatingLocation.find().cursor()) {
  const point=geoPoint(location.coordinates);
  if(!point){missing++;continue;} valid++;
  if(JSON.stringify(location.geoPoint?.toObject?.()||location.geoPoint)!==JSON.stringify(point)) {
    changed++;if(process.argv.includes('--apply')){location.geoPoint=point;await location.save();}
  }
}
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'APPLY':'DRY_RUN',valid,missing,changed}));
await externalConn.close();await adminConn.close();
