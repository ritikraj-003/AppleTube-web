/**
 * Aura Music - Global Configuration & YouTube Database Mirrors
 */

export const CONFIG = {
  APP_NAME: 'AppleTube',
  VERSION: '1.2.0',

  // Google OAuth 2.0 Web Client ID
  // Configure in Google Cloud Console (https://console.cloud.google.com/apis/credentials)
  // Ensure Authorized JavaScript origins includes: http://localhost:3000
  GOOGLE_CLIENT_ID: '',

  // High-availability public Invidious API instances for YouTube Database Search & Streaming
  YOUTUBE_INVIDIOUS_MIRRORS: [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.jing.rocks',
    'https://invidious.privacydev.net',
    'https://yt.artemislena.eu',
    'https://invidious.protokolla.fi'
  ],

  // Piped API instances for YouTube streams
  YOUTUBE_PIPED_MIRRORS: [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://api.piped.privacydev.net'
  ],

  // Secondary JioSaavn API Mirrors (Indian & Global Pop)
  SAAVN_API_MIRRORS: [
    'https://saavn.dev/api',
    'https://jiosavan-api-eta.vercel.app',
    'https://saavn-api.vercel.app',
    'https://jiosaavn-api-privateing-git-master-sakshamarora1.vercel.app'
  ],

  // Audius Public API Mirrors
  AUDIUS_API_MIRRORS: [
    'https://discoveryprovider.audius.co/v1',
    'https://audius-discovery-1.cultur3stake.com/v1',
    'https://audius-dp.amsterdam.creatorseed.com/v1'
  ],

  // Radio Browser Public API Mirrors
  RADIO_API_MIRRORS: [
    'https://de1.api.radio-browser.info/json',
    'https://nl1.api.radio-browser.info/json',
    'https://at1.api.radio-browser.info/json'
  ],

  // Default Categories / Genres
  GENRES: [
    { id: 'all', name: 'All' },
    { id: 'bollywood', name: 'Bollywood' },
    { id: 'punjabi', name: 'Punjabi Hits' },
    { id: 'pop', name: 'Global Pop' },
    { id: 'lofi', name: 'Lo-Fi Chill' },
    { id: 'hiphop', name: 'Hip Hop & Rap' },
    { id: 'electronic', name: 'EDM & Dance' },
    { id: 'radio', name: 'Live Radio' }
  ],

  // High-Quality Curated Instant Tracks (Immediate fallback)
  CURATED_TRACKS: [
    {
      id: 'curated_1',
      title: 'Midnight City Lights',
      artist: 'Kavv',
      album: 'Neon Horizons',
      duration: 184,
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      source: 'Aura Studio',
      lyrics: "[00:00.00]Instrumental Ambient Lo-Fi Intro\n[00:15.00]Soft warm chords drift through the neon haze\n[00:32.00]City lights reflect upon the quiet streets\n[00:50.00]Subtle beats keeping steady tempo in the night\n[01:15.00]Lost in thoughts between shadows and dreams\n[01:40.00]The midnight breeze carries sweet melodies\n[02:10.00]Calm peace settling in until dawn"
    },
    {
      id: 'curated_2',
      title: 'Coffee Beans & Raindrops',
      artist: 'Aura Collective',
      album: 'Cozy Morning Sessions',
      duration: 145,
      image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
      source: 'Aura Studio',
      lyrics: "[00:00.00]Gentle raindrops tapping on the windowpane\n[00:20.00]Warm coffee aroma filling up the room\n[00:42.00]Flipping pages of a notebook from the past\n[01:05.00]Time slows down when you just breathe\n[01:30.00]Peaceful morning, peaceful mind"
    },
    {
      id: 'curated_3',
      title: 'Retro Sunset Drive',
      artist: 'HyperDrive',
      album: 'Outrun 84',
      duration: 198,
      image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3',
      source: 'Aura Studio',
      lyrics: "[00:00.00]Analog synthesizers warming the air\n[00:24.00]Driving towards the purple horizon line\n[00:48.00]Feel the bassline thumping under the dash\n[01:12.00]Speeding along the coast with the top down\n[01:36.00]No rearview mirrors, just moving forward\n[02:00.00]Retro synthwave pulse through the sunset"
    },
    {
      id: 'curated_4',
      title: 'Acoustic Morning Breeze',
      artist: 'Julian Hayes',
      album: 'Wooden Strings',
      duration: 162,
      image: 'https://images.unsplash.com/photo-1445985543470-41f30c08f107?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=acoustic-guitars-ambient-uplifting-11219.mp3',
      source: 'Aura Studio',
      lyrics: "[00:00.00]Acoustic guitar gentle fingerpicking\n[00:18.00]Sunlight filtering through green canopy leaves\n[00:38.00]A fresh new day begins with ease\n[01:02.00]Harmonies echoing through the quiet valley\n[01:25.00]Uplifting spirits with every note"
    },
    {
      id: 'curated_5',
      title: 'Deep Focus & Flow',
      artist: 'NeuroWave',
      album: 'Mind State Alpha',
      duration: 215,
      image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3?filename=tuesday-glitch-lofi-124479.mp3',
      source: 'Aura Studio',
      lyrics: "[00:00.00]Binaural deep ambient background\n[00:30.00]Zero distractions, enter the deep work zone\n[01:00.00]Steady rhythmic pulse guiding thoughts\n[01:30.00]Clarity and focus in motion\n[02:00.00]Flow state unlocked"
    },
    {
      id: 'curated_6',
      title: 'Cosmic Cyberpunk Beat',
      artist: 'Starlight X',
      album: 'Galactic Drift',
      duration: 176,
      image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80',
      audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1101.mp3?filename=electronic-future-beats-117997.mp3',
      source: 'Aura Studio',
      lyrics: "[00:00.00]Glitch rhythms echoing across space\n[00:25.00]Electronic arpeggios dancing on satellites\n[00:50.00]Bass drop shaking the asteroid fields\n[01:20.00]Floating through the Andromeda nebula\n[01:50.00]Interstellar energy never fades"
    }
  ],

  // Live Internet Radio Stations
  CURATED_RADIO: [
    {
      id: 'radio_1',
      title: 'Lofi Girl 24/7 Stream',
      artist: 'Lofi Girl Radio',
      album: 'Live Radio Station',
      duration: 0,
      isLive: true,
      image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80',
      audioUrl: 'https://play.streamafrica.net/lofiradio',
      source: 'Live Radio'
    },
    {
      id: 'radio_2',
      title: 'Chillout Lounge FM',
      artist: 'Lounge FM World',
      album: 'Live Radio Station',
      duration: 0,
      isLive: true,
      image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80',
      audioUrl: 'https://cast1.torontocast.com:2160/stream',
      source: 'Live Radio'
    },
    {
      id: 'radio_3',
      title: 'Bollywood Hits Radio',
      artist: 'Radio Mirchi Desi Hits',
      album: 'Live Radio Station',
      duration: 0,
      isLive: true,
      image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&q=80',
      audioUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
      source: 'Live Radio'
    },
    {
      id: 'radio_4',
      title: 'Classic Rock HD',
      artist: 'Rock Classics FM',
      album: 'Live Radio Station',
      duration: 0,
      isLive: true,
      image: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=500&q=80',
      audioUrl: 'https://stream.zeno.fm/4vvyqqumdg8uv',
      source: 'Live Radio'
    }
  ]
};
