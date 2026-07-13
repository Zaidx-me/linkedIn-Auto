import "dotenv/config";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import boxen from "boxen";
import { confirm } from "@inquirer/prompts";
import { SessionManager } from "./session";

const PROFILE_DIR = path.resolve(__dirname, "../../data/chrome_profile");

async function main() {
  const header = boxen(
    `${chalk.bold.cyan("LinkedIn Login Setup")}\n${chalk.dim("Force re-authentication")}`,
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

  const mgr = new SessionManager();
  await mgr.ensureSession();

  console.log(
    `\n${boxen(chalk.green("Login complete! Run"), { padding: 1, borderColor: "green", borderStyle: "round" })}`
  );
  console.log(`  ${chalk.bold("npm run start -- \"your topic\"")}\n`);
}

main().catch((err) => {
  console.log(`\n${boxen(chalk.red(`Error: ${err.message}`), { padding: 1, borderColor: "red" })}\n`);
  process.exit(1);
});
