/** Operational readiness shared by Aura and its UI; verification is a separate gate. */
export const VENDOR_SETUP_STEPS = [
  { key:'profile', label:'Brand name, category & city', short:'Brand details', page:'profile', to:'/vendor/profile', done:c=>c.profile, auraCanFill:true, prompt:'Help me set up my brand profile' },
  { key:'services', label:'At least one active service with a price', short:'Add a service', page:'services', to:'/vendor/services', done:c=>c.services, auraCanFill:true, prompt:'How do I add my first service?' },
  { key:'capabilities', label:'Team, equipment & event capacity', short:'Add team & gear', page:'services', to:'/vendor/services?action=gear', done:c=>c.capabilities&&c.capacity&&c.resources, auraCanFill:true, prompt:'What should I add for team and equipment?' },
  { key:'coverage', label:'Operating location & coverage area', short:'Set coverage area', page:'services', to:'/vendor/services?action=coverage', done:c=>c.locations&&c.coverage, auraCanFill:true, prompt:'How do I set my location and coverage area?' },
  { key:'availability', label:'Operating days & hours', short:'Set availability', page:'availability', to:'/vendor/availability', done:c=>c.availability, prompt:'How do I set my operating days and hours?' },
  { key:'portfolio', label:'At least one portfolio project', short:'Add portfolio', page:'portfolio', to:'/vendor/portfolio', done:c=>c.portfolio, prompt:'What should I put in my portfolio?' },
];
