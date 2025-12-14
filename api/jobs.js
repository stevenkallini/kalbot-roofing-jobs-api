// api/jobs.js
const API_BASE = "https://services.leadconnectorhq.com";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function setCache(res) {
  // Cache on Vercel edge/CDN for 10 min, allow serving stale for 1 day while revalidating
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
}

function parseDateMs(v) {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

function normalizePhotos(rawPhoto) {
  let photos = [];

  if (Array.isArray(rawPhoto)) {
    photos = rawPhoto
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object" && item.url) return item.url;
        return "";
      })
      .filter(Boolean);
  } else if (typeof rawPhoto === "string") {
    photos = rawPhoto
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  if (!photos.length) {
    photos = ["https://via.placeholder.com/1200x800?text=Projet+de+toiture"];
  }

  // de-dupe
  const seen = new Set();
  return photos.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

function pickLast3UniqueService(jobs) {
  // newest -> oldest (prefer updatedAt, then createdAt)
  jobs.sort((a, b) => {
    const aMs = Math.max(parseDateMs(a.updatedAt), parseDateMs(a.createdAt));
    const bMs = Math.max(parseDateMs(b.updatedAt), parseDateMs(b.createdAt));
    return bMs - aMs;
  });

  const picked = [];
  const seen = new Set();

  for (const job of jobs) {
    let svc = (job.service || "").toString().trim().toLowerCase();
    if (!svc) svc = "__no_service__";
    if (seen.has(svc)) continue;

    seen.add(svc);
    picked.push(job);
    if (picked.length === 3) break;
  }
  return picked;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(res);
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    setCors(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const jobsObjectName = process.env.GHL_JOBS_OBJECT_NAME || "custom_objects.jobs";

  if (!apiKey || !locationId || !jobsObjectName) {
    setCors(res);
    return res.status(500).json({
      error: "API not configured",
      missing: {
        hasApiKey: !!apiKey,
        hasLocationId: !!locationId,
        hasJobsObjectName: !!jobsObjectName,
      },
    });
  }

  const url = `${API_BASE}/objects/${encodeURIComponent(jobsObjectName)}/records/search`;

  const body = {
    locationId,
    page: 1,
    pageLimit: 12,
  };

  try {
    const ghlRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify(body),
    });

    if (!ghlRes.ok) {
      const text = await ghlRes.text();
      console.error("GHL error:", text);
      setCors(res);
      return res.status(ghlRes.status).json({
        error: "Error from GHL API",
        status: ghlRes.status,
        body: text,
      });
    }

    const data = await ghlRes.json();
    const rawRecords = data.records || data.data || [];

    // visible only
    const visibleRecords = rawRecords.filter((record) => {
      const p = record.properties || {};
      const flagArr = p.show_on_website || [];
      return !(Array.isArray(flagArr) && flagArr.includes("dont_post_to_website"));
    });

    // map minimal + normalized
    const mapped = visibleRecords.map((record) => {
      const p = record.properties || {};

      // amount
      let amount = null;
      if (p.job_amount) {
        amount = (typeof p.job_amount === "object" && p.job_amount.value != null)
          ? p.job_amount.value
          : p.job_amount;
      }

      const photos = normalizePhotos(p.job_photo);
      const cover = photos[0]; // ✅ only 1 needed for grid

      const showOnWebsiteRaw = p.show_on_website || [];
      const showOnWebsite =
        !Array.isArray(showOnWebsiteRaw) || !showOnWebsiteRaw.includes("dont_post_to_website");

      return {
        id: record.id,
        jobNumber: p.job_number || "",
        contact: p.contact || "",
        service: p.service || "",
        title: p.job_title || "",
        description: p.job_description || "",
        city: p.city || "",
        date: p.job_date || "",
        amount,
        cover,       // ✅ single image for cards
        photos,      // ✅ full array for gallery
        showOnWebsite,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    });

    // ✅ server-side pick last 3 unique service (so client work + payload shrink)
    const jobs = pickLast3UniqueService(mapped);

    setCors(res);
    setCache(res);
    return res.status(200).json({ jobs });

  } catch (err) {
    console.error("Jobs API error:", err);
    setCors(res);
    return res.status(500).json({ error: "Unable to fetch jobs" });
  }
}
