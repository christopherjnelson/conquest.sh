/**
 * Bun test preload (bunfig.toml [test] preload).
 *
 * Runs once before any test file. Sets CONQUEST_SESSION_DIR to a
 * per-run temp directory so GameClient never writes session files
 * into the project working directory or the developer's real
 * ~/.local/state/conquest.sh during tests.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "conquest-test-sessions-"));
process.env["CONQUEST_SESSION_DIR"] = sessionDir;
