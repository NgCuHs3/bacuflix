import { getWatchHistory } from "./watch-history-service.js";
import { getFavorites } from "./favorites-service.js";
import { fetchGoogleSuggestions, extractKeywords } from "./google-trending-service.js";

const ML_INTERACTIONS_KEY = "kkphim_ml_interactions";
const ML_CACHE_KEY = "kkphim_ml_recommendations_cache";
const ML_CACHE_TTL_MS = 10 * 1000; // 10 seconds auto-refresh cycle
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days exponential time decay

const VIETNAMESE_STOPWORDS = new Set([
  "phim", "xem", "tap", "tập", "phan", "phần", "full", "hd", "fhd", "vietsub",
  "thuyet", "thuyết", "minh", "long", "lồng", "tieng", "tiếng", "cua", "của",
  "va", "và", "nhung", "những", "nguoi", "người", "trong", "ngoai", "ngoài",
  "cho", "voi", "với", "khi", "mot", "một", "hai", "ba", "bon", "nam", "sau",
  "bay", "tam", "chin", "muoi", "nam", "năm", "2020", "2021", "2022", "2023",
  "2024", "2025", "2026", "2027", "the", "of", "and", "in", "to", "a", "is",
  "season", "episode", "movie", "series", "online", "moi", "mới", "nhat", "nhất",
  "bo", "bộ", "le", "lẻ", "hay", "hot", "ung", "ứng", "con", "còn", "phu", "phút",
  "khong", "không", "duoc", "được", "den", "đến", "tu", "từ", "la", "là", "co", "có"
]);

// Keyword dictionary for Naive Bayes Latent Genre Classification
const GENRE_PRIORS_AND_KEYWORDS = [
  {
    slug: "hanh-dong",
    name: "Hành động",
    searchSeed: "hành động",
    keywords: [
      "hành động", "hanh dong", "võ thuật", "vo thuat", "đặc vụ", "dac vu",
      "sát thủ", "sat thu", "chiến", "chien", "truy sát", "truy sat", "biệt kích",
      "biet kich", "hình sự", "hinh su", "cảnh sát", "canh sat", "tội phạm", "toi pham",
      "băng đảng", "bang dang", "anh hùng", "anh hung", "iron man", "người sắt", "nguoi sat",
      "john wick", "fast", "mission", "vây hãm", "vay ham", "báo thù", "bao thu", "trả thù"
    ]
  },
  {
    slug: "co-trang",
    name: "Cổ trang",
    searchSeed: "cổ trang",
    keywords: [
      "cổ trang", "co trang", "tiên hiệp", "tien hiep", "kiếm hiệp", "kiem hiep",
      "tu tiên", "tu tien", "xuyên không", "xuyen khong", "trọng sinh", "trong sinh",
      "vương gia", "vuong gia", "hoàng hậu", "hoang hau", "cung đấu", "cung dau",
      "thần", "than", "giang hồ", "giang ho", "thiên cổ", "thien co", "đấu phá", "dau pha",
      "thế giới hoàn mỹ", "the gioi hoan my", "phàm nhân", "pham nhan", "cẩm", "cam",
      "hoa", "ngọc", "ngoc", "kim thoa", "trường tương tư", "truong tuong tu", "lâm giang"
    ]
  },
  {
    slug: "tinh-cam",
    name: "Tình cảm",
    searchSeed: "tình cảm",
    keywords: [
      "tình cảm", "tinh cam", "yêu", "yeu", "tình yêu", "tinh yeu", "lãng mạn", "lang man",
      "ngôn tình", "ngon tinh", "hôn nhân", "hon nhan", "tổng tài", "tong tai",
      "ngọt ngào", "ngot ngao", "em", "anh", "chồng", "chong", "vợ", "vo", "hẹn hò", "hen ho",
      "thanh xuân", "thanh xuan", "mùa hè", "mua he", "trái tim", "trai tim", "ánh trăng", "anh trang"
    ]
  },
  {
    slug: "hai-huoc",
    name: "Hài hước",
    searchSeed: "hài hước",
    keywords: [
      "hài", "hai", "hài hước", "hai huoc", "vui", "cười", "cuoi", "báo thủ", "bao thu",
      "gia đình", "gia dinh", "xóm", "xom", "làng", "lang", "quậy", "quay", "siêu lầy", "sieu lay"
    ]
  },
  {
    slug: "kinh-di",
    name: "Kinh dị",
    searchSeed: "kinh dị",
    keywords: [
      "kinh dị", "kinh di", "ma", "quỷ", "quy", "ác quỷ", "ac quy", "bóng đè", "bong de",
      "nguyền", "nguyen", "xác sống", "xac song", "zombie", "máu", "mau", "rùng rợn",
      "rung ron", "bí ẩn", "bi an", "ám ảnh", "am anh", "cô dâu ma", "co dau ma", "linh hồn"
    ]
  },
  {
    slug: "vien-tuong",
    name: "Viễn tưởng",
    searchSeed: "viễn tưởng",
    keywords: [
      "viễn tưởng", "vien tuong", "khoa học", "khoa hoc", "vũ trụ", "vu tru", "tương lai",
      "tuong lai", "dị năng", "di nang", "siêu nhiên", "sieu nhien", "quái vật", "quai vat",
      "robot", "ai", "không gian", "khong gian", "tận thế", "tan the", "avengers", "marvel",
      "transformer", "hành tinh", "hanh tinh"
    ]
  },
  {
    slug: "hoat-hinh",
    name: "Hoạt hình",
    searchSeed: "hoạt hình",
    keywords: [
      "hoạt hình", "hoat hinh", "anime", "one piece", "naruto", "conan", "dragon ball",
      "doraemon", "shin", "đấu la", "dau la", "vũ động", "vu dong", "tây hành", "tay hanh",
      "3d", "donghua", "chú thuật", "chu thuat", "thanh gươm", "thanh guom"
    ]
  }
];

