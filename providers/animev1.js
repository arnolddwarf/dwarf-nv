const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function normalizeText(text = "") {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function romanize(num) {
  if (num === 2) return "ii";
  if (num === 3) return "iii";
  if (num === 4) return "iv";
  if (num === 5) return "v";
  return "";
}

function determineQuality(url) {
  if (!url) return "Unknown";
  let w = {
    vimeos: { h: "720p", n: "480p" },
    goodstream: { x: "1080p", h: "720p", n: "480p", l: "360p" },
    vidhide: { n: "720p", l: "480p" },
    streamwish: { x: "1080p", h: "1080p", n: "720p", l: "480p" },
    voe: { n: "720p", l: "360p" }
  };
  let j = ["x", "o", "h", "n", "l"];
  
  let t = null;
  if (url.includes("vimeos")) t = w.vimeos;
  else if (url.includes("goodstream")) t = w.goodstream;
  else if (url.includes("cloudwindow-route")) t = w.voe;
  else if (url.includes("minochinos") || url.includes("vidhide") || url.includes("dintezuvio") || url.includes("dramiyos")) t = w.vidhide;
  else if (
    url.includes("premilkyway") || 
    url.includes("hlswish") || 
    url.includes("vibuxer") || 
    url.includes("streamwish") || 
    url.includes("strwish") || 
    url.includes("ahvsh") ||
    url.includes("vtube.network") ||
    url.includes("savefiles.com") ||
    url.includes("uqload.is") ||
    url.includes("xonaplay.com")
  ) t = w.streamwish;
  
  if (t) {
    let s = url.match(/_,?([a-z,]+),\.urlset/);
    if (s) {
      let o = s[1].split(",").filter(Boolean);
      for (let r of j) {
        if (o.includes(r) && t[r]) return t[r];
      }
    }
  }
  
  let n = url.match(/[_\-\/](\d{3,4})p/);
  return n ? n[1] + "p" : "Unknown";
}

async function fetchTMDBInfo(tmdbId, mediaType) {
  try {
    const urls = ["es-MX", "es-ES", "en-US"].map(lang => 
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${lang}`
    );
    urls.push(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`);
    
    const [esMX, esES, enUS, altTitlesRes] = await Promise.all(
      urls.map(url => fetch(url, { headers: { "User-Agent": USER_AGENT } }).then(res => res.json()).catch(() => null))
    );
    
    const hasCJK = (str) => /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(str);
    
    let queries = [];
    const addQuery = (q) => {
      if (!q || hasCJK(q)) return;
      queries.push(q);
      if (q.includes(":")) {
        queries.push(q.split(":")[0].trim());
      }
      if (q.includes("-")) {
        queries.push(q.split("-")[0].trim());
      }
    };
    
    if (esMX) {
      addQuery(mediaType === "movie" ? esMX.title : esMX.name);
      addQuery(mediaType === "movie" ? esMX.original_title : esMX.original_name);
    }
    if (esES) {
      addQuery(mediaType === "movie" ? esES.title : esES.name);
    }
    if (enUS) {
      addQuery(mediaType === "movie" ? enUS.title : enUS.name);
    }
    
    if (altTitlesRes) {
      const altList = altTitlesRes.titles || altTitlesRes.results || [];
      for (let item of altList) {
        addQuery(item.title);
      }
    }
    
    queries = [...new Set(queries.filter(Boolean))];
    
    const year = ((esMX || esES || enUS || {}).release_date || (esMX || esES || enUS || {}).first_air_date || "").substring(0, 4);
    
    console.log(`[AnimeV1] TMDB Queries: ${JSON.stringify(queries)} | Año: ${year}`);
    return { queries, year };
  } catch (err) {
    console.log(`[AnimeV1] Error al obtener TMDB: ${err.message}`);
  }
  return null;
}

// VOE Decoder helper
function voeDecode(encoded, keysStr) {
  try {
    let keys = keysStr.replace(/^\[|\]$/g, "")
      .split("','")
      .map(k => k.replace(/^'+|'+$/g, ""))
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    
    let decoded = "";
    for (let i = 0; i < encoded.length; i++) {
      let charCode = encoded.charCodeAt(i);
      if (charCode > 64 && charCode < 91) {
        charCode = (charCode - 52) % 26 + 65;
      } else if (charCode > 96 && charCode < 123) {
        charCode = (charCode - 84) % 26 + 97;
      }
      decoded += String.fromCharCode(charCode);
    }
    
    for (let k of keys) {
      decoded = decoded.replace(new RegExp(k, "g"), "_");
    }
    decoded = decoded.split("_").join("");
    
    let raw = atob(decoded);
    if (!raw) return null;
    
    let shifted = "";
    for (let i = 0; i < raw.length; i++) {
      shifted += String.fromCharCode((raw.charCodeAt(i) - 3 + 256) % 256);
    }
    
    let reversed = shifted.split("").reverse().join("");
    let finalJson = atob(reversed);
    return finalJson ? JSON.parse(finalJson) : null;
  } catch (err) {
    console.log("[VOE] Decoder error:", err.message);
    return null;
  }
}

// VOE Resolver
async function resolveVoe(url) {
  try {
    console.log(`[VOE] Resolviendo: ${url}`);
    let res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      redirect: "follow"
    });
    if (!res.ok) return null;
    let html = await res.text();
    
    if (/permanentToken/i.test(html)) {
      let match = html.match(/window\.location\.href\s*=\s*'([^']+)'/i);
      if (match) {
        console.log(`[VOE] Redirect token -> ${match[1]}`);
        let res2 = await fetch(match[1], {
          headers: { "User-Agent": USER_AGENT, Referer: url },
          redirect: "follow"
        });
        if (res2.ok) html = await res2.text();
      }
    }
    
    let s = html.match(/json">\s*\[\s*['"]([^'"]+)['"]\s*\]\s*<\/script>\s*<script[^>]*src=['"]([^'"]+)['"]/i);
    if (s) {
      let encoded = s[1];
      let loaderUrl = s[2].startsWith("http") ? s[2] : new URL(s[2], url).href;
      console.log(`[VOE] Found encoded array + loader: ${loaderUrl}`);
      
      let resLoader = await fetch(loaderUrl, { headers: { "User-Agent": USER_AGENT, Referer: url } });
      if (resLoader.ok) {
        let loaderText = await resLoader.text();
        let keysMatch = loaderText.match(/(\[(?:'[^']{1,10}'[\s,]*){4,12}\])/i) || loaderText.match(/(\[(?:"[^"]{1,10}"[,\s]*){4,12}\])/i);
        if (keysMatch) {
          let decodedObj = voeDecode(encoded, keysMatch[1]);
          if (decodedObj && (decodedObj.source || decodedObj.direct_access_url)) {
            let videoUrl = decodedObj.source || decodedObj.direct_access_url;
            console.log(`[VOE] URL encontrada: ${videoUrl.substring(0, 80)}...`);
            return {
              url: videoUrl,
              quality: determineQuality(videoUrl),
              headers: { Referer: url }
            };
          }
        }
      }
    }
    
    let regexSingle = /(?:mp4|hls)'\s*:\s*'([^']+)'/gi;
    let regexDouble = /(?:mp4|hls)"\s*:\s*"([^"]+)"/gi;
    let links = [];
    let match;
    while ((match = regexSingle.exec(html)) !== null) links.push(match[1]);
    while ((match = regexDouble.exec(html)) !== null) links.push(match[1]);
    
    for (let link of links) {
      if (!link) continue;
      let decodedLink = link;
      if (decodedLink.startsWith("aHR0")) {
        try {
          decodedLink = atob(decodedLink);
        } catch(e) {}
      }
      console.log(`[VOE] URL encontrada (fallback): ${decodedLink.substring(0, 80)}...`);
      return {
        url: decodedLink,
        quality: determineQuality(decodedLink),
        headers: { Referer: url }
      };
    }
    console.log("[VOE] No se encontró URL");
    return null;
  } catch (err) {
    console.log(`[VOE] Error: ${err.message}`);
    return null;
  }
}

// Packer unpack helper (Z in cinecalidad.js)
function unpackPacker(p, a, c, k, e, r) {
  let s = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let o = (val) => {
    let result = 0;
    for (let i = 0; i < val.length; i++) {
      let idx = s.indexOf(val[i]);
      if (idx === -1) return NaN;
      result = result * a + idx;
    }
    return result;
  };
  return p.replace(/\b([0-9a-zA-Z]+)\b/g, (word) => {
    let idx = o(word);
    return isNaN(idx) || idx >= k.length ? word : k[idx] && k[idx] !== "" ? k[idx] : word;
  });
}

function parseStreamWishHls(unpackedText, hostUrl) {
  let match = unpackedText.match(/\{[^{}]*"hls[234]"\s*:\s*"([^"]+)"[^{}]*\}/);
  if (match) {
    try {
      let jsonStr = match[0].replace(/(\w+)\s*:/g, '"$1":');
      let obj = JSON.parse(jsonStr);
      let streamUrl = obj.hls4 || obj.hls3 || obj.hls2;
      if (streamUrl) {
        return streamUrl.startsWith("/") ? hostUrl + streamUrl : streamUrl;
      }
    } catch (e) {
      let match2 = match[0].match(/"hls[234]"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
      if (match2) {
        let streamUrl = match2[1];
        return streamUrl.startsWith("/") ? hostUrl + streamUrl : streamUrl;
      }
    }
  }
  let matchM3u8 = unpackedText.match(/["']([^"']{30,}\.m3u8[^"']*)['"]/i);
  if (matchM3u8) {
    let streamUrl = matchM3u8[1];
    return streamUrl.startsWith("/") ? hostUrl + streamUrl : streamUrl;
  }
  return null;
}

// StreamWish Resolver
async function resolveStreamWish(url) {
  try {
    let targetUrl = url;
    const domainMap = { "hglink.to": "vibuxer.com" };
    for (let [k, v] of Object.entries(domainMap)) {
      if (targetUrl.includes(k)) {
        targetUrl = targetUrl.replace(k, v);
        break;
      }
    }
    
    let hostMatch = targetUrl.match(/^(https?:\/\/[^/]+)/);
    let hostUrl = hostMatch ? hostMatch[1] : "https://hlswish.com";
    
    console.log(`[StreamWish] Resolviendo: ${url}`);
    if (targetUrl !== url) {
      console.log(`[StreamWish] -> Mapped to: ${targetUrl}`);
    }
    
    let res = await fetch(targetUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://embed69.org/",
        Origin: "https://embed69.org",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let html = await res.text();
    
    let matchFile = html.match(/file\s*:\s*["']([^"']+)["']/i);
    if (matchFile) {
      let videoUrl = matchFile[1];
      if (videoUrl.startsWith("/")) videoUrl = hostUrl + videoUrl;
      
      if (videoUrl.includes("vibuxer.com/stream/")) {
        console.log(`[StreamWish] Siguiendo redirect: ${videoUrl.substring(0, 80)}...`);
        try {
          let followRes = await fetch(videoUrl, { headers: { "User-Agent": USER_AGENT, Referer: hostUrl + "/" }, redirect: "follow" });
          if (followRes.url && followRes.url.includes(".m3u8")) videoUrl = followRes.url;
        } catch(e) {}
      }
      console.log(`[StreamWish] URL encontrada: ${videoUrl.substring(0, 80)}...`);
      return {
        url: videoUrl,
        quality: determineQuality(videoUrl),
        headers: { "User-Agent": USER_AGENT, Referer: hostUrl + "/" }
      };
    }
    
    let matchPacker = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[^}]+\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
    if (matchPacker) {
      let unpacked = unpackPacker(matchPacker[1], parseInt(matchPacker[2]), parseInt(matchPacker[3]), matchPacker[4].split("|"));
      let streamUrl = parseStreamWishHls(unpacked, hostUrl);
      if (streamUrl) {
        console.log(`[StreamWish] URL encontrada (Packer): ${streamUrl.substring(0, 80)}...`);
        return {
          url: streamUrl,
          quality: determineQuality(streamUrl),
          headers: { "User-Agent": USER_AGENT, Referer: hostUrl + "/" }
        };
      }
    }
    
    let matchFallback = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
    if (matchFallback) {
      console.log(`[StreamWish] URL encontrada (Fallback): ${matchFallback[0].substring(0, 80)}...`);
      return {
        url: matchFallback[0],
        quality: determineQuality(matchFallback[0]),
        headers: { "User-Agent": USER_AGENT, Referer: hostUrl + "/" }
      };
    }
    
    console.log("[StreamWish] No se encontró URL");
    return null;
  } catch (err) {
    console.log(`[StreamWish] Error: ${err.message}`);
    return null;
  }
}

async function resolveOkRu(url) {
  try {
    console.log(`[OkRu] Resolviendo: ${url}`);
    let response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html",
        "Referer": "https://ok.ru/"
      },
      redirect: "follow"
    });
    if (!response.ok) return null;
    let html = await response.text();
    
    if (html.includes("copyrightsRestricted") || html.includes("COPYRIGHTS_RESTRICTED") || html.includes("LIMITED_ACCESS") || html.includes("notFound") || !html.includes("urls")) {
      console.log("[OkRu] Video no disponible o eliminado");
      return null;
    }
    
    let regex = /"name":"([^"]+)","url":"([^"]+)"/g;
    let matches = [...html.replace(/\\&quot;/g, '"').replace(/\\u0026/g, "&").replace(/\\/g, "").matchAll(regex)];
    
    let qualitiesPriority = ["full", "hd", "sd", "low", "lowest"];
    let streams = matches.map(m => ({
      type: m[1],
      url: m[2]
    })).filter(s => !s.type.toLowerCase().includes("mobile") && s.url.startsWith("http"));
    
    if (streams.length === 0) {
      console.log("[OkRu] No se encontraron URLs de streaming");
      return null;
    }
    
    streams.sort((a, b) => {
      let idxA = qualitiesPriority.findIndex(q => a.type.toLowerCase().includes(q));
      let idxB = qualitiesPriority.findIndex(q => b.type.toLowerCase().includes(q));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    
    let bestStream = streams[0];
    console.log(`[OkRu] URL encontrada (${bestStream.type}): ${bestStream.url.substring(0, 80)}...`);
    
    let qualityMapping = {
      full: "1080p",
      hd: "720p",
      sd: "480p",
      low: "360p",
      lowest: "240p"
    };
    
    return {
      quality: qualityMapping[bestStream.type] || bestStream.type,
      url: bestStream.url,
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://ok.ru/"
      }
    };
  } catch (err) {
    console.log(`[OkRu] Error en resolver: ${err.message}`);
    return null;
  }
}

async function resolveIronHentai(url) {
  try {
    console.log(`[IronHentai] Resolviendo: ${url}`);
    let res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow"
    });
    if (!res.ok) return null;
    let html = await res.text();
    
    const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
    let sMatch;
    let encodedStr = null;
    while ((sMatch = scriptRegex.exec(html)) !== null) {
      const scriptContent = sMatch[1];
      if (scriptContent.includes("split") && scriptContent.includes("charCodeAt")) {
        const atobMatch = scriptContent.match(/atob\(\s*['"]([^'"]+)['"]\s*\)/);
        if (atobMatch) {
          encodedStr = atobMatch[1];
          break;
        }
      }
    }
    
    if (encodedStr) {
      const step1 = atob(encodedStr);
      const decodedBase64 = step1.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 1)).join('');
      const finalJs = atob(decodedBase64.trim());
      
      if (url.includes("face.php")) {
        const huggingMatch = finalJs.match(/(https:\/\/re\.ironhentai\.com\/hugging\.php\?id=[^'"]+)/);
        if (huggingMatch) {
          const huggingUrl = huggingMatch[1];
          console.log(`[IronHentai] Hugging URL encontrada: ${huggingUrl}`);
          
          let finalHuggingUrl = huggingUrl;
          try {
            const hugRes = await fetch(huggingUrl, {
              headers: { "User-Agent": USER_AGENT },
              redirect: "manual"
            });
            const location = hugRes.headers.get("location");
            if (location) {
              finalHuggingUrl = location;
            }
          } catch(e) {
            console.log(`[IronHentai] Error al seguir redirect de hugging.php: ${e.message}`);
          }
          
          console.log(`[IronHentai] Hugging final URL: ${finalHuggingUrl.substring(0, 80)}...`);
          return {
            url: finalHuggingUrl,
            quality: "1080p",
            headers: { "User-Agent": USER_AGENT }
          };
        }
      } else if (url.includes("vt.php")) {
        const m3u8Match = finalJs.match(/(https:\/\/str\d+\.vtube\.network\/hls\/[^'"]+\.m3u8)/) || finalJs.match(/(https:\/\/[^'"]+\.m3u8)/);
        if (m3u8Match) {
          console.log(`[IronHentai] HLS URL encontrada: ${m3u8Match[1].substring(0, 80)}...`);
          return {
            url: m3u8Match[1],
            quality: determineQuality(m3u8Match[1]),
            headers: { "User-Agent": USER_AGENT }
          };
        }
      }
    }
    console.log("[IronHentai] No se pudo decodificar o encontrar stream");
  } catch (err) {
    console.log(`[IronHentai] Error: ${err.message}`);
  }
  return null;
}

async function resolveXona(url) {
  try {
    console.log(`[XonaPlay] Resolviendo: ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const html = await res.text();
    const m3u8Match = html.match(/(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
    if (m3u8Match) {
      console.log(`[XonaPlay] URL encontrada: ${m3u8Match[1].substring(0, 80)}...`);
      return {
        url: m3u8Match[1],
        quality: determineQuality(m3u8Match[1]),
        headers: { "User-Agent": USER_AGENT }
      };
    }
  } catch (err) {
    console.log(`[XonaPlay] Error: ${err.message}`);
  }
  return null;
}

async function resolveSaveFiles(url) {
  try {
    console.log(`[SaveFiles] Resolviendo: ${url}`);
    const codeMatch = url.match(/\/e\/([a-zA-Z0-9]+)/);
    if (!codeMatch) return null;
    const fileCode = codeMatch[1];
    
    const dlUrl = url.replace(/\/e\/[a-zA-Z0-9]+.*/, "/dl");
    const bodyParams = new URLSearchParams({
      op: "embed",
      file_code: fileCode,
      auto: "1",
      referer: ""
    });
    
    const res = await fetch(dlUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": url
      },
      body: bodyParams.toString()
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    const fileMatch = html.match(/file\s*:\s*["']([^"']+)["']/i);
    if (fileMatch) {
      console.log(`[SaveFiles] URL encontrada: ${fileMatch[1].substring(0, 80)}...`);
      return {
        url: fileMatch[1],
        quality: determineQuality(fileMatch[1]),
        headers: { "User-Agent": USER_AGENT, Referer: url }
      };
    }
  } catch (err) {
    console.log(`[SaveFiles] Error: ${err.message}`);
  }
  return null;
}

async function resolveUqload(url) {
  try {
    console.log(`[Uqload] Resolviendo: ${url}`);
    const codeMatch = url.match(/\/e\/([a-zA-Z0-9]+)/);
    if (!codeMatch) return null;
    const fileCode = codeMatch[1];
    
    const dlUrl = url.replace(/\/e\/[a-zA-Z0-9]+.*/, "/dl");
    const bodyParams = new URLSearchParams({
      op: "embed",
      file_code: fileCode,
      auto: "1",
      referer: ""
    });
    
    const res = await fetch(dlUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": url
      },
      body: bodyParams.toString()
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    const matchPacker = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[^}]+\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
    if (matchPacker) {
      const unpacked = unpackPacker(matchPacker[1], parseInt(matchPacker[2]), parseInt(matchPacker[3]), matchPacker[4].split("|"));
      const fileMatch = unpacked.match(/file\s*:\s*["']([^"']+)["']/i) || unpacked.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i);
      if (fileMatch) {
        console.log(`[Uqload] URL encontrada: ${fileMatch[1].substring(0, 80)}...`);
        return {
          url: fileMatch[1],
          quality: determineQuality(fileMatch[1]),
          headers: { "User-Agent": USER_AGENT, Referer: url }
        };
      }
    }
  } catch (err) {
    console.log(`[Uqload] Error: ${err.message}`);
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId || !mediaType) return [];
  
  const startTime = Date.now();
  console.log(`[AnimeV1] Buscando: TMDB ${tmdbId} (${mediaType})${season ? ` S${season}E${episode}` : ""}`);
  
  const tmdbInfo = await fetchTMDBInfo(tmdbId, mediaType);
  if (!tmdbInfo || !tmdbInfo.queries || tmdbInfo.queries.length === 0) {
    console.log("[AnimeV1] No se pudieron obtener metadatos de TMDB o queries vacías");
    return [];
  }
  
  const searchQueries = tmdbInfo.queries;
  let matches = [];
  let queryUsed = "";
  
  for (let query of searchQueries) {
    try {
      console.log(`[AnimeV1] Buscando en directorio con query: "${query}"`);
      const searchUrl = `https://animev1.com/directorio/anime?q=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": USER_AGENT }
      });
      if (res.ok) {
        const searchHtml = await res.text();
        
        let currentMatches = [];
        const regexBlock = /<li>\s*<article>([\s\S]*?)<\/article>\s*<\/li>/g;
        let block;
        while ((block = regexBlock.exec(searchHtml)) !== null) {
          const blockHtml = block[1];
          const hrefMatch = blockHtml.match(/<a[^>]+href=["']([^"']+)["']/);
          const titleMatch = blockHtml.match(/<p>([\s\S]*?)<\/p>/) || blockHtml.match(/alt=["']([^"']+)["']/);
          const typeMatch = blockHtml.match(/<span class=["']tipo["']>([\s\S]*?)<\/span>/);
          const yearMatch = blockHtml.match(/<span class=["']estreno["']>([\s\S]*?)<\/span>/);
          
          if (hrefMatch && titleMatch) {
            currentMatches.push({
              slug: hrefMatch[1].replace(/^\//, ""),
              title: titleMatch[1].replace(/<[^>]*>/g, "").trim(),
              type: typeMatch ? typeMatch[1].replace(/<[^>]*>/g, "").trim() : "",
              year: yearMatch ? yearMatch[1].replace(/<[^>]*>/g, "").trim() : ""
            });
          }
        }
        
        if (currentMatches.length > 0) {
          matches = currentMatches;
          queryUsed = query;
          break;
        }
      }
    } catch (err) {
      console.log(`[AnimeV1] Error en búsqueda de "${query}": ${err.message}`);
    }
  }
  
  if (matches.length === 0) {
    console.log("[AnimeV1] Búsqueda finalizada sin coincidencias en el directorio");
    return [];
  }
  
  console.log(`[AnimeV1] Encontradas ${matches.length} coincidencias en el directorio con query: "${queryUsed}"`);
  
  let bestMatch = null;
  let bestScore = -999;
  const normQuery = normalizeText(queryUsed);
  
  for (let result of matches) {
    let score = 0;
    const normResult = normalizeText(result.title);
    
    if (normResult.includes(normQuery) || normQuery.includes(normResult)) {
      score += 10;
    } else {
      continue;
    }
    
    score -= Math.abs(result.title.length - queryUsed.length) * 0.1;
    
    if (mediaType === "movie") {
      if (result.type.toLowerCase().includes("película") || result.type.toLowerCase().includes("movie") || result.type.toLowerCase().includes("teatral")) {
        score += 20;
      } else {
        score -= 10;
      }
    } else {
      if (result.type.toLowerCase().includes("tv") || result.type.toLowerCase().includes("serie") || result.type.toLowerCase().includes("ona") || result.type.toLowerCase().includes("anime")) {
        score += 5;
      }
      
      const isSeasonOne = !season || season === 1;
      if (isSeasonOne) {
        const hasHigherSeason = /(2nd|3rd|4th|5th|2|3|4|5|ii|iii|iv|v)\s*(season|temp|temporada)/i.test(result.title) || /\b(2|3|4|5|ii|iii)\b/i.test(result.title);
        if (!hasHigherSeason) {
          score += 15;
        } else {
          score -= 10;
        }
      } else {
        const seasonRegex = new RegExp(`(${season}nd|${season}rd|${season}th|${season}|${romanize(season)})\\s*(season|temp|temporada)|\\b(${season}|${romanize(season)})\\b`, "i");
        if (seasonRegex.test(result.title)) {
          score += 25;
        } else {
          score -= 15;
        }
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }
  
  if (!bestMatch) {
    console.log("[AnimeV1] Ningún resultado del directorio cumple los criterios mínimos");
    return [];
  }
  
  console.log(`[AnimeV1] Mejor coincidencia: "${bestMatch.title}" (slug: ${bestMatch.slug})`);
  
  let epUrl = "";
  if (mediaType === "movie") {
    epUrl = `https://animev1.com/ver/${bestMatch.slug}-1`;
  } else {
    epUrl = `https://animev1.com/ver/${bestMatch.slug}-${episode}`;
  }
  
  console.log(`[AnimeV1] Fetching episodio: ${epUrl}`);
  let epHtml = "";
  try {
    const res = await fetch(epUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": `https://animev1.com/${bestMatch.slug}`
      }
    });
    if (res.ok) {
      epHtml = await res.text();
    }
  } catch (err) {
    console.log(`[AnimeV1] Error al obtener la página de reproducción: ${err.message}`);
    return [];
  }
  
  if (!epHtml) {
    console.log("[AnimeV1] No se pudo obtener el HTML del episodio");
    return [];
  }
  
  let playerSrcs = [];
  const playerRegex = /tabsArray\['\d+'\]\s*=\s*["']<iframe.*?src=['"]([^'"]+)['"]/g;
  let playerMatch;
  while ((playerMatch = playerRegex.exec(epHtml)) !== null) {
    playerSrcs.push(playerMatch[1]);
  }
  
  console.log(`[AnimeV1] Encontrados ${playerSrcs.length} reproductores en la página`);
  
  let streams = [];
  for (let playerSrc of playerSrcs) {
    let realUrl = playerSrc;
    if (playerSrc.includes("redirect.php?id=")) {
      const match = playerSrc.match(/redirect\.php\?id=([^&"'\s]+)/);
      if (match) {
        realUrl = decodeURIComponent(match[1]);
      }
    }
    
    if (realUrl.includes("ok.ru/videoembed/")) {
      const resolved = await resolveOkRu(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · OkRu`,
          url: resolved.url,
          quality: `${resolved.quality} - OkRu`,
          headers: resolved.headers
        });
      }
    } else if (realUrl.includes("voe.sx/e/")) {
      const resolved = await resolveVoe(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · VOE`,
          url: resolved.url,
          quality: `${resolved.quality} - VOE`,
          headers: resolved.headers
        });
      }
    } else if (
      realUrl.includes("hlswish") || 
      realUrl.includes("streamwish") || 
      realUrl.includes("strwish") || 
      realUrl.includes("ahvsh") || 
      realUrl.includes("vibuxer")
    ) {
      const resolved = await resolveStreamWish(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · StreamWish`,
          url: resolved.url,
          quality: `${resolved.quality} - StreamWish`,
          headers: resolved.headers
        });
      }
    } else if (realUrl.includes("ironhentai.com/face.php")) {
      const resolved = await resolveIronHentai(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · PremiunVIP`,
          url: resolved.url,
          quality: `${resolved.quality} - PremiunVIP`,
          headers: resolved.headers
        });
      }
    } else if (realUrl.includes("ironhentai.com/vt.php")) {
      const resolved = await resolveIronHentai(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · PlusTube`,
          url: resolved.url,
          quality: `${resolved.quality} - PlusTube`,
          headers: resolved.headers
        });
      }
    } else if (realUrl.includes("xonaplay.com/video/")) {
      const resolved = await resolveXona(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · DEMO-XONA`,
          url: resolved.url,
          quality: `${resolved.quality} - DEMO-XONA`,
          headers: resolved.headers
        });
      }
    } else if (realUrl.includes("streamhls.to/e/")) {
      const resolved = await resolveSaveFiles(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · SaveFiles`,
          url: resolved.url,
          quality: `${resolved.quality} - SaveFiles`,
          headers: resolved.headers
        });
      }
    } else if (realUrl.includes("uqload.is/e/")) {
      const resolved = await resolveUqload(realUrl);
      if (resolved) {
        streams.push({
          name: "AnimeV1",
          title: `${resolved.quality} · Uqload`,
          url: resolved.url,
          quality: `${resolved.quality} - Uqload`,
          headers: resolved.headers
        });
      }
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[AnimeV1] ✓ ${streams.length} streams en ${elapsed}s`);
  return streams;
}

module.exports = { getStreams };
