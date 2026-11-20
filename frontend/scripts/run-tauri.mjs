#!/usr/bin/env node
import { spawn } from "node:child_process";

// Clean out Snap-injected GTK and GIO environment variables that break host GTK/WebKit
const snapVarsToClean = [
  "GTK_PATH",
  "GTK_EXE_PREFIX",
  "GSETTINGS_SCHEMA_DIR",
  "GDK_PIXBUF_MODULE_FILE",
  "GDK_PIXBUF_MODULEDIR",
  "GIO_MODULE_DIR",
  "LOCPATH",
  "GTK_MODULES",
  "LD_LIBRARY_PATH",
];

const env = { ...process.env };
for (const v of snapVarsToClean) {
  delete env[v];
}

// Restore clean system data directories if polluted by Snap
if (env.XDG_DATA_DIRS_VSCODE_SNAP_ORIG) {
  env.XDG_DATA_DIRS = env.XDG_DATA_DIRS_VSCODE_SNAP_ORIG;
}

// Ensure GDK_BACKEND defaults to x11 to avoid GNOME xsettings crash
if (!env.GDK_BACKEND) {
  env.GDK_BACKEND = "x11";
}

const args = process.argv.slice(2);
const child = spawn("npx", ["tauri", ...args], {
  stdio: "inherit",
  env,
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