let cachedInteractions = null;
let memoryRecommendationCache = null;

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function stripVietnameseAccents(str) {
  if (!str) {
    return "";
  }
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function tokenizeMovieText(text) {
  if (!text || typeof text !== "string") {
    return { unigrams: [], bigrams: [], phrases: [] };
  }
  const cleaned = text
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return { unigrams: [], bigrams: [], phrases: [] };
  }

  const rawWords = cleaned.split(" ");
  const unigrams = [];
  const validWords = [];

  for (let i = 0; i < rawWords.length; i += 1) {
    const w = rawWords[i].trim();
    const unaccented = stripVietnameseAccents(w);
    const isStopword = VIETNAMESE_STOPWORDS.has(w) || (w === unaccented && VIETNAMESE_STOPWORDS.has(unaccented));
    if (w.length >= 2 && !isStopword && !/^\d+$/.test(w)) {
      unigrams.push(w);
      validWords.push(w);
    }
  }

  const bigrams = [];
  const phrases = [];
  if (validWords.length >= 2 && validWords.length <= 4) {
    phrases.push(validWords.join(" "));
  } else if (validWords.length > 4) {
    phrases.push(validWords.slice(0, 3).join(" "));
  }
  for (let i = 0; i < validWords.length - 1; i += 1) {
    const bg = validWords[i] + " " + validWords[i + 1];
    bigrams.push(bg);
    if (bg.length >= 5 && phrases.indexOf(bg) === -1) {
      phrases.push(bg);
    }
  }
  if (validWords.length === 1 && validWords[0].length >= 4) {
    phrases.push(validWords[0]);
  }

  return {
    unigrams: unigrams,
    bigrams: bigrams,
    phrases: phrases
  };
}

export function inferLatentGenres(movie) {
  const matched = [];
  const seen = new Set();

  if (movie && Array.isArray(movie.categories)) {
    for (let i = 0; i < movie.categories.length; i += 1) {
      const cat = movie.categories[i];
      const catName = typeof cat === "string" ? cat : (cat && cat.name ? cat.name : "");
      const catNorm = stripVietnameseAccents(catName).toLowerCase();
      for (let g = 0; g < GENRE_PRIORS_AND_KEYWORDS.length; g += 1) {
        const gDef = GENRE_PRIORS_AND_KEYWORDS[g];
        const gNorm = stripVietnameseAccents(gDef.name).toLowerCase();
        if (catNorm.includes(gNorm) || catNorm.includes(gDef.slug.replace("-", " "))) {
          if (!seen.has(gDef.slug)) {
            seen.add(gDef.slug);
            matched.push({ slug: gDef.slug, weight: 1.4 });
          }
        }
      }
    }
  }

  if (movie && movie.type === "hoathinh" && !seen.has("hoat-hinh")) {
    seen.add("hoat-hinh");
    matched.push({ slug: "hoat-hinh", weight: 1.5 });
  }

  const textBlob = [
    movie && movie.title ? movie.title : "",
    movie && movie.seriesTitle ? movie.seriesTitle : "",
    movie && movie.originTitle ? movie.originTitle : "",
    movie && movie.content ? String(movie.content).slice(0, 300) : ""
  ].join(" ").toLowerCase();

  const textUnaccented = stripVietnameseAccents(textBlob);

  for (let g = 0; g < GENRE_PRIORS_AND_KEYWORDS.length; g += 1) {
    const gDef = GENRE_PRIORS_AND_KEYWORDS[g];
    let hitCount = 0;
    for (let k = 0; k < gDef.keywords.length; k += 1) {
      const kw = gDef.keywords[k];
      if (textBlob.includes(kw) || textUnaccented.includes(kw)) {
        hitCount += 1;
      }
    }
    if (hitCount > 0 && !seen.has(gDef.slug)) {
      seen.add(gDef.slug);
      matched.push({
        slug: gDef.slug,
        weight: Math.min(1.5, 0.75 + hitCount * 0.25)
      });
    }
  }

  return matched;
}

