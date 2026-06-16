// test.js
// Uso: node test.js [tmdbId] [tipo] [temporada] [episodio] [provider]
// Ejemplos:
//   node test.js 550 movie
//   node test.js 157336 movie movie cinecalidad
//   node test.js 1396 tv 1 1 lamovie

const providerName = process.argv[6] || 'lamovie';
const { getStreams } = require(`./providers/${providerName}.js`);

const tmdbId = process.argv[2] || '550';
const mediaType = process.argv[3] || 'movie';
const season = process.argv[4] ? parseInt(process.argv[4]) : null;
const episode = process.argv[5] ? parseInt(process.argv[5]) : null;

console.log(`\nTesting ${providerName} provider...`);
console.log(`TMDB: ${tmdbId} | Tipo: ${mediaType}${season ? ` | S${season}E${episode}` : ''}\n`);

getStreams(tmdbId, mediaType, season, episode)
  .then(streams => {
    if (!streams || streams.length === 0) {
      console.log('❌ No se encontraron streams');
      return;
    }
    console.log(`\n✅ ${streams.length} streams encontrados:\n`);
    streams.forEach((s, i) => {
      console.log(`[${i + 1}] ${s.title}`);
      console.log(`    URL: ${s.url}`);
      if (s.headers && Object.keys(s.headers).length > 0) {
        console.log(`    Headers: ${JSON.stringify(s.headers)}`);
      }
      console.log();
    });
  })
  .catch(e => console.error('Error:', e.message));