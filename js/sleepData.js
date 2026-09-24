export const SLEEP_FILTERS = [
  { id: 'all', label: 'All Lo-Fi', query: 'Bollywood Hindi love sad lo-fi chill songs' },
  { id: 'love', label: 'Love Lo-Fi', query: 'Hindi Bollywood love lo-fi chill playlist' },
  { id: 'sad', label: 'Sad & Emotional', query: 'Hindi sad lo-fi broken heart acoustic songs' },
  { id: 'slowed', label: 'Slowed + Reverb', query: 'Hindi hits slowed reverb late night playlist' },
  { id: 'midnight', label: 'Midnight Acoustic', query: 'Hindi midnight acoustic lo-fi love songs' }
];

const artwork = [
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900&q=85',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=85',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=900&q=85',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=900&q=85',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=85'
];

const tracks = [
  ['Kesariya (Lo-Fi Chill)', 'Arijit Singh', 'Brahmastra', 'love'],
  ['Shayad (Slowed & Reverb)', 'Arijit Singh', 'Love Aaj Kal', 'slowed'],
  ['Agar Tum Saath Ho (Late Night Lo-Fi)', 'Alka Yagnik, Arijit Singh', 'Tamasha', 'sad'],
  ['Channa Mereya (Acoustic Lo-Fi)', 'Arijit Singh', 'Ae Dil Hai Mushkil', 'sad'],
  ['Tujhe Kitna Chahne Lage (Lo-Fi Flip)', 'Arijit Singh', 'Kabir Singh', 'love'],
  ['Kabira (Acoustic Night Lo-Fi)', 'Tochi Raina, Rekha Bhardwaj', 'Yeh Jawaani Hai Deewani', 'midnight'],
  ['Tera Ban Jaunga (Lo-Fi Mix)', 'Akhil Sachdeva, Tulsi Kumar', 'Kabir Singh', 'love'],
  ['Raataan Lambiyan (Lofi Chillhop)', 'Jubin Nautiyal, Asees Kaur', 'Shershaah', 'love'],
  ['Apna Bana Le (Midnight Lo-Fi)', 'Arijit Singh', 'Bhediya', 'midnight'],
  ['Phir Kabhi (Lo-Fi Version)', 'Arijit Singh', 'M.S. Dhoni', 'sad'],
  ['Tum Se Hi (Lo-Fi Acoustic)', 'Mohit Chauhan', 'Jab We Met', 'midnight'],
  ['Hasi Ban Gaye (Slowed & Reverb)', 'Ami Mishra, Shreya Ghoshal', 'Hamari Adhuri Kahani', 'slowed'],
  ['Jeena Jeena (Chill Lo-Fi)', 'Atif Aslam', 'Badlapur', 'love'],
  ['Khairiyat (Sad Lo-Fi)', 'Arijit Singh', 'Chhichhore', 'sad'],
  ['Kalank (Lo-Fi Ambient)', 'Arijit Singh', 'Kalank', 'midnight'],
  ['Iktara (Midnight Lo-Fi)', 'Kavita Seth', 'Wake Up Sid', 'midnight'],
  ['Hawayein (Slowed Night Mix)', 'Arijit Singh', 'Jab Harry Met Sejal', 'slowed'],
  ['Samjhawan (Sad Acoustic Lo-Fi)', 'Arijit Singh, Shreya Ghoshal', 'Humpty Sharma Ki Dulhania', 'sad'],
  ['Maan Meri Jaan (Lo-Fi Chill)', 'King', 'Indie Hindi', 'love'],
  ['Heeriye (Midnight Lo-Fi)', 'Jasleen Royal, Arijit Singh', 'Indie Hindi', 'midnight'],
  ['O Maahi (Slowed + Reverb)', 'Arijit Singh', 'Dunki', 'slowed'],
  ['Satranga (Sad Lo-Fi)', 'Arijit Singh', 'Animal', 'sad'],
  ['Husn (Acoustic Lo-Fi)', 'Anuv Jain', 'Indie Hindi', 'love'],
  ['Tere Vaaste (Lo-Fi Chill)', 'Varun Jain, Shadab Faridi', 'Zara Hatke Zara Bachke', 'love']
];

export const SLEEP_TRACKS = tracks.map(([title, artist, album, category], index) => ({
  id: `sleep_${index + 1}`,
  title,
  artist,
  album,
  category,
  duration: 210,
  image: artwork[index % artwork.length],
  audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
  source: 'Hindi Lo-Fi Nights',
  searchQuery: `${title} ${artist}`
}));

export function getSleepTracks(filterId = 'all') {
  if (filterId === 'all') return SLEEP_TRACKS;
  return SLEEP_TRACKS.filter(track => track.category === filterId);
}