export function extractMovieFeatures(movie) {
  const features = Object.create(null);
  if (!movie || typeof movie !== "object") {
    return features;
  }

  function addFeature(key, value) {
    if (!key || !Number.isFinite(value)) {
      return;
    }
    features[key] = (features[key] || 0) + value;
  }

  const rawTitle = movie.seriesTitle || (movie.title ? String(movie.title).split(" - ")[0] : "");
  const titleTokens = tokenizeMovieText(rawTitle);
  const originTokens = tokenizeMovieText(movie.originTitle || "");

  // 1. Title Unigrams & Bigrams (TF-IDF style weighting: bigrams carry higher specificity)
  titleTokens.unigrams.forEach(function (u) {
    addFeature("term:" + u, 1.0);
    const unacc = stripVietnameseAccents(u);
    if (unacc !== u && unacc.length >= 3) {
      addFeature("term_ascii:" + unacc, 0.7);
    }
  });

  titleTokens.bigrams.forEach(function (bg) {
    addFeature("bigram:" + bg, 1.8);
  });

  originTokens.unigrams.forEach(function (u) {
    if (u.length >= 3) {
      addFeature("origin:" + u, 0.9);
    }
  });

  originTokens.bigrams.forEach(function (bg) {
    addFeature("origin_bg:" + bg, 1.4);
  });

  // 2. Latent & Explicit Genres
  const genres = inferLatentGenres(movie);
  genres.forEach(function (g) {
    addFeature("genre:" + g.slug, g.weight * 2.2);
  });

  // 3. Countries
  if (Array.isArray(movie.countries)) {
    movie.countries.forEach(function (c) {
      const cName = stripVietnameseAccents(typeof c === "string" ? c : (c && c.name ? c.name : "")).toLowerCase().trim();
      if (cName) {
        addFeature("country:" + cName, 1.5);
      }
    });
  }

  // 4. Actors
  if (Array.isArray(movie.actors)) {
    movie.actors.slice(0, 6).forEach(function (actor) {
      const aName = String(actor || "").toLowerCase().trim();
      if (aName && aName.length >= 3) {
        addFeature("actor:" + aName, 1.6);
      }
    });
  }

  // 5. Movie Type (series vs single vs hoathinh)
  if (movie.type) {
    addFeature("type:" + String(movie.type).toLowerCase(), 1.2);
  } else if (movie.episodeCurrent && /tập|tap|\d+\/\d+/i.test(movie.episodeCurrent)) {
    addFeature("type:series", 0.9);
  }

  // 6. Language preference (Vietsub / Thuyết minh / Lồng tiếng)
  if (movie.lang) {
    const langNorm = stripVietnameseAccents(movie.lang).toLowerCase();
    if (langNorm.includes("thuyet minh")) {
      addFeature("lang:thuyet-minh", 1.1);
    }
    if (langNorm.includes("long tieng")) {
      addFeature("lang:long-tieng", 1.1);
    }
    if (langNorm.includes("vietsub")) {
      addFeature("lang:vietsub", 0.8);
    }
  }

  // 7. Release Year Era
  const yr = parseInt(movie.year, 10);
  if (!isNaN(yr) && yr > 1980) {
    if (yr >= 2025) {
      addFeature("era:2025_plus", 1.0);
    } else if (yr >= 2020) {
      addFeature("era:2020_2024", 0.8);
    } else {
      addFeature("era:classic", 0.7);
    }
  }

  return features;
}

function getInteractionsList() {
  if (cachedInteractions !== null) {
    return cachedInteractions;
  }
  const storage = getStorage();
  if (!storage) {
    cachedInteractions = [];
    return cachedInteractions;
  }
  try {
    const raw = storage.getItem(ML_INTERACTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedInteractions = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    cachedInteractions = [];
  }
  return cachedInteractions;
}

function saveInteractionsList(list) {
  cachedInteractions = Array.isArray(list) ? list.slice(0, 50) : [];
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(ML_INTERACTIONS_KEY, JSON.stringify(cachedInteractions));
  } catch (_) {}
}

export function invalidateMlRecommendationCache() {
  memoryRecommendationCache = null;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(ML_CACHE_KEY);
    } catch (_) {}
  }
}

export function recordUserMovieInteraction(movie, interactionType) {
  if (!movie || (!movie.slug && !movie.id && !movie.title)) {
    return;
  }
  const list = getInteractionsList();
  const slug = movie.slug || movie.id || "";
  const seriesTitle = movie.seriesTitle || (movie.title ? String(movie.title).split(" - ")[0] : "");
  const filtered = list.filter(function (item) {
    return !(item && slug && item.slug === slug);
  });
  filtered.unshift({
    type: interactionType || "view",
    slug: slug,
    title: seriesTitle,
    originTitle: movie.originTitle || "",
    categories: Array.isArray(movie.categories) ? movie.categories.slice(0, 6) : [],
    countries: Array.isArray(movie.countries) ? movie.countries.slice(0, 4) : [],
    actors: Array.isArray(movie.actors) ? movie.actors.slice(0, 5) : [],
    movieType: movie.type || "",
    year: movie.year || "",
    lang: movie.lang || "",
    timestamp: Date.now()
  });
  saveInteractionsList(filtered);
  invalidateMlRecommendationCache();
}

export function recordUserSearchQuery(keyword) {
  const kw = String(keyword || "").trim();
  if (kw.length < 2) {
    return;
  }
  const list = getInteractionsList();
  const filtered = list.filter(function (item) {
    return !(item && item.type === "search" && String(item.query).toLowerCase() === kw.toLowerCase());
  });
  filtered.unshift({
    type: "search",
    query: kw,
    timestamp: Date.now()
  });
  saveInteractionsList(filtered);
  invalidateMlRecommendationCache();
}

function computeTimeDecay(timestampMs) {
  if (!timestampMs || !Number.isFinite(timestampMs)) {
    return 0.85;
  }
  const elapsed = Math.max(0, Date.now() - timestampMs);
  return Math.max(0.25, Math.exp(-elapsed / HALF_LIFE_MS));
}

