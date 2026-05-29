import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ─── Config ─────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
  process.exit(1);
}

// ─── Supabase helpers ───────────────────────────────────────
async function supabaseGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  return res.json();
}

async function supabaseUpdate(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PATCH ${table} ${id} failed: ${res.status}`);
}

// ─── Extract IMDb ID from URL or raw ID ─────────────────────
function extractImdbId(slug) {
  if (!slug) return null;
  const match = slug.match(/(tt\d{7,})/);
  return match ? match[1] : null;
}

// ─── Scrape Box Office Mojo for domestic gross ──────────────
async function scrapeDomesticGross(imdbId) {
  const url = `https://www.boxofficemojo.com/title/${imdbId}/`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      console.log(`  ⚠ HTTP ${res.status} for ${imdbId}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    let domesticGross = null;

    // Box Office Mojo renders the summary as label/value pairs where the
    // label "Domestic (NN.N%)" is followed by the lifetime gross. The
    // "Domestic Opening" figure has NO percentage, so requiring the percent
    // in the label reliably isolates the lifetime total.
    //
    // Collapse the whole page to single-spaced text and regex for the
    // pattern. This is the most robust approach because BOM splits the
    // label and value across separate elements inconsistently.
    const text = $.text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

    // Match "Domestic (76.7%) $73,524,085" — percent guarantees lifetime total
    let match = text.match(/Domestic\s*\(\s*[\d.]+\s*%\s*\)\s*\$\s*([\d,]+)/i);

    // Some fully-domestic films show "Domestic (100%)" or occasionally the
    // worldwide equals domestic. If the percent pattern misses, try matching
    // "Domestic (–)" style is skipped (no gross). As a final fallback, look
    // for the summary where Domestic label is immediately followed by a $ value
    // but is NOT "Domestic Opening" or "Domestic Distributor".
    if (!match) {
      match = text.match(/Domestic\s*\(\s*[\d.]+\s*%\s*\)\s*([\d,]+)/i);
    }

    if (match) {
      const parsed = parseInt(match[1].replace(/,/g, ''), 10);
      if (parsed > 0) domesticGross = parsed;
    }

    return domesticGross;
  } catch (err) {
    console.log(`  ⚠ Error scraping ${imdbId}: ${err.message}`);
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('🎬 Box Office Update — ' + new Date().toISOString());
  console.log('');

  // Fetch all movies that have a mojo_slug
  const movies = await supabaseGet('movies', 'select=id,title,mojo_slug,domestic_gross,release_date&mojo_slug=not.is.null&order=release_date');

  console.log(`Found ${movies.length} movies with IMDb links`);
  console.log('');

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const movie of movies) {
    const imdbId = extractImdbId(movie.mojo_slug);
    if (!imdbId) {
      console.log(`⏭ ${movie.title} — no valid IMDb ID`);
      skipped++;
      continue;
    }

    // Skip movies that haven't released yet
    const releaseDate = new Date(movie.release_date);
    if (releaseDate > new Date()) {
      console.log(`⏭ ${movie.title} — not yet released (${movie.release_date})`);
      skipped++;
      continue;
    }

    console.log(`🔍 ${movie.title} (${imdbId})...`);

    const gross = await scrapeDomesticGross(imdbId);

    if (gross !== null) {
      const prevGross = movie.domestic_gross || 0;
      const diff = gross - prevGross;

      await supabaseUpdate('movies', movie.id, {
        domestic_gross: gross,
        last_scraped_at: new Date().toISOString(),
      });

      const diffStr = diff > 0 ? ` (+$${(diff / 1000000).toFixed(1)}M)` : '';
      console.log(`  ✅ $${gross.toLocaleString()}${diffStr}`);
      updated++;
    } else {
      console.log(`  ❌ No domestic gross found`);
      failed++;
    }

    // Be polite — wait between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('');
  console.log(`Done! Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

