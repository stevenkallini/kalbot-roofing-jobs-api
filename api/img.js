// api/img.js
import sharp from "sharp";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const url = req.query.url;
  const w = Math.min(parseInt(req.query.w || "900", 10) || 900, 1600);
  const q = Math.min(parseInt(req.query.q || "72", 10) || 72, 90);
  const fmt = (req.query.f || "webp").toLowerCase(); // webp|jpg|png

  if (!url || typeof url !== "string") {
    return res.status(400).send("Missing url");
  }

  // Basic safety: only allow GHL's storage host (prevents open proxy abuse)
  if (!url.startsWith("https://msgsndr-private.storage.googleapis.com/")) {
    return res.status(400).send("Unsupported host");
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(upstream.status).send("Upstream fetch failed");
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const input = Buffer.from(arrayBuffer);

    let pipeline = sharp(input)
      .rotate()
      .resize({ width: w, withoutEnlargement: true });

    // Output format
    if (fmt === "jpg" || fmt === "jpeg") {
      res.setHeader("Content-Type", "image/jpeg");
      pipeline = pipeline.jpeg({ quality: q, mozjpeg: true });
    } else if (fmt === "png") {
      res.setHeader("Content-Type", "image/png");
      pipeline = pipeline.png({ quality: q });
    } else {
      res.setHeader("Content-Type", "image/webp");
      pipeline = pipeline.webp({ quality: q });
    }

    // Cache at the edge/CDN
    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");

    const out = await pipeline.toBuffer();
    return res.status(200).send(out);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Image processing error");
  }
}