export function trainUserPreferenceModel(customHistory, customFavorites, customInteractions) {
  const history = Array.isArray(customHistory) ? customHistory : getWatchHistory();
  const favorites = Array.isArray(customFavorites) ? customFavorites : getFavorites();
  const interactions = Array.isArray(customInteractions) ? customInteractions : getInteractionsList();

  const rawWeights = Object.create(null);
  const genreScores = Object.create(null);
  const queryCandidates = [];
  const seenQuerySet = new Set();
  const watchedSlugs = new Set();
  const completedSlugs = new Set();
  const favoriteSlugs = new Set();

  function addWeight(featureKey, delta) {
    if (!featureKey || !Number.isFinite(delta)) {
      return;
    }
    rawWeights[featureKey] = (rawWeights[featureKey] || 0) + delta;
    if (featureKey.indexOf("genre:") === 0) {
      const gSlug = featureKey.slice(6);
      genreScores[gSlug] = (genreScores[gSlug] || 0) + delta;
    }
  }

  function pushQueryCandidate(phrase, score) {
    if (!phrase || typeof phrase !== "string") {
      return;
    }
    const clean = phrase.trim();
    const norm = clean.toLowerCase();
    if (clean.length < 2 || VIETNAMESE_STOPWORDS.has(norm) || seenQuerySet.has(norm)) {
      return;
    }
    seenQuerySet.add(norm);
    queryCandidates.push({ query: clean, score: score });
  }

  // 1. Train on Watch History (Implicit Feedback: Watch duration + completion ratio + recency)
  history.forEach(function (item, idx) {
    if (!item) {
      return;
    }
    const slug = item.slug || item.id;
    if (slug) {
      watchedSlugs.add(slug);
      if ((item.progressPercent && item.progressPercent >= 90) || (item.duration > 60 && item.currentTime >= item.duration - 30)) {
        completedSlugs.add(slug);
      }
    }

    const progressRatio = Math.max(0.1, Math.min(1, (Number(item.progressPercent || item.progress) || 25) / 85));
    const watchBonus = (item.currentTime && item.currentTime > 300) ? 0.5 : 0;
    const rankDecay = Math.max(0.4, 1 - idx * 0.04);
    const timeDecay = computeTimeDecay(item.updatedAt);
    const sampleWeight = (1.1 + 1.5 * progressRatio + watchBonus) * timeDecay * rankDecay;

    const itemFeatures = extractMovieFeatures(item);
    const keys = Object.keys(itemFeatures);
    for (let k = 0; k < keys.length; k += 1) {
      const fKey = keys[k];
      addWeight(fKey, itemFeatures[fKey] * sampleWeight);
    }

    const titleText = item.seriesTitle || (item.title ? String(item.title).split(" - ")[0] : "");
    const tokens = tokenizeMovieText(titleText);
    if (tokens.phrases.length > 0) {
      pushQueryCandidate(tokens.phrases[0], sampleWeight * 2.2);
    }
    if (tokens.bigrams.length > 0) {
      pushQueryCandidate(tokens.bigrams[0], sampleWeight * 1.9);
    } else if (tokens.unigrams.length > 0) {
      pushQueryCandidate(tokens.unigrams[0], sampleWeight * 1.4);
    }
    if (Array.isArray(item.actors) && item.actors.length > 0 && item.actors[0].length >= 4) {
      pushQueryCandidate(item.actors[0], sampleWeight * 1.5);
    }
  });

  // 2. Train on Favorites (Explicit Positive Feedback: High positive weight)
  favorites.forEach(function (fav, idx) {
    if (!fav) {
      return;
    }
    const slug = fav.slug || fav.id;
    if (slug) {
      favoriteSlugs.add(slug);
    }
    const timeDecay = computeTimeDecay(fav.addedAt);
    const rankDecay = Math.max(0.5, 1 - idx * 0.03);
    const sampleWeight = 2.6 * timeDecay * rankDecay;

    const favFeatures = extractMovieFeatures(fav);
    const keys = Object.keys(favFeatures);
    for (let k = 0; k < keys.length; k += 1) {
      const fKey = keys[k];
      addWeight(fKey, favFeatures[fKey] * sampleWeight);
    }

    const titleText = fav.title || fav.name || "";
    const tokens = tokenizeMovieText(titleText);
    if (tokens.bigrams.length > 0) {
      pushQueryCandidate(tokens.bigrams[0], sampleWeight * 2.3);
    } else if (tokens.phrases.length > 0) {
      pushQueryCandidate(tokens.phrases[0], sampleWeight * 2.0);
    } else if (tokens.unigrams.length > 0) {
      pushQueryCandidate(tokens.unigrams[0], sampleWeight * 1.5);
    }
  });

  // 3. Train on User Interactions (Search Queries & Detail Modal Views)
  interactions.forEach(function (inter, idx) {
    if (!inter) {
      return;
    }
    const timeDecay = computeTimeDecay(inter.timestamp);
    const rankDecay = Math.max(0.35, 1 - idx * 0.05);

    if (inter.type === "search" && inter.query) {
      const sWeight = 1.6 * timeDecay * rankDecay;
      pushQueryCandidate(inter.query, sWeight * 2.4);
      const qTokens = tokenizeMovieText(inter.query);
      qTokens.unigrams.forEach(function (u) {
        addWeight("term:" + u, sWeight * 1.3);
      });
      qTokens.bigrams.forEach(function (bg) {
        addWeight("bigram:" + bg, sWeight * 1.9);
      });
      const fakeMovie = { title: inter.query };
      inferLatentGenres(fakeMovie).forEach(function (g) {
        addWeight("genre:" + g.slug, sWeight * 1.8);
      });
    } else {
      const vWeight = 1.2 * timeDecay * rankDecay;
      const vFeatures = extractMovieFeatures(inter);
      const keys = Object.keys(vFeatures);
      for (let k = 0; k < keys.length; k += 1) {
        addWeight(keys[k], vFeatures[keys[k]] * vWeight);
      }
      const tokens = tokenizeMovieText(inter.title || "");
      if (tokens.bigrams.length > 0) {
        pushQueryCandidate(tokens.bigrams[0], vWeight * 1.7);
      }
    }
  });

  // L2 Normalization of User Centroid Vector
  let normSq = 0;
  const featureKeys = Object.keys(rawWeights);
  for (let i = 0; i < featureKeys.length; i += 1) {
    const val = rawWeights[featureKeys[i]];
    normSq += val * val;
  }
  const l2Norm = normSq > 0 ? Math.sqrt(normSq) : 1;
  const normalizedVector = Object.create(null);
  for (let i = 0; i < featureKeys.length; i += 1) {
    const k = featureKeys[i];
    normalizedVector[k] = rawWeights[k] / l2Norm;
  }

  // Rank genres by Bayesian posterior affinity
  const rankedGenres = Object.keys(genreScores)
    .map(function (gSlug) {
      return { slug: gSlug, score: genreScores[gSlug] };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });

  // Supplement query candidates with top predicted genre seeds
  rankedGenres.slice(0, 3).forEach(function (gObj) {
    const gDef = GENRE_PRIORS_AND_KEYWORDS.find(function (item) {
      return item.slug === gObj.slug;
    });
    if (gDef && gDef.searchSeed) {
      pushQueryCandidate(gDef.searchSeed, gObj.score * 0.9);
    }
  });

  queryCandidates.sort(function (a, b) {
    return b.score - a.score;
  });

  const isColdStart = history.length === 0 && favorites.length === 0 && interactions.length === 0;

  return {
    isColdStart: isColdStart,
    vector: normalizedVector,
    rawWeights: rawWeights,
    l2Norm: l2Norm,
    rankedGenres: rankedGenres,
    queryCandidates: queryCandidates,
    watchedSlugs: watchedSlugs,
    completedSlugs: completedSlugs,
    favoriteSlugs: favoriteSlugs,
    signalCount: history.length + favorites.length + interactions.length
  };
}

