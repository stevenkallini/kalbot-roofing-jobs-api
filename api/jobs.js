// api/jobs.js

const API_BASE = "https://services.leadconnectorhq.com";

function setCors(res) {
  // You can replace * with your GHL domain if you want to restrict it
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  // Handle CORS preflight
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
      setCors(res);
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

      // show_on_website is an array like ["dont_post_to_website"] or []
      const showOnWebsiteRaw = p.show_on_website || [];
      const showOnWebsite =
        !Array.isArray(showOnWebsiteRaw) ||
        !showOnWebsiteRaw.includes("dont_post_to_website");

      return {
        // core identifiers
        id: record.id,
        jobNumber: p.job_number || "",
        contact: p.contact || "",

        // NEW: dropdown field "service"
        service: p.service || "",

        // content for the website
        title: p.job_title || "",
        description: p.job_description || "",
        city: p.city || "",
        date: p.job_date || "",

        amount,                   // numeric amount only
        photo: p.job_photo || "", // URL for job photo
        showOnWebsite,            // boolean we computed
        showOnWebsiteRaw,         // raw array in case you need it

        // timestamps (directly from record)
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
