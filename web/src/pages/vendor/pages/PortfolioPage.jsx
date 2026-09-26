import { useState, useEffect, useCallback, useRef } from 'react';
import { Page, Card} from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';
import { SkeletonBlock, SkeletonLine } from '../../../components/LoadingSkeleton.jsx';

// Video detection helpers
function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

function getVimeoId(url) {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/);
  return match ? match[3] : null;
}

function isVideoUrl(url, explicitType) {
  if (explicitType === 'VIDEO' || explicitType === 'REEL' || explicitType === 'HIGHLIGHT_FILM') return true;
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com')) return true;
  if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm') || lower.endsWith('.mkv') || lower.endsWith('.avi')) return true;
  if (lower.startsWith('data:video/')) return true;
  if (lower.includes('/video/upload/') || lower.includes('video/')) return true;
  return false;
}

function getMediaThumbnail(url, mediaType, fallbackThumb) {
  if (fallbackThumb) return fallbackThumb;
  if (!url) return 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80';
  const ytId = getYouTubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  if (isVideoUrl(url, mediaType)) {
    return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=80';
  }
  return url;
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-5">
      <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2 flex-1 min-w-[220px]">
          <SkeletonLine className="w-56 h-4" />
          <SkeletonLine className="w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonLine className="w-24 h-7" />
          <SkeletonLine className="w-28 h-7" />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 mb-6 pb-2">
        <div className="flex items-center gap-4">
          <SkeletonLine className="w-44 h-5" />
          <SkeletonLine className="w-40 h-5" />
        </div>
        <SkeletonLine className="w-72 h-3 hidden sm:block" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-xs">
            <SkeletonBlock className="aspect-16/9 rounded-none" />
            <div className="p-4 space-y-3">
              <div className="flex gap-1.5">
                <SkeletonLine className="w-20 h-5" />
                <SkeletonLine className="w-24 h-5" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <SkeletonLine className="w-24" />
                <SkeletonLine className="w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Category configurations for tailoring project showcases and defaults across all trades
const CATEGORY_CONFIGS = {
  'Catering': {
    icon: 'services',
    defaultEventType: 'Grand Wedding Banquet',
    eventTypes: ['Grand Wedding Banquet', 'Sangeet Feast', 'Corporate Gala Dinner', 'Cocktail Reception', 'Private Celebration'],
    defaultStyle: 'Royal Buffet & Live Counters',
    styles: [
      'Royal Buffet & Live Counters',
      'Fine Dining Plated Banquet',
      'Multi-Cuisine Royal Spread',
      'Live Chaat & Street Food Bazaar',
      'Traditional Satvik & Regional Thali',
    ],
    defaultVenue: 'JW Marriott Grand Ballroom',
    defaultCover: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. Royal Flavours - 1000 Pax Grand Wedding Feast',
    demo: (brand, city) => ({
      projectName: `${brand || 'Royal Flavours'} - 1000 Pax Grand Wedding Feast`,
      eventType: 'Grand Wedding Banquet',
      style: 'Royal Buffet & Live Counters',
      venue: 'JW Marriott Ballroom',
      city: city || 'Mumbai',
      coverUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
      description: 'Luxury gourmet catering for 1,000 guests with live artisanal chaat stations, Awadhi dum handi, and international dessert pavilion.',
      mediaItems: [
        {
          id: 'demo-c1',
          url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Grand Wedding Buffet Spread',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-c2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: 'Live Dum Handi Video Reel (45s)',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-c3',
          url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Royal Banquet Table Setting',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-c4',
          url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Artisanal Dessert & Mocktail Lounge',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'Live Gourmet Counters', url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Royal Banquet Table', url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Dessert Showcase Video', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
    ],
  },
  'Decor & Styling': {
    icon: 'star',
    defaultEventType: 'Wedding Mandap',
    eventTypes: ['Wedding Mandap', 'Sangeet & Cocktail', 'Reception Stage', 'Haldi & Mehendi Floral Setup', 'Corporate Stage Decor'],
    defaultStyle: 'Floral Mandap & Crystal Elegance',
    styles: [
      'Floral Mandap & Crystal Elegance',
      'Modern Bohemian Garden',
      'Royal Rajputana Heritage',
      'Neon Bollywood Sangeet Stage',
      'Minimalist Pastel Decor',
    ],
    defaultVenue: 'The Leela Palace Courtyard',
    defaultCover: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. Aura Decor - Royal Lotus Mandap Showcase',
    demo: (brand, city) => ({
      projectName: `${brand || 'Aura Decor'} - Royal Lotus Mandap Showcase`,
      eventType: 'Wedding Mandap',
      style: 'Floral Mandap & Crystal Elegance',
      venue: 'The Leela Palace Courtyard',
      city: city || 'Mumbai',
      coverUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
      description: 'Bespoke mandap setup adorned with 10,000 fresh orchids, suspended crystal chandeliers, and ambient warm LED backlighting.',
      mediaItems: [
        {
          id: 'demo-d1',
          url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Royal Mandap Setup',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-d2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: 'Mandap Walkthrough Video (60s)',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-d3',
          url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Illuminated Tents & Lawn Decor',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-d4',
          url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Floral Stage & Arch Details',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'Royal Mandap Setup', url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Mandap Walkthrough Reel', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
      { label: 'Illuminated Tents', url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
    ],
  },
  'DJ & Music': {
    icon: 'mic',
    defaultEventType: 'Sangeet Night Bash',
    eventTypes: ['Sangeet Night Bash', 'Cocktail After-Party', 'Wedding Baarat Live Dhol', 'Corporate Annual Gala', 'Private Pool Party'],
    defaultStyle: 'Bollywood & Punjabi Live DJ Set',
    styles: [
      'Bollywood & Punjabi Live DJ Set',
      'Sufi & Acoustic Fusion Band',
      'EDM Festival Stage & Lasers',
      'Retro Classic Symphony',
      'Live Dhol & Percussion Ensemble',
    ],
    defaultVenue: 'St. Regis Grand Ballroom',
    defaultCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. SoundWave DJ - Sangeet Euphoria Night',
    demo: (brand, city) => ({
      projectName: `${brand || 'SoundWave DJ'} - Sangeet Euphoria Night`,
      eventType: 'Sangeet Night Bash',
      style: 'Bollywood & Punjabi Live DJ Set',
      venue: 'St. Regis Grand Ballroom',
      city: city || 'Mumbai',
      coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
      description: 'High-energy 4-hour live Bollywood DJ and percussion set featuring synchronized stage laser cues and non-stop dancefloor action.',
      mediaItems: [
        {
          id: 'demo-dj1',
          url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'DJ Stage & Laser Trussing',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-dj2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: 'Live Sangeet DJ Drop (High Energy Video)',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-dj3',
          url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Concert Stage Lighting',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'DJ Stage & Lights', url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Live DJ Mix Video', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
      { label: 'Crowd Euphoria', url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
    ],
  },
  'Makeup & Styling': {
    icon: 'star',
    defaultEventType: 'Bridal Pheras',
    eventTypes: ['Bridal Pheras', 'Sangeet & Cocktail Glam', 'Reception Makeover', 'Engagement Look', 'Editorial Fashion Styling'],
    defaultStyle: 'Bridal HD & Airbrush Glow',
    styles: [
      'Bridal HD & Airbrush Glow',
      'Glass Skin Royal Glam',
      'Contemporary Minimalist Reception',
      'Traditional South Indian Temple Look',
      'Editorial Sangeet Glam',
    ],
    defaultVenue: 'Rambagh Palace Bridal Suite',
    defaultCover: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. GlowArtistry - Royal Rajputana Bridal Makeover',
    demo: (brand, city) => ({
      projectName: `${brand || 'GlowArtistry'} - Royal Rajputana Bridal Makeover`,
      eventType: 'Bridal Pheras',
      style: 'Bridal HD & Airbrush Glow',
      venue: 'Rambagh Palace Bridal Suite',
      city: city || 'Jaipur',
      coverUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80',
      description: 'Flawless 16-hour waterproof HD bridal transformation with customized hair extension styling, floral jewelry placement, and bespoke dupatta draping.',
      mediaItems: [
        {
          id: 'demo-m1',
          url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Royal Bridal Portrait',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-m2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: 'Bridal Makeover Video Reel (60s)',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-m3',
          url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'HD Airbrush Glass Glow',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'Bridal Portrait', url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Bridal Transformation Video', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
      { label: 'Airbrush Glow', url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
    ],
  },
  'Venue': {
    icon: 'mapPin',
    defaultEventType: 'Grand Wedding & Reception',
    eventTypes: ['Grand Wedding & Reception', 'Sangeet Lawn Gala', 'Corporate Convention', 'Intimate Luxury Gathering', 'Poolside Sundowner'],
    defaultStyle: 'Illuminated Night Lawn & Canopies',
    styles: [
      'Illuminated Night Lawn & Canopies',
      'Grand Pillarless Ballroom',
      'Heritage Courtyard & Mandap Lawn',
      'Poolside Sundowner Deck',
      'Glasshouse Banquet Pavilion',
    ],
    defaultVenue: 'Grand Celebration Lawn',
    defaultCover: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. Green Meadows - Illuminated Night Lawn Showcase',
    demo: (brand, city) => ({
      projectName: `${brand || 'Grand Meadows'} - Illuminated Night Lawn Showcase`,
      eventType: 'Grand Wedding & Reception',
      style: 'Illuminated Night Lawn & Canopies',
      venue: brand || 'Royal Grand Lawns',
      city: city || 'Mumbai',
      coverUrl: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
      description: 'Expansive 45,000 sq.ft lawn with capacity for 1,500 guests, equipped with luxury canopy tents, fairy-lit trees, and ample valet parking.',
      mediaItems: [
        {
          id: 'demo-v1',
          url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Illuminated Night Lawn & Tents',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-v2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: 'Drone Aerial Venue Walkthrough (60s)',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-v3',
          url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Grand Pillarless Ballroom Banquet',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'Illuminated Night Lawn', url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Drone Lawn Tour Video', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
      { label: 'Grand Ballroom', url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
    ],
  },
  'Photography': {
    icon: 'camera',
    defaultEventType: 'Wedding',
    eventTypes: ['Wedding', 'Pre-wedding Shoot', 'Engagement', 'Cocktail Night', 'Maternity / Portrait'],
    defaultStyle: 'Candid Photography',
    styles: [
      'Candid Photography',
      'Traditional Portraits & Rituals',
      'Editorial Fashion Wedding',
      'Fine Art Black & White',
      'Pre-wedding Storytelling',
    ],
    defaultVenue: 'Taj Lands End',
    defaultCover: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. LensCraft Studios - Candid Wedding Showcase',
    demo: (brand, city) => ({
      projectName: `${brand || 'LensCraft Studios'} - Candid Wedding Showcase`,
      eventType: 'Wedding',
      style: 'Candid Photography',
      venue: 'Taj Lands End',
      city: city || 'Mumbai',
      coverUrl: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
      description: 'Heartfelt candid storytelling documenting genuine emotions, intimate smiles, and ritual grandeur across 3 days.',
      mediaItems: [
        {
          id: 'demo-p1',
          url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Candid Bridal Portrait',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-p2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: 'Photographer Behind The Scenes & Reel',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-p3',
          url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Mandap Pheras Emotional Moment',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-p4',
          url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Golden Hour Sunset Lawn Portrait',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'Candid Portrait', url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: 'Highlight Video Reel', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
      { label: 'Mandap Moment', url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
    ],
  },
  'Cinematic Production': {
    icon: 'video',
    defaultEventType: 'Wedding',
    eventTypes: ['Wedding', 'Pre-wedding Shoot', 'Corporate Gala', 'Cinematic Film', 'Music Video'],
    defaultStyle: 'Cinematic',
    styles: [
      'Cinematic',
      'Candid Documentary',
      'Traditional & Rituals',
      'Drone & Aerial 4K',
      'Teaser Reel & Teaser Cut',
    ],
    defaultVenue: 'The Oberoi Udaivilas',
    defaultCover: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
    placeholder: 'e.g. CineMandap Studios - Signature Wedding',
    demo: (brand, city) => ({
      projectName: `${brand || 'CineMandap Studios'} - Signature Wedding`,
      eventType: 'Wedding',
      style: 'Cinematic',
      venue: 'The Oberoi Udaivilas',
      city: city || 'Udaipur',
      coverUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
      description: 'Grand royal palace celebration featuring 4K multi-camera cinematography, drone aerials, and candid mandap pheras.',
      mediaItems: [
        {
          id: 'demo-cp1',
          url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Royal Mandap Key Frame',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-cp2',
          url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=80',
          mediaType: 'VIDEO',
          title: '4K Cinematic Wedding Film Teaser',
          provider: 'STARVNT Video Media',
        },
        {
          id: 'demo-cp3',
          url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Cinematic Pheras Detail',
          provider: 'STARVNT Media Ready',
        },
        {
          id: 'demo-cp4',
          url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
          mediaType: 'IMAGE',
          title: 'Drone Aerial Night Lawn',
          provider: 'STARVNT Media Ready',
        },
      ],
    }),
    presets: [
      { label: 'Royal Mandap Film', url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
      { label: '4K Wedding Teaser Video', url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', type: 'VIDEO' },
      { label: 'Cinematic Pheras', url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80', type: 'IMAGE' },
    ],
  },
};

export default function PortfolioPage() {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendorProfile, setVendorProfile] = useState(null);
  const [activation, setActivation] = useState(null);
  const [activeTab, setActiveTab] = useState('PROJECTS'); // 'PROJECTS' | 'ALL_MEDIA'
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // New Project Form Modal State
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [eventType, setEventType] = useState('Wedding');
  const [eventDate, setEventDate] = useState('2026-11-26');
  const [venue, setVenue] = useState('Taj Lands End');
  const [city, setCity] = useState('Mumbai');
  const [style, setStyle] = useState('Cinematic');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [mediaItems, setMediaItems] = useState([]); // List of { id, url, thumbnailUrl, mediaType, title, provider }
  const [creatingProject, setCreatingProject] = useState(false);

  // URL Input State in Project Modal
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [inputMediaType, setInputMediaType] = useState('AUTO');

  // Cloudinary Multi-file Drag & Drop & Upload State
  const fileInputRef = useRef(null);
  const standaloneFileInputRef = useRef(null);
  const projectFileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadingToCloudinary, setUploadingToCloudinary] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // Standalone Add Media via URL Modal (for ALL_MEDIA tab)
  const [showStandaloneUrlModal, setShowStandaloneUrlModal] = useState(false);
  const [standaloneUrl, setStandaloneUrl] = useState('');
  const [standaloneTitle, setStandaloneTitle] = useState('');
  const [standaloneMediaType, setStandaloneMediaType] = useState('AUTO');
  const [showProjectUrlInput, setShowProjectUrlInput] = useState(false);
  const [projectUrl, setProjectUrl] = useState('');
  const [projectUrlTitle, setProjectUrlTitle] = useState('');
  const [projectUrlType, setProjectUrlType] = useState('AUTO');

  // Interactive Media Modals (Video Player & Lightbox & Project Showcase)
  const [activeVideoModal, setActiveVideoModal] = useState(null); // { url, title }
  const [activePhotoModal, setActivePhotoModal] = useState(null); // { url, title }
  const [selectedProjectShowcase, setSelectedProjectShowcase] = useState(null);
  const [projectDetailFilter, setProjectDetailFilter] = useState('ALL');

  // Resolve current active category config
  const vendorCategory = vendorProfile?.category || 'Cinematic Production';
  const currCategoryConfig =
    CATEGORY_CONFIGS[vendorCategory] ||
    CATEGORY_CONFIGS['Photography'] ||
    CATEGORY_CONFIGS['Cinematic Production'];

  function openProjectShowcase(project) {
    setProjectDetailFilter('ALL');
    setSelectedProjectShowcase(project);
  }

  async function refreshProjectShowcase(projectName) {
    const projRes = await externalApi.call('/vendor/portfolio/projects');
    if (projRes.ok && Array.isArray(projRes.projects)) {
      setProjects(projRes.projects);
      const updated = projRes.projects.find((p) => p.projectName === projectName);
      if (updated) setSelectedProjectShowcase(updated);
    }
  }

  const loadMediaLibrary = useCallback(async () => {
    if (mediaLoading) return;
    setMediaLoading(true);
    try {
      const mediaRes = await externalApi.call('/vendor/portfolio');
      if (mediaRes?.ok && Array.isArray(mediaRes.items)) {
        setItems(mediaRes.items);
        setMediaLoaded(true);
      }
    } catch (err) {
      console.warn('[PortfolioPage] Failed to load media library:', err.message);
    } finally {
      setMediaLoading(false);
    }
  }, [mediaLoading]);

  // Load the fast project summary first. The full media library is fetched only when opened.
  const loadPortfolioData = useCallback(async () => {
    setLoading(true);
    try {
      const [projResult, profileResult, actResult] = await Promise.allSettled([
        externalApi.call('/vendor/portfolio/projects'),
        externalApi.call('/vendor/profile'),
        externalApi.call('/vendor/activation-status'),
      ]);

      const projRes = projResult.status === 'fulfilled' ? projResult.value : null;
      const profileRes = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const actRes = actResult.status === 'fulfilled' ? actResult.value : null;

      if (profileRes?.ok && profileRes.vendor) {
        setVendorProfile(profileRes.vendor);
        if (profileRes.vendor.city) setCity(profileRes.vendor.city);
      }

      if (actRes?.ok && actRes.status) {
        setActivation(actRes.status);
      }

      if (projRes?.ok && Array.isArray(projRes.projects)) {
        setProjects(projRes.projects);
      }
    } catch (err) {
      console.warn('[PortfolioPage] Failed to load portfolio data:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  useEffect(() => {
    if (activeTab === 'ALL_MEDIA' && !mediaLoaded) {
      loadMediaLibrary();
    }
  }, [activeTab, mediaLoaded, loadMediaLibrary]);

  // Open modal and initialize trade-appropriate defaults
  function handleOpenCreateModal() {
    const defaultCity = vendorProfile?.city || vendorProfile?.location || 'Mumbai';
    setCity(defaultCity);
    setEventType(currCategoryConfig.defaultEventType);
    setStyle(currCategoryConfig.defaultStyle);
    setVenue(currCategoryConfig.defaultVenue);
    setCoverUrl(currCategoryConfig.defaultCover);
    setMediaItems([
      {
        id: 'initial-cover',
        url: currCategoryConfig.defaultCover,
        thumbnailUrl: currCategoryConfig.defaultCover,
        mediaType: 'IMAGE',
        title: 'Project Cover',
        provider: 'STARVNT Media Ready',
      },
    ]);
    setShowProjectModal(true);
  }

  // 1-Click quick autofill helper tailored specifically to the vendor's trade & brand
  function handleQuickFillDemo() {
    const demo = currCategoryConfig.demo(vendorProfile?.businessName, vendorProfile?.city || city);
    setProjectName(demo.projectName);
    setEventType(demo.eventType);
    setStyle(demo.style);
    setVenue(demo.venue);
    setCity(demo.city);
    setCoverUrl(demo.coverUrl);
    setDescription(demo.description);
    setMediaItems(demo.mediaItems || []);
  }

  // Multi-file Cloudinary upload handler (mobile & web friendly)
  async function handleMultipleFilesUpload(filesList) {
    if (!filesList || filesList.length === 0) return;
    setUploadingToCloudinary(true);
    setUploadProgress({ current: 0, total: filesList.length });

    const newItems = [];
    const failedFiles = [];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      setUploadProgress({ current: i + 1, total: filesList.length });

      try {
        const base64Data = await readFileAsDataURL(file);
        const isVideo = file.type.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);

        const uploadRes = await externalApi.call('/vendor/portfolio/upload', {
          method: 'POST',
          body: {
            file: base64Data,
            filename: file.name,
            mediaType: isVideo ? 'VIDEO' : 'IMAGE',
          },
        });

        const url = uploadRes.ok && uploadRes.url ? uploadRes.url : base64Data;
        const resType = uploadRes.resourceType || (isVideo ? 'VIDEO' : 'IMAGE');
        const thumb =
          uploadRes.thumbnailUrl ||
          (resType === 'VIDEO' ? `${url}-poster.jpg` : url);

        newItems.push({
          id: `upload-${Date.now()}-${i}`,
          url,
          thumbnailUrl: thumb,
          mediaType: resType,
          title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          provider: uploadRes.provider === 'cloudinary' ? 'STARVNT Media CDN' : 'STARVNT Secure Media',
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        });
      } catch (err) {
        console.warn('Upload error for file:', file.name, err);
        failedFiles.push(file.name);
      }
    }

    setMediaItems((prev) => [...prev, ...newItems]);
    if (!coverUrl && newItems.length > 0) {
      setCoverUrl(newItems[0].url);
    }
    setUploadingToCloudinary(false);
    setUploadProgress(null);
    if (failedFiles.length > 0) {
      setFeedback(`Could not upload ${failedFiles.length} file(s): ${failedFiles.slice(0, 3).join(', ')}${failedFiles.length > 3 ? '...' : ''}`);
    } else {
      setFeedback(`Uploaded ${newItems.length} media file(s). Preview them before publishing.`);
    }
  }

  // Add media via URL inside Project creation modal
  function handleAddMediaUrl() {
    if (!inputUrl.trim()) return;
    const url = inputUrl.trim();
    const isVid = inputMediaType === 'VIDEO' || (inputMediaType === 'AUTO' && isVideoUrl(url));
    const thumb = getMediaThumbnail(url, isVid ? 'VIDEO' : 'IMAGE');

    const newItem = {
      id: `url-${Date.now()}`,
      url,
      thumbnailUrl: thumb,
      mediaType: isVid ? 'VIDEO' : 'IMAGE',
      title: inputTitle.trim() || (isVid ? 'Video Feature' : 'Photo Feature'),
      provider: getYouTubeId(url) ? 'YouTube Video' : getVimeoId(url) ? 'Vimeo Video' : 'External URL',
    };

    setMediaItems((prev) => [...prev, newItem]);
    if (!coverUrl) setCoverUrl(url);
    setInputUrl('');
    setInputTitle('');
    setShowUrlInput(false);
  }

  // Remove media item from modal list
  function handleRemoveMediaItem(id) {
    setMediaItems((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      if (filtered.length > 0 && !filtered.some((m) => m.url === coverUrl)) {
        setCoverUrl(filtered[0].url);
      }
      return filtered;
    });
  }

  // Add Standalone Media / Video to ALL_MEDIA library via URL
  async function handleAddStandaloneMedia() {
    if (!standaloneUrl.trim()) return;
    const url = standaloneUrl.trim();
    const isVid = standaloneMediaType === 'VIDEO' || (standaloneMediaType === 'AUTO' && isVideoUrl(url));

    try {
      const res = await externalApi.call('/vendor/portfolio/item', {
        method: 'POST',
        body: {
          url,
          title: standaloneTitle.trim() || `${vendorCategory} Showcase`,
          mediaType: isVid ? 'VIDEO' : 'IMAGE',
          city: vendorProfile?.city || 'Mumbai',
          eventType: currCategoryConfig.defaultEventType,
          style: currCategoryConfig.defaultStyle,
        },
      });

      if (res.ok) {
        setFeedback(`Added ${isVid ? 'video' : 'photo'} to portfolio media library.`);
        setShowStandaloneUrlModal(false);
        setStandaloneUrl('');
        setStandaloneTitle('');
        await loadPortfolioData();
      }
    } catch (err) {
      setFeedback('Failed to add media item.');
    }
  }

  async function addMediaToProject(uploaded, project) {
    const isVid = uploaded.resourceType === 'VIDEO' || uploaded.mediaType === 'VIDEO' || isVideoUrl(uploaded.url, uploaded.resourceType);
    return externalApi.call('/vendor/portfolio/item', {
      method: 'POST',
      body: {
        url: uploaded.url,
        thumbnailUrl: uploaded.thumbnailUrl,
        projectName: project.projectName,
        title: uploaded.title || uploaded.filename || `${project.projectName} Media`,
        mediaType: isVid ? 'VIDEO' : 'IMAGE',
        eventType: project.eventType || currCategoryConfig.defaultEventType,
        style: project.style || currCategoryConfig.defaultStyle,
        city: project.location?.city || vendorProfile?.city || 'Mumbai',
        venue: project.location?.venue || 'Venue',
        tags: project.tags || [],
      },
    });
  }

  async function handleUploadMoreToProject(filesList) {
    if (!selectedProjectShowcase || !filesList || filesList.length === 0) return;
    setUploadingToCloudinary(true);
    setUploadProgress({ current: 0, total: filesList.length });
    setFeedback(null);

    const failedFiles = [];
    let addedCount = 0;

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      setUploadProgress({ current: i + 1, total: filesList.length });
      try {
        const base64Data = await readFileAsDataURL(file);
        const isVideo = file.type.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
        const uploadRes = await externalApi.call('/vendor/portfolio/upload', {
          method: 'POST',
          body: {
            file: base64Data,
            filename: file.name,
            mediaType: isVideo ? 'VIDEO' : 'IMAGE',
          },
        });

        const url = uploadRes.ok && uploadRes.url ? uploadRes.url : base64Data;
        await addMediaToProject(
          {
            ...uploadRes,
            url,
            mediaType: isVideo ? 'VIDEO' : 'IMAGE',
            title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          },
          selectedProjectShowcase
        );
        addedCount += 1;
      } catch (err) {
        console.warn('Project upload error for file:', file.name, err);
        failedFiles.push(file.name);
      }
    }

    setUploadingToCloudinary(false);
    setUploadProgress(null);
    await refreshProjectShowcase(selectedProjectShowcase.projectName);
    setFeedback(
      failedFiles.length > 0
        ? `Added ${addedCount} file(s). Failed: ${failedFiles.slice(0, 3).join(', ')}${failedFiles.length > 3 ? '...' : ''}`
        : `Added ${addedCount} file(s) to "${selectedProjectShowcase.projectName}".`
    );
  }

  async function handleAddProjectUrlMedia() {
    if (!selectedProjectShowcase || !projectUrl.trim()) return;
    const url = projectUrl.trim();
    const isVid = projectUrlType === 'VIDEO' || (projectUrlType === 'AUTO' && isVideoUrl(url));

    try {
      await addMediaToProject(
        {
          url,
          thumbnailUrl: getMediaThumbnail(url, isVid ? 'VIDEO' : 'IMAGE'),
          mediaType: isVid ? 'VIDEO' : 'IMAGE',
          title: projectUrlTitle.trim() || (isVid ? 'Project Video' : 'Project Photo'),
        },
        selectedProjectShowcase
      );
      setProjectUrl('');
      setProjectUrlTitle('');
      setProjectUrlType('AUTO');
      setShowProjectUrlInput(false);
      await refreshProjectShowcase(selectedProjectShowcase.projectName);
      setFeedback(`Added ${isVid ? 'video' : 'photo'} to "${selectedProjectShowcase.projectName}".`);
    } catch (err) {
      setFeedback('Failed to add media to this project.');
    }
  }

  // Handle Project Creation via API with multiple photos & videos
  async function handleCreateProject(e) {
    e.preventDefault();
    if (!projectName.trim()) return;

    setCreatingProject(true);
    setFeedback(null);

    try {
      const formattedItems =
        mediaItems.length > 0
          ? mediaItems.map((m) => ({
              url: m.url,
              thumbnailUrl: m.thumbnailUrl || m.url,
              mediaType: m.mediaType || (isVideoUrl(m.url) ? 'VIDEO' : 'IMAGE'),
              title: m.title || projectName,
            }))
          : [
              {
                url: coverUrl || currCategoryConfig.defaultCover,
                mediaType: 'IMAGE',
                title: `${projectName} Cover`,
              },
            ];

      const res = await externalApi.call('/vendor/portfolio/project', {
        method: 'POST',
        body: {
          projectName,
          eventType,
          eventDate,
          venue: venue || 'Venue',
          city: city || vendorProfile?.city || 'Mumbai',
          style,
          description: description || `${eventType} showcase by ${vendorProfile?.businessName || 'Vendor'}.`,
          coverUrl: coverUrl || formattedItems[0]?.url,
          mediaItems: formattedItems,
          tags: [eventType, style, city, vendorCategory, 'Showcase'],
          status: 'PUBLISHED',
        },
      });

      if (res.ok) {
        const pct = res.activation?.completionPercentage;
        if (res.project) {
          setProjects((prev) => [res.project, ...prev.filter((p) => p.projectName !== res.project.projectName)]);
          if (Array.isArray(res.project.items)) {
            setItems((prev) => [...res.project.items, ...prev]);
          }
        }
        setFeedback(
          `Project "${projectName}" successfully published with ${formattedItems.length} media files! Profile completion increased${
            pct ? ` to ${pct}%` : ''
          }.`
        );
        setShowProjectModal(false);
        setProjectName('');
        setDescription('');
        setMediaItems([]);
        await loadPortfolioData();
      } else {
        setFeedback(res.error || 'Failed to create project. Please try again.');
      }
    } catch (err) {
      setFeedback(`Project "${projectName}" created.`);
      setShowProjectModal(false);
    } finally {
      setCreatingProject(false);
    }
  }

  // Delete project and all its media files
  async function handleDeleteProject(pName) {
    if (!confirm(`Are you sure you want to delete "${pName}" and its media files?`)) return;
    try {
      await externalApi.call(`/vendor/portfolio/projects/${encodeURIComponent(pName)}`, {
        method: 'DELETE',
      });
      setFeedback(`Project "${pName}" deleted.`);
      setSelectedProjectShowcase(null);
      await loadPortfolioData();
    } catch (err) {
      console.warn('Delete error:', err);
    }
  }

  // Delete individual media item
  async function handleDeleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this media item?')) return;
    try {
      await externalApi.call(`/vendor/portfolio/items/${itemId}`, { method: 'DELETE' });
      setFeedback('Media item removed.');
      await loadPortfolioData();
      if (selectedProjectShowcase) {
        setSelectedProjectShowcase((prev) => ({
          ...prev,
          items: prev.items.filter((i) => i._id !== itemId),
        }));
      }
    } catch (err) {
      console.warn('Delete item error:', err);
    }
  }

  // Filtered Items for ALL_MEDIA tab
  const filteredItems = items.filter((i) => {
    if (filter === 'ALL') return true;
    if (filter === 'IMAGE') return i.mediaType === 'IMAGE';
    if (filter === 'VIDEO') return isVideoUrl(i.url, i.mediaType);
    if (filter === 'REVIEW') return i.status === 'VENDOR_REVIEW';
    if (filter === 'PUBLISHED') return i.status === 'PUBLISHED';
    return true;
  });

  if (loading) {
    return (
      <Page
        title="Portfolio & Projects"
        sub="Organize multi-photo and video showcases, drag & drop files via STARVNT Media, and link YouTube/Vimeo video proofs."
      >
        <PortfolioSkeleton />
      </Page>
    );
  }

  return (
    <Page
      title="Portfolio & Projects"
      sub="Organize multi-photo and video showcases, drag & drop files via STARVNT Media, and link YouTube/Vimeo video proofs."
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenCreateModal}
            className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2.5 transition shadow-xs flex items-center gap-1.5"
          >
            <span>+</span> Create Project (Multi-Media)
          </button>
          <button
            onClick={() => setShowStandaloneUrlModal(true)}
            className="rounded-xl bg-lavender hover:bg-lavender/80 text-navy text-xs font-bold px-3.5 py-2.5 transition border border-gray-200 flex items-center gap-1.5"
          >
            <Icon name="link" size={14} />
            <span>Add Video / Media URL</span>
          </button>
        </div>
      }
    >
      {/* Hidden input for standalone uploads */}
      <input
        type="file"
        ref={standaloneFileInputRef}
        multiple
        accept="image/*,video/*"
        onChange={(e) => {
          if (e.target.files?.length) handleMultipleFilesUpload(e.target.files);
        }}
        className="hidden"
      />

      {/* Profile Completion Onboarding Banner / Status */}
      {activation && (
        <div className="mb-5 p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                activation.is100Percent ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="font-bold text-navy">
              Profile Completion:{' '}
              <span className={activation.is100Percent ? 'text-emerald-600' : 'text-primary'}>
                {activation.completionPercentage ?? 0}%
              </span>
            </span>
            <span className="text-muted text-[11px]">·</span>
            <span className="text-muted text-[11px] inline-flex items-center gap-1">
              {projects.length === 0 ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>1 Project showcase required for 100% profile activation</span>
                </>
              ) : (
                <>
                  <Icon name="check" size={12} className="text-emerald-600" />
                  <span>Portfolio project showcase complete (+20% granted)</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-navy/70 bg-lavender px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5">
              <Icon name={currCategoryConfig.icon || 'camera'} size={13} />
              <span>{vendorCategory}</span>
            </span>
            {projects.length === 0 && (
              <button
                onClick={handleOpenCreateModal}
                className="bg-primary text-white font-bold px-3 py-1 rounded-lg text-[11px] hover:bg-primary-dark transition"
              >
                + Create Project
              </button>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold mb-4 animate-[pop_.18s_ease-out] flex items-center gap-2">
          <Icon name="check" size={14} className="shrink-0 text-emerald-600" />
          <span>{feedback.replace(/^✓\s*/, '')}</span>
        </div>
      )}

      {/* Main Tabs: Projects vs All Media */}
      <div className="flex items-center justify-between border-b border-gray-200 mb-6 pb-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('PROJECTS')}
            className={`text-sm font-extrabold pb-2 transition relative flex items-center gap-1.5 ${
              activeTab === 'PROJECTS'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-navy'
            }`}
          >
            <Icon name="folder" size={15} />
            <span>Projects & Showcases ({projects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('ALL_MEDIA')}
            className={`text-sm font-extrabold pb-2 transition relative flex items-center gap-1.5 ${
              activeTab === 'ALL_MEDIA'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-navy'
            }`}
          >
            <Icon name="image" size={15} />
            <span>All Media Library{mediaLoaded ? ` (${items.length})` : ''}</span>
          </button>
        </div>
        <span className="text-xs text-muted font-medium hidden sm:inline">
          Photos, 4K Reels & YouTube/Vimeo proofs supported
        </span>
      </div>

      {/* TAB 1: STRUCTURED PROJECTS VIEW */}
      {activeTab === 'PROJECTS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p, idx) => {
              const photoCount = (p.items || []).filter((i) => !isVideoUrl(i.url, i.mediaType)).length;
              const videoCount = (p.items || []).filter((i) => isVideoUrl(i.url, i.mediaType)).length;

              return (
                <Card
                  key={p._id || p.projectName || idx}
                  className="!p-0 overflow-hidden flex flex-col group hover:shadow-lg transition border border-gray-100 cursor-pointer"
                  onClick={() => openProjectShowcase(p)}
                >
                  <div className="relative aspect-16/9 bg-gray-100 overflow-hidden">
                    <img
                      src={getMediaThumbnail(p.coverUrl, 'IMAGE')}
                      alt={p.projectName}
                      onError={(e) => {
                        e.currentTarget.src = getMediaThumbnail('', 'IMAGE');
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/20 to-transparent opacity-90" />
                    <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-md shadow-xs">
                        {p.eventType}
                      </span>
                      <span className="text-[10px] font-bold bg-white/90 text-navy px-2 py-0.5 rounded-md shadow-xs">
                        {p.style}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-1">
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleDeleteProject(p.projectName);
    }}
    className="w-6 h-6 rounded-md bg-black/40 hover:bg-red-600 text-white grid place-items-center backdrop-blur-sm transition"
    title="Delete Project"
  >
    <Icon name="trash" size={12} />
  </button>
  <StatusChip status={p.status || 'PUBLISHED'} />
</div>

                    {/* Multi-media counter pill */}
                    <div className="absolute bottom-10 left-3 flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-black/60 backdrop-blur-xs text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Icon name="camera" size={11} />
                        <span>{photoCount} Photos</span>
                      </span>
                      {videoCount > 0 && (
                        <span className="text-[10px] font-bold bg-red-600/90 backdrop-blur-xs text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Icon name="video" size={11} />
                          <span>{videoCount} Videos</span>
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <div className="font-extrabold text-sm truncate">{p.projectName}</div>
                      <div className="text-[11px] text-white/80 mt-0.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <Icon name="mapPin" size={11} />
                          <span>{p.location?.venue || 'Venue'}, {p.location?.city || city}</span>
                        </span>
                        <span>·</span>
                        <span>{p.items?.length || 1} total items</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(p.tags || [p.eventType, p.style, city]).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] bg-lavender text-navy/80 rounded-md px-2 py-0.5 font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                      <span className="text-muted">
                        {p.eventDate ? String(p.eventDate).slice(0, 10) : 'Active'}
                      </span>
                      <span className="text-primary font-bold group-hover:underline">
                        Open Showcase & Videos →
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {projects.length === 0 && !loading && (
            <div className="text-center py-14 bg-white rounded-3xl border border-gray-100 p-8 space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-primary-soft text-primary grid place-items-center mx-auto shadow-2xs">
                <Icon name={currCategoryConfig.icon || 'camera'} size={28} />
              </div>
              <div className="space-y-1">
                <div className="font-extrabold text-base text-navy">No Projects Created Yet</div>
                <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
                  Your portfolio is currently blank. Showcase multiple photos, 4K videos, or YouTube/Vimeo links to build client trust and achieve 100% profile completion.
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <button
                  onClick={handleOpenCreateModal}
                  className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-5 py-2.5 shadow-md shadow-primary/25 transition transform active:scale-95"
                >
                  + Create First Project (Multi-Media)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALL MEDIA FILES VIEW */}
      {activeTab === 'ALL_MEDIA' && (
        <div className="space-y-4">
          {mediaLoading && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 text-xs font-bold text-muted shadow-xs">
              Loading media library...
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { key: 'ALL', label: `All Files (${items.length})` },
                {
                  key: 'IMAGE',
                  label: `Photos (${items.filter((i) => !isVideoUrl(i.url, i.mediaType)).length})`,
                },
                {
                  key: 'VIDEO',
                  label: `Videos & Reels (${items.filter((i) => isVideoUrl(i.url, i.mediaType)).length})`,
                },
                { key: 'PUBLISHED', label: `Published (${items.filter((i) => i.status === 'PUBLISHED').length})` },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                    filter === f.key ? 'bg-primary text-white shadow-xs' : 'bg-white text-muted hover:bg-lavender'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => standaloneFileInputRef.current?.click()}
                className="rounded-xl bg-white text-navy border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-lavender transition flex items-center gap-1.5"
              >
                <Icon name="upload" size={14} />
                <span>Upload Photos/Videos</span>
              </button>
              <button
                onClick={() => setShowStandaloneUrlModal(true)}
                className="rounded-xl bg-primary-soft text-primary px-3 py-1.5 text-xs font-bold hover:bg-primary/20 transition flex items-center gap-1.5"
              >
                <Icon name="link" size={14} />
                <span>Add URL / Video</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {filteredItems.map((item) => {
              const isVid = isVideoUrl(item.url, item.mediaType);

              return (
                <Card
                  key={item._id}
                  className="!p-0 overflow-hidden flex flex-col group hover:shadow-md transition border border-gray-100 cursor-pointer relative"
                  onClick={() => {
                    if (isVid) setActiveVideoModal({ url: item.url, title: item.title });
                    else setActivePhotoModal({ url: item.url, title: item.title });
                  }}
                >
                  <div className="relative aspect-4/3 bg-gray-100 overflow-hidden">
                    <img
                      src={getMediaThumbnail(item.url, item.mediaType, item.thumbnailUrl)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />

                    {/* Play button overlay on videos */}
                    {isVid && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition">
                        <div className="w-9 h-9 rounded-full bg-white/90 text-red-600 grid place-items-center shadow-md font-extrabold text-xs">
                          <Icon name="play" size={12} />
                        </div>
                      </div>
                    )}

                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
                          isVid ? 'bg-red-600 text-white' : 'bg-navy/80 text-white'
                        }`}
                      >
                        {isVid ? 'VIDEO' : 'PHOTO'}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteItem(item._id);
                      }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
                      title="Delete item"
                      aria-label="Delete item"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>

                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-xs text-navy truncate" title={item.title}>
                        {item.title}
                      </div>
                      <div className="text-[10px] text-muted truncate mt-0.5">
                        {item.projectName || 'General Media'}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredItems.length === 0 && !loading && !mediaLoading && (
            <div className="text-center py-14 bg-white rounded-3xl border border-gray-100 p-8 space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-primary-soft text-primary grid place-items-center mx-auto shadow-2xs">
                <Icon name="image" size={28} />
              </div>
              <div className="space-y-1">
                <div className="font-extrabold text-base text-navy">No Media Uploaded Yet</div>
                <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
                  Your media library is empty. Upload multiple photos or videos via STARVNT Media, or paste YouTube/Vimeo links.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={() => standaloneFileInputRef.current?.click()}
                  className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-5 py-2.5 shadow-md shadow-primary/25 transition transform active:scale-95 flex items-center gap-1.5"
                >
                  <Icon name="upload" size={14} />
                  <span>Upload Multiple Photos/Videos</span>
                </button>
                <button
                  onClick={() => setShowStandaloneUrlModal(true)}
                  className="rounded-xl bg-lavender text-navy text-xs font-bold px-4 py-2.5 border border-gray-200 hover:bg-lavender/80 transition flex items-center gap-1.5"
                >
                  <Icon name="link" size={14} />
                  <span>Add Media via URL</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE NEW PROJECT MODAL WITH MULTI-PHOTO & VIDEO SUPPORT */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-extrabold text-lg text-navy flex items-center gap-2">
                  <Icon name={currCategoryConfig.icon || 'camera'} size={18} />
                  <span>Create {vendorCategory} Project (Multi-Media)</span>
                </h3>
                <p className="text-xs text-muted">
                  Add multiple photos, 4K videos, and web video links for {vendorProfile?.businessName || 'your brand'}
                </p>
              </div>
              <button
                onClick={() => setShowProjectModal(false)}
                className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
                aria-label="Close dialog"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* 1-Click Quick Autofill helper tailored to vendor category */}
            <button
              type="button"
              onClick={handleQuickFillDemo}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-primary/10 via-lavender to-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary/20 transition shadow-2xs"
            >
              <Icon name="bolt" size={13} />
              <span>1-Click Suggestion (Multi-Media Demo with Photos + Video)</span>
            </button>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Project / Showcase Title</label>
                <input
                  type="text"
                  required
                  placeholder={currCategoryConfig.placeholder}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Event Category</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 font-semibold text-navy outline-none"
                  >
                    {currCategoryConfig.eventTypes.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Style / Deliverable</label>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 font-semibold text-navy outline-none"
                  >
                    {currCategoryConfig.styles.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Venue Name</label>
                  <input
                    type="text"
                    placeholder={`e.g. ${currCategoryConfig.defaultVenue}`}
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 font-medium text-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">City</label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 font-medium text-navy outline-none"
                  />
                </div>
              </div>

              {/* MULTI-MEDIA UPLOAD & MANAGEMENT SECTION */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-navy font-bold text-xs">
                      Project Media Files ({mediaItems.length})
                    </label>
                    <span className="text-[10px] text-muted">
                      ({mediaItems.filter((m) => m.mediaType === 'IMAGE').length} Photos ·{' '}
                      {mediaItems.filter((m) => m.mediaType === 'VIDEO').length} Videos)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="text-[11px] text-primary font-bold hover:underline flex items-center gap-1"
                    >
                      <Icon name="link" size={13} />
                      <span>+ Add via URL (YouTube/MP4)</span>
                    </button>
                    <span className="text-[10px] text-primary font-bold bg-primary-soft px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> STARVNT Media Enabled
                    </span>
                  </div>
                </div>

                {/* URL Input Bar */}
                {showUrlInput && (
                  <div className="p-3 bg-lavender/70 rounded-2xl border border-primary/20 space-y-2 animate-[fade_.15s_ease-out]">
                    <div className="text-[11px] font-bold text-navy flex items-center justify-between">
                      <span>Add Photo or Video Link</span>
                      <span className="text-muted font-normal text-[10px]">
                        YouTube, Vimeo, MP4, WebM, or image link
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=... or https://.../photo.jpg"
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-navy outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Title (optional)"
                        value={inputTitle}
                        onChange={(e) => setInputTitle(e.target.value)}
                        className="sm:w-36 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-navy outline-none"
                      />
                      <select
                        value={inputMediaType}
                        onChange={(e) => setInputMediaType(e.target.value)}
                        className="bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-xs text-navy outline-none"
                      >
                        <option value="AUTO">Auto Detect</option>
                        <option value="VIDEO">Video</option>
                        <option value="IMAGE">Photo</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMediaUrl}
                        className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-primary-dark transition shrink-0"
                      >
                        Add to List
                      </button>
                    </div>
                  </div>
                )}

                {/* Hidden Multi-file input supporting images & videos */}
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*,video/*"
                  onChange={(e) => {
                    if (e.target.files?.length) handleMultipleFilesUpload(e.target.files);
                  }}
                  className="hidden"
                />

                {/* Drag & Drop Multi-file Box */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files?.length) {
                      handleMultipleFilesUpload(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition relative overflow-hidden ${
                    dragActive
                      ? 'border-primary bg-primary-soft/60 scale-[1.01]'
                      : 'border-gray-200 bg-lavender/40 hover:bg-lavender/80 hover:border-primary/50'
                  }`}
                >
                  {uploadingToCloudinary ? (
                    <div className="py-3 space-y-2">
                      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                      <div className="font-bold text-navy text-xs">
                        Uploading to STARVNT Media ({uploadProgress?.current || 1} of{' '}
                        {uploadProgress?.total || 1})...
                      </div>
                      <div className="text-[10px] text-muted">Optimizing photos & videos</div>
                    </div>
                  ) : (
                    <div className="py-2 space-y-1">
                      <div className="flex items-center justify-center gap-2 text-primary font-bold text-xs">
                        <Icon name="upload" size={15} />
                        <span>Drag & drop multiple photos and videos here</span>
                      </div>
                      <div className="text-[11px] text-navy font-semibold">
                        or tap to Browse (Select multiple files from computer or mobile)
                      </div>
                      <div className="text-[10px] text-muted">
                        STARVNT Media · JPG, PNG, WEBP, MP4, MOV, WebM (multiple files supported)
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid of Attached Media Items */}
                {mediaItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-muted flex items-center justify-between">
                      <span>Attached Files ({mediaItems.length}): Click item to preview or set as cover</span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-primary hover:underline font-bold"
                      >
                        + Add More Files
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-1 bg-lavender/20 rounded-2xl border border-gray-100">
                      {mediaItems.map((item, idx) => {
                        const isCover = coverUrl === item.url || (idx === 0 && !coverUrl);
                        const isVid = item.mediaType === 'VIDEO' || isVideoUrl(item.url);

                        return (
                          <div
                            key={item.id || idx}
                            className={`relative rounded-xl overflow-hidden border transition group ${
                              isCover ? 'border-primary ring-2 ring-primary/30 shadow-xs' : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="relative aspect-16/9 bg-gray-100 overflow-hidden">
                              <img
                                src={getMediaThumbnail(item.url, item.mediaType, item.thumbnailUrl)}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />

                              {isVid && (
                                <div
                                  onClick={() => setActiveVideoModal({ url: item.url, title: item.title })}
                                  className="absolute inset-0 bg-black/25 flex items-center justify-center cursor-pointer hover:bg-black/40 transition"
                                >
                                  <span className="w-6 h-6 rounded-full bg-white text-red-600 grid place-items-center text-[10px]">
                                    <Icon name="play" size={10} />
                                  </span>
                                </div>
                              )}

                              <div className="absolute top-1 left-1 flex items-center gap-1">
                                <span
                                  className={`text-[8px] font-extrabold px-1 py-0.2 rounded ${
                                    isVid ? 'bg-red-600 text-white' : 'bg-navy/80 text-white'
                                  }`}
                                >
                                  {isVid ? 'VIDEO' : 'PHOTO'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveMediaItem(item.id)}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-red-600 text-white grid place-items-center transition"
                                title="Remove"
                                aria-label="Remove item"
                              >
                                <Icon name="close" size={10} />
                              </button>

                              {isCover && (
                                <div className="absolute bottom-1 left-1 bg-primary text-white text-[8px] font-bold px-1.5 py-0.2 rounded shadow-xs inline-flex items-center gap-0.5">
                                  <Icon name="star" size={8} />
                                  <span>Main Cover</span>
                                </div>
                              )}
                            </div>

                            <div className="p-1.5 text-[10px] space-y-1 bg-white">
                              <div className="font-bold text-navy truncate" title={item.title}>
                                {item.title}
                              </div>
                              {!isCover && (
                                <button
                                  type="button"
                                  onClick={() => setCoverUrl(item.url)}
                                  className="text-[9px] text-primary font-bold hover:underline block"
                                >
                                  Set as Cover
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Category-tailored Quick Presets */}
                <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                  <span className="text-muted font-bold shrink-0">Quick Presets:</span>
                  {currCategoryConfig.presets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const newItem = {
                          id: `preset-${Date.now()}-${preset.label}`,
                          url: preset.url,
                          thumbnailUrl: preset.type === 'VIDEO' ? 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=80' : preset.url,
                          mediaType: preset.type,
                          title: preset.label,
                          provider: 'STARVNT Media Ready',
                        };
                        setMediaItems((prev) => [...prev, newItem]);
                        if (!coverUrl) setCoverUrl(preset.url);
                      }}
                      className="bg-lavender hover:bg-primary/15 rounded-lg px-2 py-1 font-bold text-primary shrink-0 transition flex items-center gap-1"
                    >
                      <Icon name={preset.type === 'VIDEO' ? 'video' : 'camera'} size={11} />
                      <span>+ {preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Project Story / Description</label>
                <textarea
                  rows="2"
                  placeholder={`Describe client requirements, execution, and deliverables for this ${vendorCategory.toLowerCase()} project...`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2 text-xs font-normal text-navy outline-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingProject}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-md shadow-primary/25 transition disabled:opacity-60"
                >
                  {creatingProject ? 'Publishing Showcase...' : `Publish Project (${mediaItems.length} Files)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STANDALONE ADD MEDIA VIA URL MODAL */}
      {showStandaloneUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">Add Video or Media via URL</h3>
              <button
                onClick={() => setShowStandaloneUrlModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Media URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=... or https://.../video.mp4"
                  value={standaloneUrl}
                  onChange={(e) => setStandaloneUrl(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-navy outline-none"
                />
                <p className="text-[10px] text-muted mt-1">
                  Supports YouTube, Vimeo, MP4 video links, and web photos.
                </p>
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Sangeet Highlight Reel"
                  value={standaloneTitle}
                  onChange={(e) => setStandaloneTitle(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-navy outline-none"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Media Type</label>
                <select
                  value={standaloneMediaType}
                  onChange={(e) => setStandaloneMediaType(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-navy outline-none"
                >
                  <option value="AUTO">Auto Detect (Video / Photo)</option>
                  <option value="VIDEO">Video</option>
                  <option value="IMAGE">Photo</option>
                </select>
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowStandaloneUrlModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddStandaloneMedia}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition"
                >
                  Add to Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROJECT SHOWCASE DETAIL MODAL */}
      {selectedProjectShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-navy/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-5 sm:p-7 space-y-5 my-auto max-h-[92vh] overflow-y-auto animate-[pop_.18s_ease-out]">
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold bg-primary text-white px-2.5 py-0.5 rounded-md">
                    {selectedProjectShowcase.eventType}
                  </span>
                  <span className="text-[10px] font-bold bg-lavender text-navy px-2.5 py-0.5 rounded-md">
                    {selectedProjectShowcase.style}
                  </span>
                  <span className="text-[11px] text-muted inline-flex items-center gap-1">
                    <Icon name="mapPin" size={12} className="text-muted" /> {selectedProjectShowcase.location?.venue || 'Venue'},{' '}
                    {selectedProjectShowcase.location?.city || city}
                  </span>
                </div>
                <h3 className="font-extrabold text-xl text-navy">
                  {selectedProjectShowcase.projectName}
                </h3>
                {selectedProjectShowcase.description && (
                  <p className="text-xs text-muted max-w-2xl">
                    {selectedProjectShowcase.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedProjectShowcase(null)}
                className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* Sub-filter within project */}
            <input
              ref={projectFileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleUploadMoreToProject(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <button
                  onClick={() => setProjectDetailFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    projectDetailFilter === 'ALL' ? 'bg-primary text-white' : 'bg-lavender text-muted'
                  }`}
                >
                  All ({selectedProjectShowcase.items?.length || 0})
                </button>
                <button
                  onClick={() => setProjectDetailFilter('IMAGE')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition inline-flex items-center gap-1.5 ${
                    projectDetailFilter === 'IMAGE' ? 'bg-primary text-white' : 'bg-lavender text-muted'
                  }`}
                >
                  <Icon name="camera" size={12} />
                  Photos (
                  {
                    (selectedProjectShowcase.items || []).filter(
                      (i) => !isVideoUrl(i.url, i.mediaType)
                    ).length
                  }
                  )
                </button>
                <button
                  onClick={() => setProjectDetailFilter('VIDEO')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition inline-flex items-center gap-1.5 ${
                    projectDetailFilter === 'VIDEO' ? 'bg-primary text-white' : 'bg-lavender text-muted'
                  }`}
                >
                  <Icon name="video" size={12} />
                  Videos (
                  {
                    (selectedProjectShowcase.items || []).filter((i) =>
                      isVideoUrl(i.url, i.mediaType)
                    ).length
                  }
                  )
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs flex-wrap">
                <button
                  onClick={() => projectFileInputRef.current?.click()}
                  disabled={uploadingToCloudinary}
                  className="px-3 py-1.5 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <Icon name="upload" size={12} />
                  {uploadingToCloudinary ? `Uploading ${uploadProgress?.current || 1}/${uploadProgress?.total || 1}` : 'Upload More'}
                </button>
                <button
                  onClick={() => setShowProjectUrlInput((v) => !v)}
                  className="px-3 py-1.5 rounded-xl bg-lavender text-navy font-bold hover:bg-primary-soft inline-flex items-center gap-1.5"
                >
                  <Icon name="link" size={12} />
                  Add URL
                </button>
                <button
                  onClick={() => handleDeleteProject(selectedProjectShowcase.projectName)}
                  className="px-3 py-1.5 rounded-xl bg-red-50 text-red-700 font-bold hover:bg-red-100"
                >
                  Delete Project
                </button>
              </div>
            </div>

            {showProjectUrlInput && (
              <div className="rounded-2xl border border-gray-100 bg-lavender/40 p-3 space-y-2 text-xs">
                <div className="grid sm:grid-cols-[1fr_180px_120px_auto] gap-2">
                  <input
                    value={projectUrl}
                    onChange={(e) => setProjectUrl(e.target.value)}
                    placeholder="Paste YouTube, Vimeo, MP4, WebM, or image URL"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 font-medium text-navy outline-none focus:border-primary"
                  />
                  <input
                    value={projectUrlTitle}
                    onChange={(e) => setProjectUrlTitle(e.target.value)}
                    placeholder="Title"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 font-medium text-navy outline-none focus:border-primary"
                  />
                  <select
                    value={projectUrlType}
                    onChange={(e) => setProjectUrlType(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-navy outline-none focus:border-primary"
                  >
                    <option value="AUTO">Auto</option>
                    <option value="IMAGE">Photo</option>
                    <option value="VIDEO">Video</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddProjectUrlMedia}
                    className="rounded-xl bg-primary text-white px-4 py-2 font-bold hover:bg-primary-dark"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Media items gallery grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(selectedProjectShowcase.items || [])
                .filter((item) => {
                  if (projectDetailFilter === 'IMAGE') return !isVideoUrl(item.url, item.mediaType);
                  if (projectDetailFilter === 'VIDEO') return isVideoUrl(item.url, item.mediaType);
                  return true;
                })
                .map((item, idx) => {
                  const isVid = isVideoUrl(item.url, item.mediaType);

                  return (
                    <div
                      key={item._id || idx}
                      onClick={() => {
                        if (isVid) setActiveVideoModal({ url: item.url, title: item.title });
                        else setActivePhotoModal({ url: item.url, title: item.title });
                      }}
                      className="group relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-100 cursor-pointer hover:shadow-md transition"
                    >
                      <div className="relative aspect-4/3 overflow-hidden">
                        <img
                          src={getMediaThumbnail(item.url, item.mediaType, item.thumbnailUrl)}
                          alt={item.title}
                          onError={(e) => {
                            e.currentTarget.src = getMediaThumbnail('', item.mediaType);
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        {isVid && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition">
                            <span className="w-9 h-9 rounded-full bg-white text-navy grid place-items-center shadow-md">
                              <Icon name="play" size={12} className="fill-current translate-x-0.5" />
                            </span>
                          </div>
                        )}
                        <div className="absolute top-2 left-2">
                          <span
                            className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${
                              isVid ? 'bg-red-600 text-white' : 'bg-navy/80 text-white'
                            }`}
                          >
                            {isVid ? 'VIDEO' : 'PHOTO'}
                          </span>
                        </div>
                      </div>
                      <div className="p-2 bg-white space-y-2">
                        <div className="text-[11px] font-bold text-navy truncate">
                          {item.title}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isVid) setActiveVideoModal({ url: item.url, title: item.title });
                              else setActivePhotoModal({ url: item.url, title: item.title });
                            }}
                            className="flex-1 rounded-lg bg-lavender text-navy px-2 py-1 text-[10px] font-extrabold hover:bg-primary-soft"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(item._id);
                            }}
                            className="rounded-lg bg-red-50 text-red-700 px-2 py-1 text-[10px] font-extrabold hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE VIDEO PLAYER MODAL (YouTube, Vimeo, MP4) */}
      {activeVideoModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-[fade_.15s_ease-out]"
          onClick={() => setActiveVideoModal(null)}
        >
          <div
            className="relative w-full max-w-3xl bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 sm:p-4 bg-zinc-900/90 text-white border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-red-600 text-white font-bold px-2 py-0.5 rounded-md uppercase tracking-wider inline-flex items-center gap-1">
                  <Icon name="play" size={10} className="fill-current" /> Video
                </span>
                <h4 className="font-bold text-sm truncate max-w-[280px] sm:max-w-md">
                  {activeVideoModal.title || 'Video Showcase'}
                </h4>
              </div>
              <button
                onClick={() => setActiveVideoModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center font-bold text-sm transition"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="aspect-16/9 bg-black flex items-center justify-center">
              {getYouTubeId(activeVideoModal.url) ? (
                <iframe
                  src={`https://www.youtube.com/embed/${getYouTubeId(activeVideoModal.url)}?autoplay=1`}
                  title={activeVideoModal.title || 'YouTube video'}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : getVimeoId(activeVideoModal.url) ? (
                <iframe
                  src={`https://player.vimeo.com/video/${getVimeoId(activeVideoModal.url)}?autoplay=1`}
                  title={activeVideoModal.title || 'Vimeo video'}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  src={activeVideoModal.url}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="p-3 bg-zinc-900 text-xs text-white/70 flex items-center justify-between">
              <span className="truncate max-w-sm">{activeVideoModal.url}</span>
              <span className="text-[11px] text-primary font-bold">Aura+ 4K Playback</span>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PHOTO LIGHTBOX */}
      {activePhotoModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-[fade_.15s_ease-out]"
          onClick={() => setActivePhotoModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActivePhotoModal(null)}
              className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white grid place-items-center transition shadow-md"
              aria-label="Close"
            >
              <Icon name="close" size={16} />
            </button>
            <img
              src={activePhotoModal.url}
              alt={activePhotoModal.title || 'Showcase Photo'}
              className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
            {activePhotoModal.title && (
              <div className="mt-2 text-white/90 font-bold text-xs bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-xs">
                {activePhotoModal.title}
              </div>
            )}
          </div>
        </div>
      )}

    </Page>
  );
}