export function buildHistoryGoogleSeeds(customHistory, customFavorites, customInteractions, userProfile) {
  const history = Array.isArray(customHistory) ? customHistory : getWatchHistory();
  const favorites = Array.isArray(customFavorites) ? customFavorites : getFavorites();
  const interactions = Array.isArray(customInteractions) ? customInteractions : getInteractionsList();
  const profile = userProfile || trainUserPreferenceModel(history, favorites, interactions);

  const seeds = [];
  const seenNorm = new Set();

  function addSeed(rawSeed) {
    if (!rawSeed || typeof rawSeed !== "string") {
      return;
    }
    const clean = rawSeed.replace(/\s+/g, " ").trim();
    if (clean.length < 4) {
      return;
    }
    const norm = stripVietnameseAccents(clean).toLowerCase();
    if (seenNorm.has(norm)) {
      return;
    }
    seenNorm.add(norm);
    seeds.push(clean);
  }

  // 1. Build Google Suggest seeds from recent Watch History titles, prefixes, genres, and actors
  history.slice(0, 5).forEach(function (item) {
    if (!item) {
      return;
    }
    const rawTitle = item.seriesTitle || (item.title ? String(item.title).split(" - ")[0] : "");
    const cleanedTitle = rawTitle.replace(/\([^)]*\)/g, "").trim();
    if (cleanedTitle.length >= 2) {
      const tokens = tokenizeMovieText(cleanedTitle);
      if (tokens.unigrams.length >= 2) {
        addSeed("phim " + tokens.unigrams[0] + " ");
      }
      if (tokens.bigrams.length > 0 && tokens.unigrams.length > 2) {
        addSeed("phim " + tokens.bigrams[0] + " ");
      }
      addSeed("phim " + cleanedTitle + " ");
    }
    if (Array.isArray(item.categories) && item.categories.length >= 2) {
      const c0 = typeof item.categories[0] === "string" ? item.categories[0] : (item.categories[0] && item.categories[0].name ? item.categories[0].name : "");
      const c1 = typeof item.categories[1] === "string" ? item.categories[1] : (item.categories[1] && item.categories[1].name ? item.categories[1].name : "");
      if (c0 && c1) {
        addSeed("phim " + c0.toLowerCase() + " " + c1.toLowerCase() + " ");
      }
    }
    if (Array.isArray(item.actors) && item.actors.length > 0 && item.actors[0].length >= 4) {
      addSeed("phim " + item.actors[0] + " ");
    }
  });

  // 2. Build seeds from Favorites
  favorites.slice(0, 3).forEach(function (fav) {
    if (!fav) {
      return;
    }
    const favTitle = (fav.title || fav.name || "").replace(/\([^)]*\)/g, "").trim();
    if (favTitle.length >= 2) {
      addSeed("phim " + favTitle + " ");
      const tokens = tokenizeMovieText(favTitle);
      if (tokens.bigrams.length > 0) {
        addSeed("phim " + tokens.bigrams[0] + " ");
      }
    }
  });

  // 3. Build seeds from recent User Searches / Interactions
  interactions.slice(0, 4).forEach(function (inter) {
    if (!inter) {
      return;
    }
    if (inter.type === "search" && inter.query) {
      const q = String(inter.query).trim();
      addSeed(q.toLowerCase().indexOf("phim") === 0 ? (q + " ") : ("phim " + q + " "));
    } else if (inter.title) {
      const tokens = tokenizeMovieText(inter.title);
      if (tokens.bigrams.length > 0) {
        addSeed("phim " + tokens.bigrams[0] + " ");
      }
    }
  });

  // 4. Add top latent genre seed for discovery
  if (profile.rankedGenres && profile.rankedGenres.length > 0) {
    const topGenre = GENRE_PRIORS_AND_KEYWORDS.find(function (g) {
      return g.slug === profile.rankedGenres[0].slug;
    });
    if (topGenre && topGenre.searchSeed) {
      addSeed("phim " + topGenre.searchSeed + " ");
    }
  }

  if (!seeds.length) {
    return ["phim bo hay ", "phim moi ", "phim hanh dong ", "phim co trang "];
  }

  return seeds.slice(0, 5);
}

