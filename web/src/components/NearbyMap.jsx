import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function NearbyMap({ origin, results = [], radiusKm = 25, onPick }) {
  const host = useRef(null), map = useRef(null), layers = useRef(null), pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    if (!host.current) return;
    map.current=L.map(host.current,{scrollWheelZoom:false}).setView([22.5726,88.3639],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map.current);
    layers.current=L.layerGroup().addTo(map.current);
    map.current.on('click',event=>pick.current?.({lat:event.latlng.lat,lng:event.latlng.lng}));
    const observer=new ResizeObserver(()=>map.current?.invalidateSize());observer.observe(host.current);
    return ()=>{observer.disconnect();map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    if(!map.current||!layers.current)return;
    layers.current.clearLayers();
    if(!origin||!Number.isFinite(Number(origin.lat))||!Number.isFinite(Number(origin.lng)))return;
    const center=[Number(origin.lat),Number(origin.lng)];
    const circle=L.circle(center,{radius:radiusKm*1000,color:'#7352bd',weight:1,fillOpacity:.05}).addTo(layers.current);
    L.circleMarker(center,{radius:8,color:'#fff',weight:3,fillColor:'#7352bd',fillOpacity:1}).bindTooltip('Selected event location').addTo(layers.current);
    for(const row of results.filter(r=>r.coordinates)) {
      const label=document.createElement('div');const title=document.createElement('strong');title.textContent=row.businessName;
      const detail=document.createElement('p');detail.textContent=`${row.serviceName} · ${row.distanceKm} km straight-line`;
      label.append(title,detail);
      L.circleMarker([row.coordinates.lat,row.coordinates.lng],{radius:7,color:'#fff',weight:2,fillColor:'#14836e',fillOpacity:1}).bindPopup(label).addTo(layers.current);
    }
    map.current.fitBounds(circle.getBounds(),{padding:[18,18],maxZoom:13});
  },[origin?.lat,origin?.lng,results,radiusKm]);
  return <div ref={host} role="region" aria-label="Event location and eligible public vendor locations" style={{height:380,borderRadius:18,overflow:'hidden',isolation:'isolate'}} />;
}
