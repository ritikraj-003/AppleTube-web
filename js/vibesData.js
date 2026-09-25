/**
 * AppleTube - Vibes & Mood Data & Music Discovery Engine
 * Categorized into distinct Emotional Moods and Situational Vibes.
 */

import { api } from './api.js';
import { CONFIG } from './config.js';
import { OVERALL_TRAVEL_SONGS, CATEGORY_SONGS } from './travelData.js';
import { SLEEP_TRACKS } from './sleepData.js';

export const MOOD_CATEGORIES = [
  {
    id: 'romantic',
    name: 'Romantic',
    tagline: 'Love & soft melodies',
    emoji: '❤️',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.28), rgba(244, 63, 94, 0.1))',
    glow: 'rgba(236, 72, 153, 0.35)',
    query: 'romantic love songs bollywood acoustic hindi'
  },
  {
    id: 'happy',
    name: 'Happy',
    tagline: 'Upbeat, feel good & joyful',
    emoji: '😊',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(234, 88, 12, 0.1))',
    glow: 'rgba(245, 158, 11, 0.35)',
    query: 'happy upbeat celebration feel good bollywood songs'
  },
  {
    id: 'chill',
    name: 'Chill',
    tagline: 'Relax, calm & lo-fi beats',
    emoji: '😌',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.28), rgba(20, 184, 166, 0.1))',
    glow: 'rgba(16, 185, 129, 0.35)',
    query: 'chill lofi relaxing acoustic peaceful songs hindi'
  },
  {
    id: 'sad',
    name: 'Sad',
    tagline: 'Melancholy, heartbreak & emotions',
    emoji: '💔',
    color: '#60a5fa',
    gradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.28), rgba(99, 102, 241, 0.1))',
    glow: 'rgba(96, 165, 250, 0.35)',
    query: 'sad emotional heartbreak slow acoustic songs hindi'
  },
  {
    id: 'energetic',
    name: 'Energetic',
    tagline: 'High energy, gym & workout',
    emoji: '🔥',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.28), rgba(168, 85, 247, 0.1))',
    glow: 'rgba(139, 92, 246, 0.35)',
    query: 'energetic workout gym motivation bass boosted songs'
  },
  {
    id: 'peaceful',
    name: 'Peaceful',
    tagline: 'Serene, meditation & calm healing',
    emoji: '🧘',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.28), rgba(59, 130, 246, 0.1))',
    glow: 'rgba(6, 182, 212, 0.35)',
    query: 'peaceful calm acoustic meditation soft healing instrumental'
  },
  {
    id: 'sleepy',
    name: 'Sleepy',
    tagline: 'Soft lullabies & bedtime ambient',
    emoji: '🌙',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.28), rgba(30, 27, 75, 0.45))',
    glow: 'rgba(99, 102, 241, 0.35)',
    query: 'Hindi Bollywood sleep lofi chill night ambient songs'
  },
  {
    id: 'feelgood',
    name: 'Feel Good',
    tagline: 'Positive vibes & cheerful grooves',
    emoji: '😎',
    color: '#eab308',
    gradient: 'linear-gradient(135deg, rgba(234, 179, 8, 0.28), rgba(245, 158, 11, 0.1))',
    glow: 'rgba(234, 179, 8, 0.35)',
    query: 'feel good positive happy sunshine pop hits hindi'
  }
];

