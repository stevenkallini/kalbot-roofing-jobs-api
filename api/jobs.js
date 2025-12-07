// api/jobs.js

const API_BASE = "https://services.leadconnectorhq.com";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const jobsObjectName = process.env.GHL_JOBS_OBJECT_NAME; // e.g. "custom_objects.jobs"

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

  // Build the correct URL:
  // GET /custom-objects/{objectName}/records?locationId=...&limit=12
  const url = `${API_BASE}/custom-objects/${encodeURIComponent(
    jobsObjectName
  )}/records?locationId=${encodeURIComponent(locationId)}&limit=12`;

  try {
    const ghlRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Use the version header your API Explorer shows; 2021-07-28 is common.
        Version: "2021-07-28"
      }
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

    // Custom objects usually come back as data or records;
    const rawRecords = data.records || data.data || [];

    // TEMP: if nothing shows, you can return rawRecords directly to inspect shape
    // return res.status(200).json({ rawRecords });

    // Filter only jobs that should be shown on the website
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
