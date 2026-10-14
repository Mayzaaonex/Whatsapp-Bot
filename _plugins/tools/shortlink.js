#!/usr/bin/env node

/**
 * CLI shortlink generator using mayzaa.netlify.app API
 * Usage: node shortlink.js <urltarget>
 */

import https from "https";

function shorten(targetUrl) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://mayzaa.netlify.app/short?=${targetUrl}`;

    https
      .get(apiUrl, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(new Error(`Gagal parse response: ${err.message}\nRaw response: ${data}`));
          }
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

async function main() {
  const urlTarget = process.argv[2];

  if (!urlTarget) {
    console.error("Pemakaian: node shortlink.js <urltarget>");
    console.error("Contoh  : node shortlink.js https://google.com");
    process.exit(1);
  }

  try {
    const result = await shorten(urlTarget);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();