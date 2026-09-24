/**
 * AppleTube - Curated Traveling Vibes Music Data & Recommendation Fallback Engine
 * Strictly text-based metadata with zero emojis.
 */

export const TRAVEL_CATEGORIES = [
  { id: 'road_trip', name: 'Road Trip' },
  { id: 'mountain_journey', name: 'Mountain Journey' },
  { id: 'chill_travel', name: 'Chill Travel' },
  { id: 'night_drive', name: 'Night Drive' },
  { id: 'long_drive', name: 'Long Drive' },
  { id: 'solo_travel', name: 'Solo Travel' }
];

export const OVERALL_TRAVEL_SONGS = [
  {
    id: 'travel_1',
    title: 'Ilahi',
    artist: 'Arijit Singh',
    album: 'Yeh Jawaani Hai Deewani',
    duration: 229,
    image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
    source: 'Traveling Vibes',
    category: 'road_trip',
    searchQuery: 'Ilahi Arijit Singh Yeh Jawaani Hai Deewani'
  },
  {
    id: 'travel_2',
    title: 'Phir Se Ud Chala',
    artist: 'Mohit Chauhan',
    album: 'Rockstar',
    duration: 271,
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
    source: 'Traveling Vibes',
    category: 'mountain_journey',
    searchQuery: 'Phir Se Ud Chala Mohit Chauhan Rockstar'
  },
  {
    id: 'travel_3',
    title: 'Khaabon Ke Parinday',
    artist: 'Alyssa Mendonsa, Mohit Chauhan',
    album: 'Zindagi Na Milegi Dobara',
    duration: 253,
    image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    source: 'Traveling Vibes',
    category: 'chill_travel',
    searchQuery: 'Khaabon Ke Parinday Zindagi Na Milegi Dobara'
  },
  {
    id: 'travel_4',
    title: 'Yun Hi Chala Chal',
    artist: 'Udit Narayan, Hariharan, Kailash Kher',
    album: 'Swades',
    duration: 448,
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
    source: 'Traveling Vibes',
    category: 'long_drive',
    searchQuery: 'Yun Hi Chala Chal Udit Narayan Swades'
  },
  {
    id: 'travel_5',
    title: 'Roobaroo',
    artist: 'A.R. Rahman, Naresh Iyer',
    album: 'Rang De Basanti',
    duration: 283,
    image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
    source: 'Traveling Vibes',
    category: 'solo_travel',
    searchQuery: 'Roobaroo AR Rahman Rang De Basanti'
  },
  {
    id: 'travel_6',
    title: 'Chota Sa Fasana',
    artist: 'Arijit Singh',
    album: 'Karwaan',
    duration: 177,
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
    source: 'Traveling Vibes',
    category: 'road_trip',
    searchQuery: 'Chota Sa Fasana Arijit Singh Karwaan'
  },
  {
    id: 'travel_7',
    title: 'Matargashti',
    artist: 'Mohit Chauhan',
    album: 'Tamasha',
    duration: 328,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
    source: 'Traveling Vibes',
    category: 'road_trip',
    searchQuery: 'Matargashti Mohit Chauhan Tamasha'
  },
  {
    id: 'travel_8',
    title: 'Patakha Guddi',
    artist: 'Nooran Sisters, A.R. Rahman',
    album: 'Highway',
    duration: 284,
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
    source: 'Traveling Vibes',
    category: 'solo_travel',
    searchQuery: 'Patakha Guddi Nooran Sisters Highway'
  },
  {
    id: 'travel_9',
    title: 'Challa',
    artist: 'A.R. Rahman, Rabbi Shergill',
    album: 'Jab Tak Hai Jaan',
    duration: 320,
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
    source: 'Traveling Vibes',
    category: 'solo_travel',
    searchQuery: 'Challa Rabbi Shergill Jab Tak Hai Jaan'
  },
  {
    id: 'travel_10',
    title: 'Safarnama',
    artist: 'Lucky Ali',
    album: 'Tamasha',
    duration: 251,
    image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    source: 'Traveling Vibes',
    category: 'solo_travel',
    searchQuery: 'Safarnama Lucky Ali Tamasha'
  },
  {
    id: 'travel_11',
    title: 'Dil Chahta Hai',
    artist: 'Shankar Mahadevan',
    album: 'Dil Chahta Hai',
    duration: 311,
    image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
    source: 'Traveling Vibes',
    category: 'road_trip',
    searchQuery: 'Dil Chahta Hai Shankar Mahadevan'
  },
  {
    id: 'travel_12',
    title: 'Hairat',
    artist: 'Lucky Ali',
    album: 'Anjaana Anjaani',
    duration: 259,
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
    source: 'Traveling Vibes',
    category: 'chill_travel',
    searchQuery: 'Hairat Lucky Ali Anjaana Anjaani'
  }
];

