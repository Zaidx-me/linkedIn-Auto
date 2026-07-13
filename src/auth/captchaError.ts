export class CaptchaBlockedError extends Error {
  constructor(screenshotPath: string) {
    super(`CAPTCHA blocked — manual intervention required. Screenshot saved to ${screenshotPath}`);
    this.name = "CaptchaBlockedError";
  }
}