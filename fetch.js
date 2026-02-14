const fs = require("fs");

const BASE_URL =
  "https://catalog.roblox.com/v1/search/items/details?Category=12&Subcategory=38&Limit=30&SortType=3";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(cursor = "", retries = 3) {
  const url = cursor ? `${BASE_URL}&Cursor=${cursor}` : BASE_URL;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "snipe-x/1.0",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      console.log("Retrying...", retries);
      await delay(2000);
      return fetchPage(cursor, retries - 1);
    }
    throw err;
  }
}

async function main() {
  let existing = [];
  let known = new Set();

  if (fs.existsSync("emotes.json")) {
    existing = JSON.parse(fs.readFileSync("emotes.json"));
    existing.forEach((e) => known.add(e.id));
  }

  let cursor = "";
  let newEmotes = [];
  let stop = false;

  do {
    const data = await fetchPage(cursor);

    for (const item of data.data || []) {
      if (known.has(item.id)) {
        stop = true;
        break;
      }

      newEmotes.push({
        id: item.id,
        name: item.name,
        creator: item.creatorName,
        price: item.price,
        created: item.created,
      });
    }

    cursor = data.nextPageCursor;

    await delay(1250);
  } while (cursor && !stop);

  if (newEmotes.length > 0) {
    const updated = [...newEmotes, ...existing];
    fs.writeFileSync("emotes.json", JSON.stringify(updated, null, 2));
    console.log("Added", newEmotes.length, "new emotes.");
  } else {
    console.log("No new emotes found.");
  }
}

main().catch(console.error);
