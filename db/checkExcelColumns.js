const xlsx = require("xlsx");
const path = require("path");

const file = path.join(__dirname, "athletes_cleaned (1).xlsx");
const sheet = xlsx.readFile(file).Sheets[xlsx.readFile(file).SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

console.log("Detected column headers:\n", Object.keys(rows[0]));
