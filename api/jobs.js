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

  // Correct search endpoint for custom objects:
  // POST /objects/:schemaKey/records/search
  const url = `${API_BASE}/objects/${encodeURIComponent(
    jobsObjectName
  )}/records/search`;

  const body = {
    locationId,
    page: 1,
    pageLimit: 12
  };

  try {
    const ghlRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28" // keep this as in API Explorer
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

    const rawRecords = data.records || data.data || [];

    // Filter logic:
    // - If show_on_website has values:
    //    * Exclude records where it includes "dont_post_to_website"
    // - If show_on_website is empty/missing:
    //    * Include (default visible)
    const visibleJobs = rawRecords.filter((record) => {
      const p = record.properties || {};
      const flagArr = p.show_on_website || [];

      if (Array.isArray(flagArr) && flagArr.length > 0) {
        return !flagArr.includes("dont_post_to_website");
      }
      // No flag set => show by default
      return true;
    });

    const jobs = visibleJobs.map((record) => {
      const p = record.properties || {};

      // job_amount is { currency, value } in your payload
      let amount = null;
      if (p.job_amount) {
        if (typeof p.job_amount === "object" && p.job_amount.value != null) {
          amount = p.job_amount.value;
        } else {
          amount = p.job_amount;
        }
      }

      return {
        id: record.id,
        title: p.job_title || "",
        city: p.city || "",
        date: p.job_date || "",
        amount,
        description: p.job_description || "",
        heroImage: p.hero_image_url || "" // you can add this field later in GHL
      };
    });

    return res.status(200).json({ jobs });
  } catch (err) {
    console.error("Jobs API error:", err);
    return res.status(500).json({ error: "Unable to fetch jobs" });
  }
}
