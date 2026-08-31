const CURRENT_YEAR = new Date().getFullYear();

export const GENRES_MOVIE = [
  { id: "", label: "All Genres" },
  { id: "28", label: "Action" },
  { id: "12", label: "Adventure" },
  { id: "16", label: "Animation" },
  { id: "35", label: "Comedy" },
  { id: "80", label: "Crime" },
  { id: "99", label: "Documentary" },
  { id: "18", label: "Drama" },
  { id: "10751", label: "Family" },
  { id: "14", label: "Fantasy" },
  { id: "36", label: "History" },
  { id: "27", label: "Horror" },
  { id: "10402", label: "Music" },
  { id: "9648", label: "Mystery" },
  { id: "10749", label: "Romance" },
  { id: "878", label: "Sci-Fi" },
  { id: "53", label: "Thriller" },
  { id: "10752", label: "War" },
  { id: "37", label: "Western" },
];

export const GENRES_TV = [
  { id: "", label: "All Genres" },
  { id: "10759", label: "Action & Adventure" },
  { id: "16", label: "Animation" },
  { id: "35", label: "Comedy" },
  { id: "80", label: "Crime" },
  { id: "99", label: "Documentary" },
  { id: "18", label: "Drama" },
  { id: "10751", label: "Family" },
  { id: "10762", label: "Kids" },
  { id: "9648", label: "Mystery" },
  { id: "10764", label: "Reality" },
  { id: "10765", label: "Sci-Fi & Fantasy" },
  { id: "10766", label: "Soap" },
  { id: "10768", label: "War & Politics" },
  { id: "37", label: "Western" },
];

export const LANGUAGES = [
  { code: "", label: "All Languages" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "hi", label: "Hindi" },
  { code: "zh", label: "Chinese" },
  { code: "tr", label: "Turkish" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "ru", label: "Russian" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
];

export const YEARS = [
  { value: "", label: "All Years" },
  ...Array.from({ length: CURRENT_YEAR - 1979 }, (_, i) => {
    const y = CURRENT_YEAR - i;
    return { value: String(y), label: String(y) };
  }),
];