export function enrichProfileWithGoogleKeywords(userProfile, googleKeywords) {
  const profile = userProfile || trainUserPreferenceModel();
  if (!Array.isArray(googleKeywords) || !googleKeywords.length) {
    return profile;
  }

  const rawWeights = Object.assign(Object.create(null), profile.rawWeights || {});
  const googleExpandedSet = new Set(profile.googleExpandedKeywords || []);

  googleKeywords.forEach(function (kw, idx) {
    if (!kw || typeof kw !== "string") {
      return;
    }
    const cleanKw = kw.trim();
    if (cleanKw.length < 3) {
      return;
    }
    googleExpandedSet.add(cleanKw.toLowerCase());
    const rankWeight = Math.max(0.45, 1.35 - idx * 0.1);
    const tokens = tokenizeMovieText(cleanKw);

    tokens.unigrams.forEach(function (u) {
      const key = "term:" + u;
      rawWeights[key] = (rawWeights[key] || 0) + rankWeight * 0.95;
      const unacc = stripVietnameseAccents(u);
      if (unacc !== u && unacc.length >= 3) {
        const asciiKey = "term_ascii:" + unacc;
        rawWeights[asciiKey] = (rawWeights[asciiKey] || 0) + rankWeight * 0.65;
      }
    });

    tokens.bigrams.forEach(function (bg) {
      const key = "bigram:" + bg;
      rawWeights[key] = (rawWeights[key] || 0) + rankWeight * 1.65;
    });

    inferLatentGenres({ title: cleanKw }).forEach(function (g) {
      const gKey = "genre:" + g.slug;
      rawWeights[gKey] = (rawWeights[gKey] || 0) + g.weight * rankWeight * 1.4;
    });
  });

  // Re-normalize L2 User Centroid Vector with Google-enriched features
  let normSq = 0;
  const fKeys = Object.keys(rawWeights);
  for (let i = 0; i < fKeys.length; i += 1) {
    const val = rawWeights[fKeys[i]];
    normSq += val * val;
  }
  const l2Norm = normSq > 0 ? Math.sqrt(normSq) : 1;
  const normalizedVector = Object.create(null);
  for (let i = 0; i < fKeys.length; i += 1) {
    const k = fKeys[i];
    normalizedVector[k] = rawWeights[k] / l2Norm;
  }

  profile.rawWeights = rawWeights;
  profile.vector = normalizedVector;
  profile.l2Norm = l2Norm;
  profile.googleExpandedKeywords = Array.from(googleExpandedSet);
  return profile;
}

export function fetchGoogleRelatedQueriesFromHistory(userProfile, options) {
  const customHistory = options && options.history ? options.history : null;
  const customFavorites = options && options.favorites ? options.favorites : null;
  const customInteractions = options && options.interactions ? options.interactions : null;
  const suggestFn = (options && typeof options.suggestFn === "function") ? options.suggestFn : fetchGoogleSuggestions;
  const maxKeywords = (options && options.maxKeywords > 0) ? options.maxKeywords : 8;

  const profile = userProfile || trainUserPreferenceModel(customHistory, customFavorites, customInteractions);
  const seeds = buildHistoryGoogleSeeds(customHistory, customFavorites, customInteractions, profile);

  return Promise.all(seeds.map(function (seed) {
    return Promise.resolve(suggestFn(seed)).catch(function () {
      return [];
    });
  })).then(function (suggestionLists) {
    const rawSuggestions = [];
    suggestionLists.forEach(function (list) {
      if (Array.isArray(list)) {
        rawSuggestions.push.apply(rawSuggestions, list);
      }
    });

    const extracted = extractKeywords(rawSuggestions);
    const cleanedKeywords = [];
    const seen = new Set();

    for (let i = 0; i < extracted.length && cleanedKeywords.length < maxKeywords; i += 1) {
      const kw = String(extracted[i] || "").trim();
      const norm = stripVietnameseAccents(kw).toLowerCase();
      if (kw.length >= 3 && !VIETNAMESE_STOPWORDS.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        cleanedKeywords.push(kw);
      }
    }

    enrichProfileWithGoogleKeywords(profile, cleanedKeywords);

    return {
      seeds: seeds,
      googleKeywords: cleanedKeywords,
      enrichedProfile: profile
    };
  }).catch(function () {
    return {
      seeds: seeds,
      googleKeywords: [],
      enrichedProfile: profile
    };
  });
}

export function predictSearchQueries(userProfile, maxQueries) {
  const limit = maxQueries && maxQueries > 0 ? maxQueries : 5;
  const profile = userProfile || trainUserPreferenceModel();

  if (profile.isColdStart || !profile.queryCandidates.length) {
    // Cold-Start exploration seeds
    return ["hành động", "cổ trang", "tình cảm", "viễn tưởng", "hoạt hình"].slice(0, limit);
  }

  const selected = [];
  const seen = new Set();

  for (let i = 0; i < profile.queryCandidates.length && selected.length < limit; i += 1) {
    const q = profile.queryCandidates[i].query;
    const norm = stripVietnameseAccents(q).toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      selected.push(q);
    }
  }

  // Ensure diversity by adding top genre seed if slots remain
  const defaultSeeds = ["cổ trang", "hành động", "tình cảm", "hoạt hình", "kinh dị"];
  for (let i = 0; i < defaultSeeds.length && selected.length < limit; i += 1) {
    const s = defaultSeeds[i];
    const norm = stripVietnameseAccents(s).toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      selected.push(s);
    }
  }

  return selected;
}

