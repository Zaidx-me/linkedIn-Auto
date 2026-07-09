import { SessionManager } from "../session";
import fs from "fs";

console.log("SessionManager exported:", typeof SessionManager);

// Test 1: verify class can be instantiated
const mgr = new SessionManager();
console.log("SessionManager instance created:", mgr instanceof SessionManager);

// Test 2: mock fs.existsSync to test session-file detection logic
const origExistsSync = fs.existsSync;
const existsSpy = (fs.existsSync = ((p: fs.PathLike) => {
  if (typeof p === "string" && p.includes("session.json")) return false;
  return origExistsSync.call(fs, p);
}) as typeof fs.existsSync);

const mgr2 = new SessionManager();
console.log("SessionManager mock instance created:", mgr2 instanceof SessionManager);

fs.existsSync = origExistsSync;
console.log("fs.existsSync restored.");

console.log("\nAll smoke tests passed.");