export const CATEGORY_SONGS = {
  road_trip: [
    ...OVERALL_TRAVEL_SONGS.filter(s => s.category === 'road_trip'),
    {
      id: 'travel_rt_1',
      title: 'Hum Kis Gali Ja Rahe Hai',
      artist: 'Atif Aslam',
      album: 'Doorie',
      duration: 302,
      image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'road_trip',
      searchQuery: 'Hum Kis Gali Ja Rahe Hai Atif Aslam'
    },
    {
      id: 'travel_rt_2',
      title: 'Sooraj Ki Baahon Mein',
      artist: 'Loy Mendonsa, Dominique Cerejo, Clinton Cerejo',
      album: 'Zindagi Na Milegi Dobara',
      duration: 204,
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
      source: 'Traveling Vibes',
      category: 'road_trip',
      searchQuery: 'Sooraj Ki Baahon Mein Zindagi Na Milegi Dobara'
    },
    {
      id: 'travel_rt_3',
      title: 'Aao Milo Chalo',
      artist: 'Shaan, Ustad Sultan Khan',
      album: 'Jab We Met',
      duration: 338,
      image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
      source: 'Traveling Vibes',
      category: 'road_trip',
      searchQuery: 'Aao Milo Chalo Jab We Met'
    }
  ],

  mountain_journey: [
    ...OVERALL_TRAVEL_SONGS.filter(s => s.category === 'mountain_journey'),
    {
      id: 'travel_mj_1',
      title: 'Subhanallah',
      artist: 'Sreerama Chandra, Shilpa Rao',
      album: 'Yeh Jawaani Hai Deewani',
      duration: 249,
      image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      source: 'Traveling Vibes',
      category: 'mountain_journey',
      searchQuery: 'Subhanallah Yeh Jawaani Hai Deewani'
    },
    {
      id: 'travel_mj_2',
      title: 'Kyon',
      artist: 'Papon, Sunidhi Chauhan',
      album: 'Barfi!',
      duration: 266,
      image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
      source: 'Traveling Vibes',
      category: 'mountain_journey',
      searchQuery: 'Kyon Barfi Papon'
    },
    {
      id: 'travel_mj_3',
      title: 'Monta Re',
      artist: 'Swanand Kirkire, Amitabh Bhattacharya',
      album: 'Lootera',
      duration: 238,
      image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'mountain_journey',
      searchQuery: 'Monta Re Lootera'
    },
    {
      id: 'travel_mj_4',
      title: 'Hawayein',
      artist: 'Arijit Singh',
      album: 'Jab Harry Met Sejal',
      duration: 290,
      image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      source: 'Traveling Vibes',
      category: 'mountain_journey',
      searchQuery: 'Hawayein Arijit Singh'
    }
  ],

  chill_travel: [
    ...OVERALL_TRAVEL_SONGS.filter(s => s.category === 'chill_travel'),
    {
      id: 'travel_ct_1',
      title: 'Sham',
      artist: 'Nikhil D’Souza, Amit Trivedi',
      album: 'Aisha',
      duration: 284,
      image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
      source: 'Traveling Vibes',
      category: 'chill_travel',
      searchQuery: 'Sham Aisha Nikhil DSouza'
    },
    {
      id: 'travel_ct_2',
      title: 'Der Lagi Lekin',
      artist: 'Shankar Mahadevan',
      album: 'Zindagi Na Milegi Dobara',
      duration: 357,
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'chill_travel',
      searchQuery: 'Der Lagi Lekin Zindagi Na Milegi Dobara'
    },
    {
      id: 'travel_ct_3',
      title: 'Iktara',
      artist: 'Kavita Seth, Amitabh Bhattacharya',
      album: 'Wake Up Sid',
      duration: 253,
      image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      source: 'Traveling Vibes',
      category: 'chill_travel',
      searchQuery: 'Iktara Wake Up Sid Kavita Seth'
    }
  ],

  night_drive: [
    {
      id: 'travel_nd_1',
      title: 'Beete Lamhein',
      artist: 'KK',
      album: 'The Train',
      duration: 331,
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
      source: 'Traveling Vibes',
      category: 'night_drive',
      searchQuery: 'Beete Lamhein KK The Train'
    },
    {
      id: 'travel_nd_2',
      title: 'Labon Ko',
      artist: 'KK',
      album: 'Bhool Bhulaiyaa',
      duration: 343,
      image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
      source: 'Traveling Vibes',
      category: 'night_drive',
      searchQuery: 'Labon Ko KK Bhool Bhulaiyaa'
    },
    {
      id: 'travel_nd_3',
      title: 'Tu Hi Meri Shab Hai',
      artist: 'KK',
      album: 'Gangster',
      duration: 388,
      image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1101.mp3?filename=electronic-future-beats-117997.mp3',
      source: 'Traveling Vibes',
      category: 'night_drive',
      searchQuery: 'Tu Hi Meri Shab Hai Gangster KK'
    },
    {
      id: 'travel_nd_4',
      title: 'Zara Sa',
      artist: 'KK, Pritam',
      album: 'Jannat',
      duration: 303,
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
      source: 'Traveling Vibes',
      category: 'night_drive',
      searchQuery: 'Zara Sa KK Jannat'
    },
    {
      id: 'travel_nd_5',
      title: 'Retro Sunset Drive',
      artist: 'HyperDrive',
      album: 'Outrun 84',
      duration: 198,
      image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
      source: 'Traveling Vibes',
      category: 'night_drive',
      searchQuery: 'Retro Sunset Drive Outrun Synthwave'
    }
  ],

  long_drive: [
    ...OVERALL_TRAVEL_SONGS.filter(s => s.category === 'long_drive'),
    {
      id: 'travel_ld_1',
      title: 'Kabira',
      artist: 'Tochi Raina, Rekha Bhardwaj',
      album: 'Yeh Jawaani Hai Deewani',
      duration: 223,
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'long_drive',
      searchQuery: 'Kabira Yeh Jawaani Hai Deewani'
    },
    {
      id: 'travel_ld_2',
      title: 'Tanha Dil',
      artist: 'Shaan',
      album: 'Tanha Dil',
      duration: 284,
      image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
      source: 'Traveling Vibes',
      category: 'long_drive',
      searchQuery: 'Tanha Dil Shaan'
    },
    {
      id: 'travel_ld_3',
      title: 'Musafir Hoon Yaaron',
      artist: 'Kishore Kumar, R.D. Burman',
      album: 'Parichay',
      duration: 279,
      image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'long_drive',
      searchQuery: 'Musafir Hoon Yaaron Kishore Kumar'
    },
    {
      id: 'travel_ld_4',
      title: 'Kun Faya Kun',
      artist: 'A.R. Rahman, Javed Ali, Mohit Chauhan',
      album: 'Rockstar',
      duration: 473,
      image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      source: 'Traveling Vibes',
      category: 'long_drive',
      searchQuery: 'Kun Faya Kun Rockstar AR Rahman'
    }
  ],

  solo_travel: [
    ...OVERALL_TRAVEL_SONGS.filter(s => s.category === 'solo_travel'),
    {
      id: 'travel_st_1',
      title: 'Journey Song',
      artist: 'Anupam Roy, Shreya Ghoshal',
      album: 'Piku',
      duration: 252,
      image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'solo_travel',
      searchQuery: 'Journey Song Piku Anupam Roy'
    },
    {
      id: 'travel_st_2',
      title: 'Yeh Dooriyan',
      artist: 'Mohit Chauhan',
      album: 'Love Aaj Kal',
      duration: 338,
      image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
      source: 'Traveling Vibes',
      category: 'solo_travel',
      searchQuery: 'Yeh Dooriyan Mohit Chauhan Love Aaj Kal'
    },
    {
      id: 'travel_st_3',
      title: 'Tu Kisi Rail Si',
      artist: 'Swanand Kirkire',
      album: 'Masaan',
      duration: 231,
      image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      source: 'Traveling Vibes',
      category: 'solo_travel',
      searchQuery: 'Tu Kisi Rail Si Masaan Swanand Kirkire'
    },
    {
      id: 'travel_st_4',
      title: 'Kinare',
      artist: 'Mohan Kannan',
      album: 'Queen',
      duration: 211,
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Traveling Vibes',
      category: 'solo_travel',
      searchQuery: 'Kinare Queen Mohan Kannan'
    }
  ]
};