export function scoreMovieWithModel(movie, userProfile) {
  if (!movie || typeof movie !== "object") {
    return { score: 0, matchPercent: 75 };
  }
  const profile = userProfile || trainUserPreferenceModel();
  const movieFeatures = extractMovieFeatures(movie);
  const mKeys = Object.keys(movieFeatures);

  if (!mKeys.length) {
    return { score: 0.1, matchPercent: 78 };
  }

  // Compute Movie L2 Norm and Dot Product with User Centroid Vector
  let dotProduct = 0;
  let movieNormSq = 0;
  let genreAffinityBonus = 0;

  for (let i = 0; i < mKeys.length; i += 1) {
    const k = mKeys[i];
    const mVal = movieFeatures[k];
    movieNormSq += mVal * mVal;

    if (profile.vector && profile.vector[k]) {
      dotProduct += profile.vector[k] * mVal;
    }
    if (k.indexOf("genre:") === 0 && profile.rawWeights && profile.rawWeights[k]) {
      genreAffinityBonus += 0.08;
    }
  }

  const movieNorm = movieNormSq > 0 ? Math.sqrt(movieNormSq) : 1;
  const cosineSim = profile.isColdStart ? 0.45 : (dotProduct / movieNorm);

  // Google Query Expansion Match Bonus (when movie title/origin matches Google related queries)
  let googleExpansionBonus = 0;
  if (movie.googleQueryMatched) {
    googleExpansionBonus += 0.09;
  } else if (Array.isArray(profile.googleExpandedKeywords) && profile.googleExpandedKeywords.length > 0) {
    const titleNorm = stripVietnameseAccents((movie.seriesTitle || movie.title || "") + " " + (movie.originTitle || "")).toLowerCase();
    for (let g = 0; g < profile.googleExpandedKeywords.length; g += 1) {
      const gNorm = stripVietnameseAccents(profile.googleExpandedKeywords[g]).toLowerCase();
      if (gNorm.length >= 4 && titleNorm.indexOf(gNorm) !== -1) {
        googleExpansionBonus += 0.07;
        break;
      }
    }
  }

  // Quality & Recency Prior
  let qualityPrior = 0;
  const yr = parseInt(movie.year, 10);
  if (!isNaN(yr)) {
    if (yr >= 2025) {
      qualityPrior += 0.08;
    } else if (yr >= 2022) {
      qualityPrior += 0.04;
    }
  }
  if (movie.quality && /4k|fhd|hd/i.test(movie.quality)) {
    qualityPrior += 0.04;
  }

  // Novelty / Diversity Penalty for already completed movies
  const slug = movie.slug || movie.id || "";
  let noveltyAdjustment = 0;
  if (slug && profile.completedSlugs && profile.completedSlugs.has(slug)) {
    noveltyAdjustment -= 0.35;
  } else if (slug && profile.watchedSlugs && profile.watchedSlugs.has(slug)) {
    noveltyAdjustment -= 0.12;
  }

  const rawScore = Math.max(0.05, cosineSim * 0.78 + Math.min(0.22, genreAffinityBonus) + googleExpansionBonus + qualityPrior + noveltyAdjustment);

  // Calibrated sigmoid mapping into [82%, 99%] match percentage
  const calibrated = 1 / (1 + Math.exp(-4.2 * (rawScore - 0.22)));
  const matchPercent = Math.max(80, Math.min(99, Math.round(78 + calibrated * 21)));

  return {
    score: Number(rawScore.toFixed(4)),
    cosineSimilarity: Number(cosineSim.toFixed(4)),
    matchPercent: matchPercent
  };
}

function buildProfileSignature(profile) {
  const topQueries = predictSearchQueries(profile, 4).join("|");
  const topGenres = (profile.rankedGenres || []).slice(0, 3).map(function (g) { return g.slug; }).join(",");
  return profile.signalCount + ":" + topGenres + ":" + topQueries;
}

