import { useId } from 'react';

/** Compact marks stay legible in text; orbs belong to voice and navigation. */
export default function AuraMark({ variant = 'compact', size = 24, state = 'idle', level = 0, motion = false, className = '' }) {
  const id = useId().replace(/:/g, '');
  const energy = Math.max(0, Math.min(1, Number(level) || 0));
  return <span aria-hidden="true" className={`aura-mark aura-mark--${variant} ${motion && variant === 'orb' ? 'aura-mark--motion' : ''} ${className}`} data-state={state} style={{ width: size, height: size, '--aura-energy': energy }}>
    {variant === 'orb' ? <img className="aura-mark-art" src={size > 64 ? '/images/aura/orb-384.png' : '/images/aura/orb-96.png'} width="384" height="379" alt="" draggable="false" /> :
      <svg className="aura-mark-art" width={size} height={size} viewBox="0 0 40 40" fill="none">
        <defs>
          <linearGradient id={`${id}-edge`} x1="5" y1="5" x2="35" y2="35" gradientUnits="userSpaceOnUse"><stop stopColor="#54edff"/><stop offset=".43" stopColor="#6d46ff"/><stop offset="1" stopColor="#e392ff"/></linearGradient>
          <radialGradient id={`${id}-glass`} cx=".34" cy=".25" r=".83"><stop stopColor="#fff"/><stop offset=".26" stopColor="#e6f6ff"/><stop offset=".52" stopColor="#cbb6ff"/><stop offset=".76" stopColor="#a368ff"/><stop offset="1" stopColor="#5736e8"/></radialGradient>
        </defs>
        <path d="M20 2C23 14 26 17 38 20C26 23 23 26 20 38C17 26 14 23 2 20C14 17 17 14 20 2Z" fill={`url(#${id}-edge)`}/>
        <path d="M20 5C22.7 15 25 17.3 35 20C25 22.7 22.7 25 20 35C17.3 25 15 22.7 5 20C15 17.3 17.3 15 20 5Z" fill={`url(#${id}-glass)`} stroke="#eef1ff" strokeOpacity=".8" strokeWidth=".7"/>
        <path d="M20 6L21.3 18.7L34 20L21.3 21.3L20 34L18.7 21.3L6 20L18.7 18.7L20 6Z" fill="white" fillOpacity=".7"/>
      </svg>}
    {variant === 'orb' && motion && <>
      <svg className="aura-nav-orbit" viewBox="0 0 100 100" fill="none">
        <defs><linearGradient id={`${id}-orbit`} x1="0" y1="30" x2="100" y2="70"><stop stopColor="#52efff"/><stop offset=".5" stopColor="#b997ff"/><stop offset="1" stopColor="#ff9cf3"/></linearGradient></defs>
        <ellipse className="aura-nav-orbit-trail" cx="50" cy="50" rx="46" ry="18" transform="rotate(-25 50 50)" stroke={`url(#${id}-orbit)`} strokeWidth="2" strokeLinecap="round" strokeDasharray="18 195" pathLength="213" />
      </svg>
      {[0,1,2].map(star=><span key={star} className={`aura-nav-sparkle aura-nav-sparkle--${star}`} />)}
    </>}
  </span>;
}
