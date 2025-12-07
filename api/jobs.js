// api/jobs.js

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const jobsSearchUrl = process.env.GHL_JOBS_SEARCH_URL; 
  // 👆 this will be the full "Search Object Records" URL for custom_objects.jobs 
  // copied from the GHL API Explorer (see below).

  if (!apiKey || !locationId || !jobsSearchUrl) {
    return res.status(500).json({ error: "API not configured" });
  }

  try {
    // 🔹 Most Search URLs from GHL include the locationId as a query param already.
    // If yours does NOT, you can append it here:
    // const url = `${jobsSearchUrl}&locationId=${locationId}`;
    const url = jobsSearchUrl;

    const ghlRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Version header may or may not be required depending on your token.
        // If GHL API Explorer shows a `Version` header, keep this:
        Version: "1.0"
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

    // 🔹 LOGGING TIP (uncomment this once to see shape in Vercel logs):
    // console.log("Raw GHL data:", JSON.stringify(data, null, 2));

    // Depending on the API, records might live in data.records or data.data.
    const rawRecords = data.records || data.data || [];

    // ⬇️ Adjust these field names/paths to match your Jobs schema.
    // Start simple: comment the filter out at first, confirm you see records,
    // then add filter by show_on_website.
    const visibleJobs = rawRecords.filter((record) => {
      // You might get fields like record.show_on_website or record.fields.show_on_website
      const flag =
        record.show_on_website ||
        record.showOnWebsite ||
        (record.fields && record.fields.show_on_website);

      return flag === true || flag === "true" || flag === 1 || flag === "1";
    });

    const jobs = visibleJobs.map((record) => {
      // Try to read fields both directly and via a fields/properties object.
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

    res.status(200).json({ jobs });
  } catch (err) {
    console.error("Jobs API error:", err);
    res.status(500).json({ error: "Unable to fetch jobs" });
  }
}
