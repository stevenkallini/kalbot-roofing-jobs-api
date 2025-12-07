// api/jobs.js

const API_BASE = "https://services.leadconnectorhq.com";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const jobsObjectName = process.env.GHL_JOBS_OBJECT_NAME || "custom_objects.jobs";

  if (!apiKey || !locationId || !jobsObjectName) {
    return res.status(500).json({
      error: "API not configured",
      missing: {
        hasApiKey: !!apiKey,
        hasLocationId: !!locationId,
        hasJobsObjectName: !!jobsObjectName
      }
    });
  }

  // 👉 Correct endpoint for custom object search:
  // POST /objects/:schemaKey/records/search
  const url = `${API_BASE}/objects/${encodeURIComponent(
    jobsObjectName
  )}/records/search`;

  // Basic search body: you can add filters later if you want
const body = {
  locationId,
  page: 1,
  pageLimit: 12
  // filters: [...] // optional later
};

  try {
    const ghlRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Use the same Version that already worked with your token
        Version: "2021-07-28"
      },
      body: JSON.stringify(body)
    });

    if (!ghlRes.ok) {
      const text = await ghlRes.text();
      console.error("GHL error:", text);
      return res.status(ghlRes.status).json({
        error: "Error from GHL API",
        status: ghlRes.status,
        body: text
      });
    }

    const data = await ghlRes.json();

    // Most custom object APIs return the records in data.records or data.data
    const rawRecords = data.records || data.data || [];
    return res.status(200).json({ rawRecords });
    // If this comes back empty or weird, uncomment the next line once to inspect:
    // return res.status(200).json({ rawRecords });

    // Filter: only show jobs flagged for website (adjust field names as needed)
    const visibleJobs = rawRecords.filter((record) => {
      const f = record.fields || record.properties || record;
      const flag =
        f.show_on_website ||
        f.showOnWebsite ||
        f.showOnSite ||
        f.display_on_site;

      return flag === true || flag === "true" || flag === 1 || flag === "1";
    });

    const jobs = visibleJobs.map((record) => {
      const f = record.fields || record.properties || record;

      return {
        id: record.id,
        title: f.job_title || f.title || "",
        city: f.city || "",
        date: f.job_date || f.date || "",
        amount: f.job_amount || f.amount || null,
        description: f.job_description || f.description || "",
        heroImage: f.hero_image_url || f.image_url || ""
      };
    });

    return res.status(200).json({ jobs });
  } catch (err) {
    console.error("Jobs API error:", err);
    return res.status(500).json({ error: "Unable to fetch jobs" });
  }
}
