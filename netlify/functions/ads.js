// netlify/functions/ads.js
// Returns active ads (where current date is between startDate and endDate)

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const ADS_DIR = path.join(__dirname, "../../content/ads");

function getActiveAds() {
    const now = new Date();
    const ads = [];

    // Check if ads directory exists
    if (!fs.existsSync(ADS_DIR)) {
        return ads;
    }

    const files = fs.readdirSync(ADS_DIR).filter(f => f.endsWith(".md"));

    for (const file of files) {
        try {
            const filePath = path.join(ADS_DIR, file);
            const content = fs.readFileSync(filePath, "utf-8");
            const { data } = matter(content);

            const startDate = new Date(data.startDate);
            const endDate = new Date(data.endDate);

            // Only include active ads
            if (now >= startDate && now <= endDate) {
                ads.push({
                    title: data.title || "",
                    image: data.image || "",
                    link: data.link || "",
                    position: data.position || "inline",
                    alt: data.alt || data.title || "Advertisement"
                });
            }
        } catch (e) {
            console.error(`Error reading ad file ${file}:`, e.message);
        }
    }

    return ads;
}

exports.handler = async (event) => {
    const ads = getActiveAds();

    // Group by position
    const grouped = {
        inline: ads.filter(a => a.position === "inline"),
        sidebar: ads.filter(a => a.position === "sidebar"),
        banner: ads.filter(a => a.position === "banner")
    };

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300" // 5 minutes
        },
        body: JSON.stringify(grouped)
    };
};
