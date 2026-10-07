// TypeScript/non-platform fallback. Metro chooses storage.native.ts or
// storage.web.ts for the actual target platform.
export { tokenStorage } from "./storage.web";