/**
 * Multi-Tier Recommendation Fallback Engine for Traveling Vibes
 * @param {string|null} activeCategory Selected category ID (e.g. 'road_trip') or null
 * @param {object} userHistory StorageManager data (liked songs, recent songs)
 * @returns {Array} List of recommended tracks
 */
export function getSuggestedTravelSongs(activeCategory = null, userHistory = {}) {
  const basePool = activeCategory && CATEGORY_SONGS[activeCategory]
    ? CATEGORY_SONGS[activeCategory]
    : OVERALL_TRAVEL_SONGS;

  const likedTracks = userHistory.liked || [];
  const recentTracks = userHistory.recent || [];

  // 1. Personalized Recommendations: match liked or recent artists
  const favoriteArtists = new Set([
    ...likedTracks.map(t => (t.artist || '').toLowerCase()),
    ...recentTracks.map(t => (t.artist || '').toLowerCase())
  ]);

  const matched = [];
  const unmatched = [];

  basePool.forEach(song => {
    const artistLower = song.artist.toLowerCase();
    const isPreferred = Array.from(favoriteArtists).some(fav => fav && (artistLower.includes(fav) || fav.includes(artistLower)));
    if (isPreferred) {
      matched.push(song);
    } else {
      unmatched.push(song);
    }
  });

  // 2. Combine matched personal tracks with curated pool
  const results = [...matched, ...unmatched];

  // Return at least 6-8 tracks
  return results.length >= 6 ? results.slice(0, 8) : basePool;
}