export function getMlRecommendations(kkphimApi, options) {
  const force = Boolean(options && options.force);
  const maxResults = (options && options.limit > 0) ? options.limit : 16;
  const profile = trainUserPreferenceModel();
  const signature = buildProfileSignature(profile);

  if (!force && memoryRecommendationCache) {
    const age = Date.now() - memoryRecommendationCache.timestamp;
    if (age < ML_CACHE_TTL_MS && memoryRecommendationCache.signature === signature && memoryRecommendationCache.movies.length) {
      return Promise.resolve({
        movies: memoryRecommendationCache.movies.slice(0, maxResults),
        queries: memoryRecommendationCache.queries,
        googleQueries: memoryRecommendationCache.googleQueries || [],
        googleSeeds: memoryRecommendationCache.googleSeeds || [],
        topGenres: memoryRecommendationCache.topGenres,
        isColdStart: profile.isColdStart,
        isCached: true
      });
    }
  }

  return fetchGoogleRelatedQueriesFromHistory(profile, options).then(function (googleEnrichment) {
    const googleKeywords = (googleEnrichment && Array.isArray(googleEnrichment.googleKeywords))
      ? googleEnrichment.googleKeywords
      : [];
    const googleSeeds = (googleEnrichment && Array.isArray(googleEnrichment.googleSeeds || googleEnrichment.seeds))
      ? (googleEnrichment.googleSeeds || googleEnrichment.seeds)
      : [];

    const baseQueries = predictSearchQueries(profile, 4);
    const mergedQueries = [];
    const seenQueryNorm = new Set();
    const googleQueryNormSet = new Set();

    function addCombinedQuery(q, isFromGoogle) {
      if (!q || typeof q !== "string") {
        return;
      }
      const clean = q.trim();
      const norm = stripVietnameseAccents(clean).toLowerCase();
      if (!clean || seenQueryNorm.has(norm)) {
        return;
      }
      seenQueryNorm.add(norm);
      if (isFromGoogle) {
        googleQueryNormSet.add(norm);
      }
      mergedQueries.push(clean);
    }

    // Interleave on-device ML queries and Google-expanded related movie queries
    baseQueries.slice(0, 3).forEach(function (q) {
      addCombinedQuery(q, false);
    });
    googleKeywords.slice(0, 4).forEach(function (gq) {
      addCombinedQuery(gq, true);
    });
    baseQueries.slice(3).forEach(function (q) {
      addCombinedQuery(q, false);
    });

    const activeQueries = mergedQueries.slice(0, 7);
    const topGenreSlug = (profile.rankedGenres && profile.rankedGenres.length > 0)
      ? profile.rankedGenres[0].slug
      : "hanh-dong";

    const searchTasks = activeQueries.map(function (kw) {
      if (!kkphimApi || typeof kkphimApi.searchMovies !== "function") {
        return Promise.resolve([]);
      }
      const kwNorm = stripVietnameseAccents(kw).toLowerCase();
      const isGoogleSource = googleQueryNormSet.has(kwNorm);
      return kkphimApi.searchMovies(kw, 6, 1).then(function (res) {
        const list = (res && Array.isArray(res.movies)) ? res.movies : [];
        if (!isGoogleSource) {
          return list;
        }
        return list.map(function (m) {
          return Object.assign({}, m, { googleQueryMatched: kw });
        });
      }).catch(function () {
        return [];
      });
    });

    if (kkphimApi && typeof kkphimApi.getMoviesByGenre === "function") {
      searchTasks.push(
        kkphimApi.getMoviesByGenre(topGenreSlug, 1, 12).then(function (res) {
          return (res && Array.isArray(res.movies)) ? res.movies : [];
        }).catch(function () {
          return [];
        })
      );
    }

    return Promise.all(searchTasks).then(function (resultsLists) {
      const candidateMap = new Map();
      resultsLists.forEach(function (list) {
        if (!Array.isArray(list)) {
          return;
        }
        list.forEach(function (movie) {
          if (!movie) {
            return;
          }
          const key = movie.slug || movie.id;
          if (!key) {
            return;
          }
          if (!candidateMap.has(key)) {
            candidateMap.set(key, movie);
          } else if (movie.googleQueryMatched && !candidateMap.get(key).googleQueryMatched) {
            candidateMap.set(key, Object.assign({}, candidateMap.get(key), {
              googleQueryMatched: movie.googleQueryMatched
            }));
          }
        });
      });

      const candidates = Array.from(candidateMap.values());

      function finalizeCandidates(movieList) {
        const scored = movieList.map(function (movie) {
          const evaluation = scoreMovieWithModel(movie, profile);
          const enriched = Object.assign({}, movie, {
            mlScore: evaluation.score,
            mlMatchPercent: evaluation.matchPercent
          });
          return enriched;
        });

        scored.sort(function (a, b) {
          return b.mlScore - a.mlScore;
        });

        const finalMovies = scored.slice(0, maxResults);
        const topGenres = (profile.rankedGenres || []).slice(0, 3).map(function (g) { return g.slug; });

        if (scored.length > 0) {
          memoryRecommendationCache = {
            timestamp: Date.now(),
            signature: signature,
            movies: scored,
            queries: activeQueries,
            googleQueries: googleKeywords,
            googleSeeds: googleSeeds,
            topGenres: topGenres
          };
        }

        return {
          movies: finalMovies,
          queries: activeQueries,
          googleQueries: googleKeywords,
          googleSeeds: googleSeeds,
          topGenres: topGenres,
          isColdStart: profile.isColdStart,
          isCached: false
        };
      }

      if (candidates.length >= 10 || !kkphimApi || typeof kkphimApi.getMoviesByCategory !== "function") {
        return finalizeCandidates(candidates);
      }

      // Fallback enrichment if search returned fewer than 10 items
      return kkphimApi.getMoviesByCategory("phim-le", 1, 14).then(function (res) {
        const extra = (res && Array.isArray(res.movies)) ? res.movies : [];
        extra.forEach(function (m) {
          const key = m && (m.slug || m.id);
          if (key && !candidateMap.has(key)) {
            candidateMap.set(key, m);
          }
        });
        return finalizeCandidates(Array.from(candidateMap.values()));
      }).catch(function () {
        return finalizeCandidates(candidates);
      });
    });
  });
}

export function createMlRecommendationService(kkphimApi) {
  return {
    trainModel: trainUserPreferenceModel,
    predictQueries: predictSearchQueries,
    buildGoogleSeeds: buildHistoryGoogleSeeds,
    expandWithGoogle: fetchGoogleRelatedQueriesFromHistory,
    enrichProfileWithGoogle: enrichProfileWithGoogleKeywords,
    scoreMovie: scoreMovieWithModel,
    extractFeatures: extractMovieFeatures,
    inferGenres: inferLatentGenres,
    recordInteraction: recordUserMovieInteraction,
    recordSearch: recordUserSearchQuery,
    invalidateCache: invalidateMlRecommendationCache,
    getRecommendations(options) {
      return getMlRecommendations(kkphimApi, options);
    }
  };
}