export const VIBE_CATEGORIES = [
  {
    id: 'road_trip',
    name: 'Road Trip',
    tagline: 'Scenic highways & adventure journeys',
    emoji: '🚗',
    color: '#f97316',
    gradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.28), rgba(239, 68, 68, 0.1))',
    glow: 'rgba(249, 115, 22, 0.35)',
    query: 'road trip traveling journey adventure travel songs bollywood'
  },
  {
    id: 'late_night_drive',
    name: 'Late Night Drive',
    tagline: 'Midnight city lights & bass vibes',
    emoji: '🌃',
    color: '#818cf8',
    gradient: 'linear-gradient(135deg, rgba(129, 140, 248, 0.28), rgba(15, 23, 42, 0.6))',
    glow: 'rgba(129, 140, 248, 0.35)',
    query: 'late night drive slowed reverb midnight bass songs hindi'
  },
  {
    id: 'coffee_chill',
    name: 'Coffee & Chill',
    tagline: 'Acoustic cafe vibes & cozy sips',
    emoji: '☕',
    color: '#d97706',
    gradient: 'linear-gradient(135deg, rgba(217, 119, 6, 0.28), rgba(120, 53, 15, 0.25))',
    glow: 'rgba(217, 119, 6, 0.35)',
    query: 'coffee shop acoustic cafe chill cozy relaxing songs'
  },
  {
    id: 'deep_focus',
    name: 'Deep Focus',
    tagline: 'Lo-fi study, coding & concentration',
    emoji: '🎧',
    color: '#0284c7',
    gradient: 'linear-gradient(135deg, rgba(2, 132, 199, 0.28), rgba(15, 23, 42, 0.5))',
    glow: 'rgba(2, 132, 199, 0.35)',
    query: 'lofi study beats deep focus instrumental coding concentration'
  },
  {
    id: 'rainy_evening',
    name: 'Rainy Evening',
    tagline: 'Cozy raindrops & monsoon melodies',
    emoji: '🌧️',
    color: '#64748b',
    gradient: 'linear-gradient(135deg, rgba(100, 116, 139, 0.28), rgba(30, 41, 59, 0.6))',
    glow: 'rgba(100, 116, 139, 0.35)',
    query: 'rainy day barish monsoon romantic songs hindi lofi'
  },
  {
    id: 'morning_fresh',
    name: 'Morning Fresh',
    tagline: 'Sunrise acoustic & morning inspiration',
    emoji: '🌅',
    color: '#fb923c',
    gradient: 'linear-gradient(135deg, rgba(251, 146, 60, 0.28), rgba(56, 189, 248, 0.1))',
    glow: 'rgba(251, 146, 60, 0.35)',
    query: 'peaceful morning sunrise acoustic fresh positive songs hindi'
  },
  {
    id: 'party_club',
    name: 'Party & Club',
    tagline: 'Dance hits, remixes & festival energy',
    emoji: '🎉',
    color: '#d946ef',
    gradient: 'linear-gradient(135deg, rgba(217, 70, 239, 0.28), rgba(139, 92, 246, 0.12))',
    glow: 'rgba(217, 70, 239, 0.35)',
    query: 'party dance club remix bollywood party all night songs'
  },
  {
    id: 'nostalgic',
    name: 'Nostalgic',
    tagline: 'Golden retro & timeless memories',
    emoji: '💭',
    color: '#b45309',
    gradient: 'linear-gradient(135deg, rgba(180, 83, 9, 0.28), rgba(67, 56, 202, 0.1))',
    glow: 'rgba(180, 83, 9, 0.35)',
    query: '90s 2000s golden oldies nostalgic retro bollywood hits'
  }
];

/**
 * Fetch and return de-duplicated, freshly ranked songs for a selected mood or vibe category.
 * Integrates with curated travel / sleep data and live InnerTube catalog.
 * Avoids same-song repetition by penalizing tracks in session history.
 */
