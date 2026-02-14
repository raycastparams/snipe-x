const https = require("https");
const fs = require("fs");

const APIs = [
  {
    name: "Basic API",
    baseUrl:
      "https://catalog.roproxy.com/v1/search/items/details?Category=12&Subcategory=39&Limit=30",
    outputFile: "emotes.json",
  },
  {
    name: "Latest API",
    baseUrl:
      "https://catalog.roproxy.com/v1/search/items/details?Category=12&Subcategory=39&Limit=30&salesTypeFilter=1&SortType=3",
    outputFile: "emotes.json",
  },
  {
    name: "Animation API",
    baseUrl:
      "https://catalog.roproxy.com/v1/search/items/details?Category=12&Subcategory=38&salesTypeFilter=1&Limit=30",
    outputFile: "animations.json",
  },
];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function loadExistingData(filename) {
  try {
    if (fs.existsSync(filename)) {
      const data = JSON.parse(fs.readFileSync(filename, "utf8"));
      const existingItems = data.data || [];
      const existingIds = new Set(existingItems.map((item) => item.id));
      return { items: existingItems, ids: existingIds };
    }
  } catch (error) {
    log(`Error reading ${filename}, starting fresh`);
  }
  return { items: [], ids: new Set() };
}

async function fetchData(baseUrl, cursor = "", maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await new Promise((resolve, reject) => {
        const url = `${baseUrl}${cursor ? `&Cursor=${cursor}` : ""}`;
        const timeout = setTimeout(() => reject(new Error("Request timeout")), 30000);

        https
          .get(url, (res) => {
            clearTimeout(timeout);
            let data = "";

            if (res.statusCode !== 200) {
              reject(new Error(`HTTP Error: ${res.statusCode}`));
              return;
            }

            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                reject(new Error("JSON parsing error"));
              }
            });
          })
          .on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
      });

      return data;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function fetchFromAPI(apiInfo, existingData) {
  const apiItems = [];
  let nextPageCursor = null;
  let pageCount = 0;
  let newItemsCount = 0;
  let duplicateCount = 0;

  try {
    do {
      pageCount++;
      log(`${apiInfo.name} - Page ${pageCount}`);

      const response = await fetchData(apiInfo.baseUrl, nextPageCursor);

      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((item) => {
          if (existingData.ids.has(item.id)) {
            duplicateCount++;
          } else {
            const itemData = { id: item.id, name: item.name };

            if (item.bundledItems && Array.isArray(item.bundledItems)) {
              const bundledAssets = {};
              let counter = 1;

              item.bundledItems.forEach((bItem) => {
                if (bItem.type === "UserOutfit") return;

                const key = counter.toString();
                if (bItem.id) {
                  if (!bundledAssets[key]) bundledAssets[key] = [];
                  bundledAssets[key].push(bItem.id);
                }
                counter++;
              });

              if (Object.keys(bundledAssets).length > 0) {
                itemData.bundledItems = bundledAssets;
              }
            }

            apiItems.push(itemData);
            existingData.ids.add(item.id);
            newItemsCount++;
          }
        });
      }

      nextPageCursor = response.nextPageCursor;
      await new Promise((r) => setTimeout(r, 1000));
    } while (nextPageCursor && nextPageCursor.trim() !== "");
  } catch (err) {
    log(`Error in ${apiInfo.name}: ${err.message}`);
  }

  return { items: apiItems, newItems: newItemsCount, duplicates: duplicateCount };
}

function saveData(items, filename) {
  try {
    const output = {
      keyword: null,
      totalItems: items.length,
      lastUpdate: new Date().toISOString(),
      data: items,
    };
    fs.writeFileSync(filename, JSON.stringify(output, null, 2), "utf8");
    return true;
  } catch (err) {
    log(`Save error for ${filename}: ${err.message}`);
    return false;
  }
}

async function processAPIsByFile() {
  const startTime = Date.now();
  log("Starting combined update...");

  const apisByFile = {};
  APIs.forEach((api) => {
    if (!apisByFile[api.outputFile]) apisByFile[api.outputFile] = [];
    apisByFile[api.outputFile].push(api);
  });

  const results = {};

  for (const [filename, apis] of Object.entries(apisByFile)) {
    log(`Processing ${filename}...`);
    const existingData = loadExistingData(filename);
    const allItems = [...existingData.items];
    let totalNewItems = 0;
    let totalDuplicates = 0;

    for (const api of apis) {
      const result = await fetchFromAPI(api, existingData);
      allItems.push(...result.items);
      totalNewItems += result.newItems;
      totalDuplicates += result.duplicates;
      log(`${api.name} - New: ${result.newItems}, Duplicates: ${result.duplicates}`);
    }

    const saveSuccess = saveData(allItems, filename);
    results[filename] = { success: saveSuccess, totalItems: allItems.length, newItems: totalNewItems, duplicates: totalDuplicates };
    log(`${filename} - Total: ${allItems.length}, New: ${totalNewItems}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`All updates complete - Duration: ${duration}s`);

  return { results, duration };
}

async function main() {
  log("Starting Enhanced EmoteSniper with Animation support...");

  try {
    const { results } = await processAPIsByFile();

    let allSuccess = true;
    for (const [filename, result] of Object.entries(results)) {
      if (!result.success) {
        allSuccess = false;
        log(`Failed to save ${filename}`);
      } else {
        log(`✓ ${filename}: ${result.totalItems} items (${result.newItems} new)`);
      }
    }

    process.exit(allSuccess ? 0 : 1);
  } catch (err) {
    log(`Enhanced EmoteSniper error: ${err.message}`);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => { log(`Unhandled error: ${reason}`); process.exit(1); });
process.on("uncaughtException", (err) => { log(`Uncaught exception: ${err.message}`); process.exit(1); });

main();
