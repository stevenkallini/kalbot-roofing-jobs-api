// api/jobs.js

const API_BASE = "https://services.leadconnectorhq.com";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  // CORS preflight
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
        hasJobsObjectName: !!jobsObjectName
      }
    });
  }

  // Custom object records search endpoint
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
        Version: "2021-07-28"
      },
      body: JSON.stringify(body)
    });

    if (!ghlRes.ok) {
      const text = await ghlRes.text();
      console.error("GHL error:", text);
      setCors(res);
      return res.status(ghlRes.status).json({
        error: "Error from GHL API",
        status: ghlRes.status,
        body: text
      });
    }

    const data = await ghlRes.json();
    const rawRecords = data.records || data.data || [];

    // Filter out records explicitly marked as not for website
    const visibleJobs = rawRecords.filter((record) => {
      const p = record.properties || {};
      const flagArr = p.show_on_website || [];
      return !(Array.isArray(flagArr) && flagArr.includes("dont_post_to_website"));
    });

    // Map into website-friendly structure
    const jobs = visibleJobs.map((record) => {
      const p = record.properties || {};

      // Process job amount
      let amount = null;
      if (p.job_amount) {
        if (typeof p.job_amount === "object" && p.job_amount.value != null) {
          amount = p.job_amount.value;
        } else {
          amount = p.job_amount;
        }
      }

      // Extract photo URL (array of objects)
      let photo = "";
      const rawPhoto = p.job_photo;
      if (Array.isArray(rawPhoto) && rawPhoto.length > 0 && rawPhoto[0].url) {
        photo = rawPhoto[0].url;
      } else if (typeof rawPhoto === "string") {
        photo = rawPhoto;
      }

      const showOnWebsiteRaw = p.show_on_website || [];
      const showOnWebsite =
        !Array.isArray(showOnWebsiteRaw) ||
        !showOnWebsiteRaw.includes("dont_post_to_website");

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
        photo,
        showOnWebsite,
        showOnWebsiteRaw,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    });

    setCors(res);
    return res.status(200).json({ jobs });

  } catch (err) {
    console.error("Jobs API error:", err);
    setCors(res);
    return res.status(500).json({ error: "Unable to fetch jobs" });
  }
}