export async function getVibesSongs(category, sessionHistory = []) {
  if (!category) return [];

  const results = [];
  const seenIds = new Set();
  const historySet = new Set(sessionHistory.map(item => {
    if (!item) return '';
    if (typeof item === 'string') return item.toLowerCase();
    return String(item.id || item.videoId || item.title || '').toLowerCase();
  }).filter(Boolean));

  // 1. Include curated base tracks where appropriate
  if (category.id === 'road_trip') {
    OVERALL_TRAVEL_SONGS.forEach(t => {
      const key = (t.videoId || t.id || t.title).toLowerCase();
      if (!seenIds.has(key)) {
        seenIds.add(key);
        results.push({ ...t, mood: 'travel' });
      }
    });
  } else if (category.id === 'sleepy') {
    SLEEP_TRACKS.forEach(t => {
      const key = (t.videoId || t.id || t.title).toLowerCase();
      if (!seenIds.has(key)) {
        seenIds.add(key);
        results.push({ ...t, mood: 'chill' });
      }
    });
  }

  // 2. Fetch live songs from YouTube / InnerTube catalog
  try {
    const liveTracks = await api.searchSongs(category.query, 30);
    if (Array.isArray(liveTracks) && liveTracks.length > 0) {
      for (const t of liveTracks) {
        const vid = (t.videoId || t.id || '').toLowerCase();
        const titleKey = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!vid || seenIds.has(vid) || seenIds.has(titleKey)) continue;

        seenIds.add(vid);
        if (titleKey) seenIds.add(titleKey);

        t.mood = category.id;
        t.category = category.id;
        results.push(t);
      }
    }
  } catch (err) {
    console.warn('[Vibes] Live search failed, using fallback:', err);
  }

  // 3. Fallback to curated collections if live search returned nothing
  if (results.length === 0) {
    const curatedFallbacks = {
      romantic: [
        { id: 'rom_1', title: 'Khaabon Ke Parinday', artist: 'Mohit Chauhan', album: 'ZNMD', duration: 253, image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80', audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3', source: 'Curated Mood' },
        { id: 'rom_2', title: 'Tum Se Hi', artist: 'Mohit Chauhan', album: 'Jab We Met', duration: 320, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80', audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3', source: 'Curated Mood' },
        ...(CATEGORY_SONGS.chill_travel || [])
      ],
      late_night_drive: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[2], CONFIG.CURATED_TRACKS[0]] : []),
        ...(CATEGORY_SONGS.night_drive || [])
      ],
      coffee_chill: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[1]] : []),
        ...(CATEGORY_SONGS.chill_travel || [])
      ],
      deep_focus: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[4]] : []),
        ...SLEEP_TRACKS.slice(0, 5)
      ],
      rainy_evening: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[1]] : []),
        ...(CATEGORY_SONGS.chill_travel || [])
      ],
      morning_fresh: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[3]] : []),
        ...OVERALL_TRAVEL_SONGS.slice(0, 5)
      ],
      party_club: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[5]] : [])
      ],
      happy: [
        ...OVERALL_TRAVEL_SONGS.slice(0, 6)
      ],
      chill: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[0]] : []),
        ...SLEEP_TRACKS.slice(0, 5)
      ],
      sad: [
        ...(CATEGORY_SONGS.solo_travel || [])
      ],
      energetic: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[5]] : [])
      ],
      peaceful: [
        ...(CONFIG.CURATED_TRACKS ? [CONFIG.CURATED_TRACKS[3]] : []),
        ...SLEEP_TRACKS.slice(0, 5)
      ],
      sleepy: [
        ...SLEEP_TRACKS
      ],
      feelgood: [
        ...OVERALL_TRAVEL_SONGS.slice(0, 6)
      ]
    };

    const fallbackList = curatedFallbacks[category.id] || OVERALL_TRAVEL_SONGS;
    fallbackList.forEach(t => {
      const vid = (t.videoId || t.id || '').toLowerCase();
      if (vid && !seenIds.has(vid)) {
        seenIds.add(vid);
        results.push({ ...t, mood: category.id, category: category.id });
      }
    });
  }

  // 4. Avoid same-song repetition: move already heard session songs to the end
  if (historySet.size > 0) {
    results.sort((a, b) => {
      const aSeen = historySet.has(String(a.id).toLowerCase()) || historySet.has(String(a.videoId).toLowerCase());
      const bSeen = historySet.has(String(b.id).toLowerCase()) || historySet.has(String(b.videoId).toLowerCase());
      if (aSeen && !bSeen) return 1;
      if (!aSeen && bSeen) return -1;
      return 0;
    });
  }

  return results.slice(0, 30);
}
