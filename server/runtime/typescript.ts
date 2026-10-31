import {fileURLToPath} from "node:url";
/** Single Node process; the tsx CLI's extra IPC listener is forbidden in the builder sandbox. */
export const typescriptArgs=(script:string,...args:string[])=>["--import",fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs",import.meta.url)),script,...args];
