const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");

function fail(message) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
}

function satisfiesMinimumNodeVersion(version, minimum) {
    const [major, minor, patch = 0] = version.replace(/^v/, "").split(".").map(Number);
    const [minimumMajor, minimumMinor, minimumPatch = 0] = minimum.split(".").map(Number);
    return major > minimumMajor
        || (major === minimumMajor && minor > minimumMinor)
        || (major === minimumMajor && minor === minimumMinor && patch >= minimumPatch);
}

if (!satisfiesMinimumNodeVersion(process.version, "20.19.0")) {
    fail(`Node.js ${process.version} does not satisfy >=20.19.0.`);
} else {
    console.log(`PASS: Node.js ${process.version} satisfies >=20.19.0.`);
}

const viewsDirectory = path.join(root, "views");
let templateCount = 0;

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(entryPath);
        else if (entry.isFile() && entry.name.endsWith(".ejs")) {
            templateCount++;
            try {
                ejs.compile(fs.readFileSync(entryPath, "utf8"), {
                    filename: entryPath,
                });
            } catch (error) {
                fail(`${path.relative(root, entryPath)}: ${error.message}`);
            }
        }
    }
}

walk(viewsDirectory);
if (process.exitCode !== 1) {
    console.log(`PASS: ${templateCount} EJS templates compiled without syntax errors.`);
}

const envExamplePath = path.join(root, ".env.example");
const expectedKeys = [
    "NODE_ENV",
    "PORT",
    "MONGO_URL",
    "SESSION_SECRET",
    "CLOUD_NAME",
    "CLOUD_API_KEY",
    "CLOUD_API_SECRET",
    "CLOUDINARY_FOLDER",
    "MAP_TOKEN",
    "TRUST_PROXY",
    "CSP_MODE",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "SEED_OWNER_ID",
];

if (!fs.existsSync(envExamplePath)) {
    fail(".env.example is missing.");
} else {
    const envText = fs.readFileSync(envExamplePath, "utf8");
    const presentKeys = new Set(
        envText
            .split(/\r?\n/)
            .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
            .filter(Boolean)
    );
    const missingKeys = expectedKeys.filter((key) => !presentKeys.has(key));
    if (missingKeys.length > 0) {
        fail(`.env.example missing keys: ${missingKeys.join(", ")}`);
    } else {
        console.log(`PASS: .env.example contains all ${expectedKeys.length} expected keys.`);
    }
}

const npmExecPath = process.env.npm_execpath;
let testResult;
if (npmExecPath && npmExecPath.endsWith("npm-cli.js")) {
    testResult = spawnSync(process.execPath, [npmExecPath, "test"], {
        cwd: root,
        stdio: "inherit",
    });
} else {
    testResult = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["test"], {
        cwd: root,
        stdio: "inherit",
        shell: process.platform === "win32",
    });
}

if (testResult.error) {
    fail(`npm test could not be executed: ${testResult.error.message}`);
} else if (testResult.status !== 0) {
    fail(`npm test exited with status ${testResult.status}.`);
} else {
    console.log("PASS: npm test passed 100%.");
}

if (process.exitCode === 1) process.exit(1);
console.log("Pre-deploy verification passed.");
