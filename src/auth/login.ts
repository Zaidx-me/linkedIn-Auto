import "dotenv/config";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import boxen from "boxen";
import readline from "readline";
import { chromium } from "playwright";
import { confirm } from "@inquirer/prompts";
import { CaptchaBlockedError } from "./captchaError";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILE_DIR = path.resolve(DATA_DIR, "chrome_profile");

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function main() {
  const header = boxen(
    `${chalk.bold.cyan("LinkedIn Login Setup")}\n${chalk.dim("Manual login in browser")}`,
    { padding: 1, margin: 1, borderStyle: "single", borderColor: "cyan" }
  );
  console.log(header);

  if (fs.existsSync(PROFILE_DIR)) {
    const ok = await confirm({
      message: "Clear existing session and re-authenticate?",
      default: true,
    });
    if (!ok) {
      console.log(`\n${chalk.dim("Skipped. Existing profile kept.")}\n`);
      return;
    }
    console.log(chalk.yellow("  Clearing old profile..."));
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  console.log(chalk.cyan("  Opening browser — log in to LinkedIn manually.\n"));

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    userAgent: USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/login", { waitUntil: "load", timeout: 60000 });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question("  Press Enter after logging in... ", () => resolve()));
  rl.close();

  await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded", timeout: 15000 });
  const url = page.url();

  if (url.includes("checkpoint") || url.includes("challenge")) {
    const screenshotPath = path.join(DATA_DIR, `challenge-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    await context.close();
    throw new CaptchaBlockedError(screenshotPath);
  }

  if (url.includes("/login") || url.includes("authwall")) {
    await context.close();
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    throw new Error("Login not detected. Make sure you complete the login before pressing Enter.");
  }

  await context.close();

  console.log(
    `\n${boxen(chalk.green("Login complete! Profile saved."), { padding: 1, borderColor: "green", borderStyle: "round" })}`
  );
  console.log(`  ${chalk.bold("npm run start -- \"your topic\"")}\n`);
}

main().catch((err) => {
  console.log(`\n${boxen(chalk.red(`Error: ${err.message}`), { padding: 1, borderColor: "red" })}\n`);
  process.exit(1);
});
