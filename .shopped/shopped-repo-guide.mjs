#!/usr/bin/env -S tsx

// ../../scripts/repo-guide.ts
import { lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { pathToFileURL } from "url";

// app-frontend-csp.ts
var APP_FRONTEND_CSP_MAX_SOURCES = 8;
var ORIGIN_PATTERN = /^https:\/\/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?::(\d{1,5}))?$/;
function isAppFrontendCspOrigin(value) {
  const match = ORIGIN_PATTERN.exec(value);
  if (!match) return false;
  const [, host = "", port] = match;
  if (host.length > 253) return false;
  if (port !== void 0) {
    const number = Number(port);
    if (number < 1 || number > 65535 || port.startsWith("0")) return false;
  }
  return true;
}

// app-manifest.ts
var APP_MANIFEST_VERSION = 1;
var APP_DEPLOY_AUTO_MODES = ["off", "push", "checks"];
var APP_DEPLOY_MAX_REQUIRED_CHECKS = 20;
var APP_DEPLOY_MAX_CHECK_NAME_LENGTH = 200;
var ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
var BINDING_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
function isAppManifestId(value) {
  return ID_PATTERN.test(value);
}
function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function trimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function error(diagnostics, code, path, message) {
  diagnostics.push({ code, path, message, severity: "error" });
}
function warning(diagnostics, code, path, message) {
  diagnostics.push({ code, path, message, severity: "warning" });
}
function normalizeRelativePath(value) {
  const raw = trimmedString(value);
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || normalized.endsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return normalized;
}
function normalizeAppControllerPath(value) {
  const raw = trimmedString(value);
  if (!raw || raw.includes("\\")) return null;
  const normalized = normalizeRelativePath(raw);
  if (!normalized || normalized !== raw || !normalized.startsWith("controllers/") || !normalized.toLowerCase().endsWith(".ts")) {
    return null;
  }
  return normalized;
}
function normalizedRelativeHttpRoute(value, allowRoot) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return allowRoot ? "" : null;
  if (raw.startsWith("/") || raw.endsWith("/") || raw.includes("\\") || raw.includes("?") || raw.includes("#")) {
    return null;
  }
  const normalized = raw.replace(/^\.\//, "");
  if (!normalized) return allowRoot ? "" : null;
  for (const segment of normalized.split("/")) {
    if (!segment || segment === "." || segment === "..") return null;
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || Array.from(decoded).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })) {
      return null;
    }
  }
  return normalized;
}
function readRequiredString(obj, key, diagnostics) {
  const value = trimmedString(obj[key]);
  if (!value) {
    error(
      diagnostics,
      "required_string",
      `$.${key}`,
      `app.json requires a non-empty "${key}" string.`
    );
  }
  return value;
}
function normalizeDataSource(name, raw, diagnostics) {
  const path = `$.dataSources.${name}`;
  if (!BINDING_NAME_PATTERN.test(name)) {
    error(
      diagnostics,
      "invalid_data_source_name",
      path,
      `Data source "${name}" must start with a letter or underscore and use at most 64 letters, numbers, underscores, or hyphens.`
    );
    return null;
  }
  if (!isObject(raw)) {
    error(
      diagnostics,
      "invalid_data_source",
      path,
      `Data source "${name}" must be an object.`
    );
    return null;
  }
  const inferredType = raw.type ?? (raw.database ? "controller" : "script");
  switch (inferredType) {
    case "integration": {
      const integration = trimmedString(raw.integration);
      const operation = trimmedString(raw.operation);
      if (!integration || !operation || !/^[a-z][a-z0-9_-]{0,63}$/.test(integration) || !BINDING_NAME_PATTERN.test(operation) || !["read", "write"].includes(String(raw.access))) {
        error(
          diagnostics,
          "invalid_integration_data_source",
          path,
          "Integration sources require a registered provider/operation and explicit read or write access."
        );
        return null;
      }
      return {
        type: "integration",
        integration,
        operation,
        access: raw.access
      };
    }
    case "script": {
      const skill = trimmedString(raw.skill);
      const script = trimmedString(raw.script)?.replace(/\.ts$/i, "");
      const scriptId = trimmedString(raw.scriptId ?? raw.script_id);
      if (!scriptId && (!skill || !script)) {
        error(
          diagnostics,
          "invalid_script_data_source",
          path,
          `Script data source "${name}" requires scriptId or both skill and script.`
        );
        return null;
      }
      if (raw.access !== void 0 && raw.access !== "read" && raw.access !== "write") {
        error(
          diagnostics,
          "invalid_script_access",
          `${path}.access`,
          `Script data source "${name}" access must be "read" or "write".`
        );
        return null;
      }
      return {
        type: "script",
        ...skill ? { skill } : {},
        ...script ? { script } : {},
        ...scriptId ? { scriptId } : {},
        ...raw.access === "write" ? { access: "write" } : {}
      };
    }
    case "service": {
      const skill = trimmedString(raw.skill);
      const service = trimmedString(raw.service);
      if (!skill || !service) {
        error(
          diagnostics,
          "invalid_service_data_source",
          path,
          `Service data source "${name}" requires skill and service.`
        );
        return null;
      }
      return { type: "service", skill, service };
    }
    case "controller": {
      const controllerPath = normalizeAppControllerPath(raw.path);
      const skill = trimmedString(raw.skill);
      const script = trimmedString(raw.script)?.replace(/\.ts$/i, "");
      const database = trimmedString(raw.database);
      const hasPath = raw.path !== void 0;
      const hasLegacyReference = raw.skill !== void 0 || raw.script !== void 0 || raw.scriptId !== void 0 || raw.script_id !== void 0 || raw.scriptRef !== void 0;
      if (hasPath && hasLegacyReference) {
        error(
          diagnostics,
          "ambiguous_controller_reference",
          path,
          `Controller data source "${name}" cannot combine path with skill, script, scriptId, or scriptRef.`
        );
        return null;
      }
      if (hasPath && !controllerPath) {
        error(
          diagnostics,
          "invalid_controller_path",
          `${path}.path`,
          `Controller data source "${name}" path must be a normalized app-relative .ts file under controllers/.`
        );
        return null;
      }
      if (!controllerPath && (!skill || !script) || !database) {
        error(
          diagnostics,
          "invalid_controller_data_source",
          path,
          `Controller data source "${name}" requires path and database, or legacy skill, script, and database.`
        );
        return null;
      }
      if (raw.access !== void 0 && raw.access !== "read" && raw.access !== "write") {
        error(
          diagnostics,
          "invalid_controller_access",
          `${path}.access`,
          `Controller data source "${name}" access must be "read" or "write".`
        );
        return null;
      }
      return {
        type: "controller",
        ...controllerPath ? { path: controllerPath } : { skill, script },
        database,
        access: raw.access === "write" ? "write" : "read"
      };
    }
    default:
      error(
        diagnostics,
        "unsupported_data_source_type",
        `${path}.type`,
        `Data source "${name}" has unsupported type "${String(inferredType)}".`
      );
      return null;
  }
}
function normalizeDataSources(canonical, legacy, diagnostics) {
  const merged = {};
  if (legacy !== void 0) {
    if (isObject(legacy)) Object.assign(merged, legacy);
    else
      error(
        diagnostics,
        "invalid_data_sources",
        "$.scriptDataSources",
        "scriptDataSources must be an object."
      );
  }
  if (canonical !== void 0) {
    if (isObject(canonical)) Object.assign(merged, canonical);
    else
      error(
        diagnostics,
        "invalid_data_sources",
        "$.dataSources",
        "dataSources must be an object."
      );
  }
  const normalized = {};
  for (const [name, source] of Object.entries(merged)) {
    const value = normalizeDataSource(name, source, diagnostics);
    if (value) normalized[name] = value;
  }
  return normalized;
}
function normalizeServices(raw, diagnostics) {
  if (raw === void 0) return {};
  if (!isObject(raw)) {
    error(
      diagnostics,
      "invalid_services",
      "$.services",
      "services must be an object keyed by service name."
    );
    return {};
  }
  const services = {};
  for (const [name, value] of Object.entries(raw)) {
    const path = `$.services.${name}`;
    if (!ID_PATTERN.test(name)) {
      error(
        diagnostics,
        "invalid_service_name",
        path,
        `Service "${name}" must be a lowercase kebab-case identifier.`
      );
      continue;
    }
    let candidate = null;
    if (typeof value === "string") candidate = value;
    else if (isObject(value)) candidate = value.path;
    const servicePath = normalizeRelativePath(candidate);
    if (!servicePath) {
      error(
        diagnostics,
        "invalid_service_path",
        path,
        `Service "${name}" requires a repository-relative path.`
      );
      continue;
    }
    services[name] = { path: servicePath };
  }
  return services;
}
function normalizeDatabase(raw, diagnostics) {
  if (raw === void 0 || raw === null) return null;
  if (!isObject(raw)) {
    error(
      diagnostics,
      "invalid_database",
      "$.database",
      "database must be an object when present."
    );
    return null;
  }
  const name = trimmedString(raw.name);
  if (!name || !ID_PATTERN.test(name)) {
    error(
      diagnostics,
      "invalid_database_name",
      "$.database.name",
      "database.name must be a lowercase kebab-case identifier."
    );
    return null;
  }
  const migrations = raw.migrations === void 0 ? null : normalizeRelativePath(raw.migrations);
  if (raw.migrations !== void 0) {
    warning(
      diagnostics,
      "repository_migrations_ignored",
      "$.database.migrations",
      "database.migrations is no longer executed during publish and is ignored. Manage schema with the workspace database system."
    );
  }
  const minimumMigration = trimmedString(
    raw.minimumMigration ?? raw.minimum_migration
  );
  return {
    name,
    ...migrations ? { migrations } : {},
    ...minimumMigration ? { minimumMigration } : {}
  };
}
function normalizeCapabilities(raw, diagnostics) {
  const capabilities = { pipelineInvoke: false };
  if (raw === void 0 || raw === null) return capabilities;
  if (!isObject(raw)) {
    error(
      diagnostics,
      "invalid_capabilities",
      "$.capabilities",
      "capabilities must be an object of boolean flags when present."
    );
    return capabilities;
  }
  const pipelineInvoke = raw.pipelineInvoke ?? raw.pipeline_invoke;
  if (pipelineInvoke !== void 0) {
    if (typeof pipelineInvoke !== "boolean") {
      error(
        diagnostics,
        "invalid_capability_flag",
        "$.capabilities.pipelineInvoke",
        "capabilities.pipelineInvoke must be a boolean."
      );
    } else {
      capabilities.pipelineInvoke = pipelineInvoke;
    }
  }
  return capabilities;
}
var DEPLOY_KEYS = /* @__PURE__ */ new Set([
  "auto",
  "branch",
  "requiredChecks",
  "required_checks"
]);
var DEPLOY_BRANCH_PATTERN = /^[\w./-]{1,200}$/;
function normalizeDeploy(raw, diagnostics) {
  const off = { auto: "off", branch: null, requiredChecks: [] };
  if (raw === void 0 || raw === null) return off;
  if (!isObject(raw)) {
    error(
      diagnostics,
      "invalid_deploy",
      "$.deploy",
      "deploy must be an object with auto, branch and requiredChecks when present."
    );
    return off;
  }
  for (const key of Object.keys(raw)) {
    if (!DEPLOY_KEYS.has(key)) {
      error(
        diagnostics,
        "unknown_deploy_key",
        `$.deploy.${key}`,
        `Unknown deploy key "${key}". Supported keys: auto, branch, requiredChecks.`
      );
    }
  }
  let auto = "off";
  if (raw.auto === void 0) {
    error(
      diagnostics,
      "deploy_auto_required",
      "$.deploy.auto",
      'deploy.auto is required when a deploy block is present. Use "off", "push" or "checks".'
    );
  } else if (typeof raw.auto !== "string" || !APP_DEPLOY_AUTO_MODES.includes(raw.auto)) {
    error(
      diagnostics,
      "invalid_deploy_auto",
      "$.deploy.auto",
      'deploy.auto must be "off", "push" or "checks".'
    );
  } else {
    auto = raw.auto;
  }
  let branch = null;
  if (raw.branch !== void 0 && raw.branch !== null) {
    const value = trimmedString(raw.branch);
    if (!value || !DEPLOY_BRANCH_PATTERN.test(value) || value.startsWith("/") || value.includes("..")) {
      error(
        diagnostics,
        "invalid_deploy_branch",
        "$.deploy.branch",
        'deploy.branch must be a branch name such as "main".'
      );
    } else {
      branch = value;
    }
  }
  const requiredChecks = [];
  const rawChecks = raw.requiredChecks ?? raw.required_checks;
  if (rawChecks !== void 0) {
    if (!Array.isArray(rawChecks)) {
      error(
        diagnostics,
        "invalid_deploy_required_checks",
        "$.deploy.requiredChecks",
        "deploy.requiredChecks must be an array of check names."
      );
    } else {
      if (rawChecks.length > APP_DEPLOY_MAX_REQUIRED_CHECKS) {
        error(
          diagnostics,
          "too_many_deploy_required_checks",
          "$.deploy.requiredChecks",
          `deploy.requiredChecks may list at most ${APP_DEPLOY_MAX_REQUIRED_CHECKS} checks.`
        );
      }
      rawChecks.forEach((entry, index) => {
        const name = trimmedString(entry);
        const path = `$.deploy.requiredChecks[${index}]`;
        if (!name || name.length > APP_DEPLOY_MAX_CHECK_NAME_LENGTH) {
          error(
            diagnostics,
            "invalid_deploy_required_check",
            path,
            `Each required check must be a non-empty string of at most ${APP_DEPLOY_MAX_CHECK_NAME_LENGTH} characters.`
          );
        } else if (requiredChecks.includes(name)) {
          error(
            diagnostics,
            "duplicate_deploy_required_check",
            path,
            `Required check "${name}" is listed more than once.`
          );
        } else {
          requiredChecks.push(name);
        }
      });
    }
  }
  if (auto === "checks" && requiredChecks.length === 0) {
    error(
      diagnostics,
      "deploy_required_checks_missing",
      "$.deploy.requiredChecks",
      'deploy.auto "checks" requires at least one entry in deploy.requiredChecks.'
    );
  } else if (auto !== "checks" && requiredChecks.length > 0) {
    warning(
      diagnostics,
      "deploy_required_checks_ignored",
      "$.deploy.requiredChecks",
      'deploy.requiredChecks only applies when deploy.auto is "checks" and is ignored.'
    );
  }
  return { auto, branch, requiredChecks };
}
function normalizeFrontend(raw, legacyEntry, legacy, diagnostics) {
  const frontend = isObject(raw) ? raw : null;
  const declaredKind = frontend?.kind ?? (legacy ? "sealed-view" : null);
  let kind = declaredKind;
  if (kind === "node") {
    kind = "server";
    warning(
      diagnostics,
      "node_frontend_deprecated",
      "$.frontend.kind",
      'frontend.kind "node" was normalized to the language-agnostic "server" kind.'
    );
  }
  if (kind !== "static" && kind !== "server" && kind !== "sealed-view") {
    error(
      diagnostics,
      "invalid_frontend_kind",
      "$.frontend.kind",
      'frontend.kind must be "static", "server", or "sealed-view".'
    );
    return null;
  }
  let entryValue = frontend?.entry ?? legacyEntry;
  if (legacy && entryValue === void 0) entryValue = "App.tsx";
  const entry = normalizeRelativePath(entryValue);
  if (!entry) {
    error(
      diagnostics,
      "invalid_frontend_entry",
      "$.frontend.entry",
      "frontend.entry must be a repository-relative file path."
    );
    return null;
  }
  let build;
  if (frontend?.build !== void 0) {
    if (kind !== "static") {
      error(
        diagnostics,
        "frontend_build_requires_static",
        "$.frontend.build",
        "frontend.build is supported only for static frontends."
      );
    } else if (!isObject(frontend.build)) {
      error(
        diagnostics,
        "invalid_frontend_build",
        "$.frontend.build",
        "frontend.build must be an object with command and output strings."
      );
    } else {
      const command = trimmedString(frontend.build.command);
      const output = normalizeRelativePath(frontend.build.output);
      if (!command || command.length > 2048) {
        error(
          diagnostics,
          "invalid_frontend_build_command",
          "$.frontend.build.command",
          "frontend.build.command must be a non-empty string of at most 2048 characters."
        );
      }
      if (!output) {
        error(
          diagnostics,
          "invalid_frontend_build_output",
          "$.frontend.build.output",
          "frontend.build.output must be a repository-relative directory path."
        );
      } else {
        const separator = entry.lastIndexOf("/");
        const entryDirectory = separator > 0 ? entry.slice(0, separator) : null;
        if (output !== entryDirectory) {
          error(
            diagnostics,
            "frontend_build_output_mismatch",
            "$.frontend.build.output",
            `frontend.build.output must match the entry artifact directory "${entryDirectory ?? ""}".`
          );
        }
      }
      if (command && command.length <= 2048 && output) {
        build = { command, output };
      }
    }
  }
  const csp = frontend?.csp === void 0 ? null : normalizeFrontendCsp(frontend.csp, kind, diagnostics);
  return { kind, entry, ...build ? { build } : {}, ...csp ? { csp } : {} };
}
var FRONTEND_CSP_KEYS = /* @__PURE__ */ new Map([
  ["styleSrc", "styleSrc"],
  ["fontSrc", "fontSrc"]
]);
function normalizeFrontendCsp(raw, kind, diagnostics) {
  if (kind === "sealed-view") {
    error(
      diagnostics,
      "frontend_csp_requires_repository_frontend",
      "$.frontend.csp",
      "frontend.csp is supported only for static and server frontends."
    );
    return null;
  }
  if (!isObject(raw)) {
    error(
      diagnostics,
      "invalid_frontend_csp",
      "$.frontend.csp",
      "frontend.csp must be an object with styleSrc and/or fontSrc arrays."
    );
    return null;
  }
  const csp = { styleSrc: [], fontSrc: [] };
  for (const [key, value] of Object.entries(raw)) {
    const target = FRONTEND_CSP_KEYS.get(key);
    const path = `$.frontend.csp.${key}`;
    if (!target) {
      error(
        diagnostics,
        "unknown_frontend_csp_key",
        path,
        `Unknown frontend.csp key "${key}". Supported keys: styleSrc, fontSrc. Scripts, connections and frames cannot be widened; media and images already allow any HTTPS URL.`
      );
      continue;
    }
    if (!Array.isArray(value)) {
      error(
        diagnostics,
        "invalid_frontend_csp_sources",
        path,
        `frontend.csp.${key} must be an array of origin strings.`
      );
      continue;
    }
    value.forEach((entry, index) => {
      const source = typeof entry === "string" ? entry.trim().toLowerCase() : "";
      if (!isAppFrontendCspOrigin(source)) {
        error(
          diagnostics,
          "invalid_frontend_csp_source",
          `${path}[${index}]`,
          `frontend.csp.${key} entries must be exact HTTPS origins such as "https://fonts.googleapis.com": no wildcard, path, IP address or CSP keyword.`
        );
      } else if (!csp[target].includes(source)) {
        csp[target].push(source);
      }
    });
    if (csp[target].length > APP_FRONTEND_CSP_MAX_SOURCES) {
      error(
        diagnostics,
        "too_many_frontend_csp_sources",
        path,
        `frontend.csp.${key} may list at most ${APP_FRONTEND_CSP_MAX_SOURCES} origins.`
      );
    }
  }
  return csp.styleSrc.length > 0 || csp.fontSrc.length > 0 ? csp : null;
}
function normalizeSurfaces(raw, frontend, appTitle, legacy, diagnostics) {
  if (!frontend) return [];
  if (raw === void 0 && legacy) {
    return [
      {
        id: "main",
        kind: "standalone",
        title: appTitle,
        entry: frontend.entry
      }
    ];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    error(
      diagnostics,
      "invalid_surfaces",
      "$.surfaces",
      "surfaces must be a non-empty array."
    );
    return [];
  }
  const surfaces = [];
  const ids = /* @__PURE__ */ new Set();
  raw.forEach((value, index) => {
    const path = `$.surfaces[${index}]`;
    if (!isObject(value)) {
      error(
        diagnostics,
        "invalid_surface",
        path,
        "Each surface must be an object."
      );
      return;
    }
    const id = trimmedString(value.id);
    if (!id || !ID_PATTERN.test(id)) {
      error(
        diagnostics,
        "invalid_surface_id",
        `${path}.id`,
        "Surface id must be a lowercase kebab-case identifier."
      );
      return;
    }
    if (ids.has(id)) {
      error(
        diagnostics,
        "duplicate_surface_id",
        `${path}.id`,
        `Surface id "${id}" is declared more than once.`
      );
      return;
    }
    const kind = value.kind;
    if (kind !== "standalone" && kind !== "card" && kind !== "widget") {
      error(
        diagnostics,
        "invalid_surface_kind",
        `${path}.kind`,
        'Surface kind must be "standalone", "card", or "widget".'
      );
      return;
    }
    let entry;
    if (frontend.kind === "server") {
      entry = value.entry === void 0 ? "" : normalizedRelativeHttpRoute(value.entry, true);
    } else {
      entry = value.entry === void 0 ? frontend.entry : normalizeRelativePath(value.entry);
    }
    if (entry === null) {
      error(
        diagnostics,
        "invalid_surface_entry",
        `${path}.entry`,
        frontend.kind === "server" ? "Server surface entry must be a relative HTTP route without a leading slash, query, or fragment. Omit it or use an empty string to mount the service root." : "Surface entry must be a repository-relative file path."
      );
      return;
    }
    if (frontend.kind === "sealed-view" && entry !== frontend.entry) {
      error(
        diagnostics,
        "sealed_surface_entry_mismatch",
        `${path}.entry`,
        `Sealed-view surfaces must use the compiled frontend entry "${frontend.entry}".`
      );
      return;
    }
    ids.add(id);
    surfaces.push({
      id,
      kind,
      title: trimmedString(value.title) ?? appTitle,
      entry
    });
  });
  return surfaces;
}
function normalizedLegacyId(appSlug, fallback, diagnostics) {
  if (appSlug && isAppManifestId(appSlug)) return appSlug;
  const fallbackId = trimmedString(fallback);
  if (fallbackId && isAppManifestId(fallbackId)) {
    if (appSlug) {
      warning(
        diagnostics,
        "legacy_app_slug_compatibility",
        "$.appSlug",
        `Legacy appSlug "${appSlug}" remains the durable app URL, while manifest identity uses the compatible app-directory slug "${fallbackId}".`
      );
    }
    return fallbackId;
  }
  error(
    diagnostics,
    "legacy_identity_required",
    "$.appSlug",
    "Legacy app.json needs appSlug or a lowercase app-directory slug so it can receive stable app identity."
  );
  return null;
}
function parseAppManifest(input, options = {}) {
  const diagnostics = [];
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      error(
        diagnostics,
        "invalid_json",
        "$",
        `app.json must be valid JSON: ${detail}`
      );
      return { ok: false, manifest: null, diagnostics };
    }
  }
  if (!isObject(parsed)) {
    error(
      diagnostics,
      "invalid_root",
      "$",
      "app.json must contain a JSON object."
    );
    return { ok: false, manifest: null, diagnostics };
  }
  const versionValue = parsed.version ?? parsed.manifestVersion;
  const legacy = versionValue === void 0;
  if (!legacy && versionValue !== APP_MANIFEST_VERSION) {
    error(
      diagnostics,
      "unsupported_version",
      "$.version",
      `Unsupported app manifest version "${String(versionValue)}". This runtime supports version ${APP_MANIFEST_VERSION}.`
    );
  }
  const title = readRequiredString(parsed, "title", diagnostics) ?? "";
  const declaredOwnerSkill = trimmedString(
    parsed.ownerSkill ?? parsed.owner_skill
  );
  const ownerSkill = declaredOwnerSkill ?? options.expectedOwnerSkill ?? "";
  if (options.requireOwnerSkill && !declaredOwnerSkill) {
    error(
      diagnostics,
      "owner_skill_required",
      "$.ownerSkill",
      'app.json is missing required string "ownerSkill".'
    );
  } else if (!ownerSkill) {
    error(
      diagnostics,
      "owner_skill_required",
      "$.ownerSkill",
      "app.json requires ownerSkill."
    );
  } else if (options.expectedOwnerSkill && ownerSkill !== options.expectedOwnerSkill) {
    error(
      diagnostics,
      "owner_skill_mismatch",
      "$.ownerSkill",
      `app.json ownerSkill "${ownerSkill}" does not match containing skill "${options.expectedOwnerSkill}".`
    );
  }
  const appSlug = trimmedString(parsed.appSlug ?? parsed.app_slug);
  const canonicalId = trimmedString(parsed.id);
  let id;
  if (legacy) {
    id = normalizedLegacyId(appSlug, options.legacyAppId, diagnostics);
    warning(
      diagnostics,
      "legacy_manifest_normalized",
      "$",
      `Legacy app.json was normalized to manifest version ${APP_MANIFEST_VERSION} with a sealed-view frontend and standalone surface.`
    );
  } else {
    id = canonicalId;
    if (!id || !ID_PATTERN.test(id)) {
      error(
        diagnostics,
        "invalid_app_id",
        "$.id",
        "Manifest v1 id must be a lowercase kebab-case identifier."
      );
      id = null;
    }
  }
  const frontend = normalizeFrontend(
    parsed.frontend,
    parsed.entry,
    legacy,
    diagnostics
  );
  const surfaces = normalizeSurfaces(
    parsed.surfaces,
    frontend,
    title,
    legacy,
    diagnostics
  );
  const services = normalizeServices(parsed.services, diagnostics);
  const dataSources = normalizeDataSources(
    parsed.dataSources ?? parsed.data_sources,
    parsed.scriptDataSources ?? parsed.script_data_sources ?? parsed.app_data_sources,
    diagnostics
  );
  const database = normalizeDatabase(parsed.database, diagnostics);
  const capabilities = normalizeCapabilities(parsed.capabilities, diagnostics);
  const deploy = normalizeDeploy(parsed.deploy, diagnostics);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error") || !id || !frontend) {
    return { ok: false, manifest: null, diagnostics };
  }
  return {
    ok: true,
    manifest: {
      version: APP_MANIFEST_VERSION,
      id,
      title,
      icon: trimmedString(parsed.icon ?? parsed.appIcon ?? parsed.app_icon),
      ownerSkill,
      frontend,
      surfaces,
      services,
      dataSources,
      database,
      capabilities,
      deploy,
      compatibility: {
        source: legacy ? "legacy-app-json" : "v1",
        appSlug
      }
    },
    diagnostics
  };
}

// repo-agent-guide.generated.ts
var REPO_AGENT_GUIDE_BUNDLE = {
  "metadata": {
    "version": 3,
    "sourceSha": "5437492e590358d1375e633b7dd12462ace7cbc2",
    "digest": "423904d649c7775744913a488df708e044338d994fac9d485d69aa5df60622cd",
    "contractDigest": "1819b9577269cb7cecf06ddcd613f7a6686382454bf2a430313364072b9195c3",
    "managedFiles": {
      ".shopped/agent-guide.md": "7c17dd47396d5b912c102d15f713689a36fa1173b8d770e2ca453ad7e4751c56",
      ".claude/skills/shopped-hosting/SKILL.md": "ca0800978204248d15d84d69ed88ad5076b4edac62e910bedf456d6a0d83285a"
    }
  },
  "files": {
    ".shopped/agent-guide.md": "# Developing a Git-backed Shopped app\n\nGeneric contract; customer paths, test commands and migration authority belong\nin `docs/SHOPPED-HOSTING.md`. Limits below are generated from platform code.\n\n## Source and runtime\n- Keep executable source in the bound repo, not a second workspace copy.\n  `app.json` version 1 owns frontends, surfaces, services and logical databases.\n- Normalized manifest fields: `capabilities`, `compatibility`, `dataSources`, `database`, `deploy`, `frontend`, `icon`, `id`, `ownerSkill`, `services`, `surfaces`, `title`, `version`.\n- Resolve frontend entries from the manifest directory; services from the binding\n  root. Preserve the framework; don't rewrite it to evade host limits.\n- Server frontends have `service.json` beside their entry; listen on injected\n  PORT, keep health inert/fast, and authenticate before private handlers.\n- Keep locked dependencies in the persisted repository environment, not a\n  build-container home. Separate install from build when supported.\n\n## Browser URLs and identity\n- Resolve browser URLs below the injected base href, never the origin root.\n  Root links, fetch('/api'), CSS url(/...), srcset, history and router basenames\n  escape the mount. Use relative build output and runtime-base-aware helpers.\n- Backend requests arrive mount-stripped. DOM rewriting cannot fix preloads.\n  Use path-only self redirects, not absolute URLs built from upstream Host\n  (which may be app-backend.internal). Test mount/slash redirects.\n- Use SDK fetch/data APIs; native fetch lacks embed credentials. Never call\n  the private service origin directly from browser code.\n- The authenticated proxy strips cookies/Authorization and app Set-Cookie.\n  Trust X-Shopped-Identity and X-Shopped-Identity-Sig only behind that proxy.\n  Base64 JSON has userId, workspaceId, role and millisecond exp, not email;\n  optional app-scope claims may also exist. Validate fields/expiry, scope data\n  by workspace and fail closed without identity. Never infer client email.\n- Prefer SDK session.signIn for standalone sign-in. Embedded shells are public\n  and inert so the parent can bootstrap; private data/actions require identity.\n  Do not start OAuth in an iframe or add a runtime identity bypass.\n- Sandbox preview identity requires the supported workspace-member sign-in flow;\n  anonymous/direct-loopback requests have no identity. Synthetic identity is\n  for test transports only, never a public dev-server bypass.\n- service.json public paths (at most 32 per list) are explicit prefixes:\n  /mcp also covers /mcp/x, not /mcpx. Public calls have identity stripped and\n  need app-owned auth. Never widen a prefix to repair UI URLs; test each hostname.\n\n## Browser policy and cache\n- The viewer owns CSP. frontend.csp supports only `fontSrc`/`styleSrc`:\n  up to 8 exact HTTPS origins per list, no wildcards/paths/IPs/keywords.\n  Vendor scripts; these fields cannot open external script/fetch connections.\n  HTTPS images/audio/video are already allowed, including media redirects.\n- Server responses default no-store. Eligible successful GET/HEAD assets on\n  isolated origins can opt in with positive max-age, no identity/Set-Cookie\n  headers and Vary absent or only Accept-Encoding. The viewer clamps to\n  86400 seconds, private, must-revalidate; shared/CDN caching stays disabled.\n  HTML/JSON/APIs remain no-store. Never cache personal data as an asset.\n- Hash/version asset URLs when bytes change. Strip incidental cookies only from\n  non-personal assets: cached bytes can outlive sign-out until expiry.\n\n## Env, storage and jobs\n- service.json env has at most 64 entries. Reserved injected names:\n  `DATABASE_URL`, `DATABASE_URL_PSYCOPG`, `PORT`, `SHOPPED_*`. Count total and per-environment entries before adding any.\n- Declare literal strings or secret names, never secret values. List new vars\n  and secret names in the PR for the owner; new values require a republish.\n  Missing required config blocks release; do not invent optional syntax.\n- Disk is ephemeral unless supported persistentData is enabled. Put durable\n  service files on /data, not scratch; overlapping releases share the volume.\n  Keep files compatible and arrange backups: a volume is not a backup.\n- Review resources/storage with the owner. alwaysOn prevents idle freezing for\n  scheduled work and consumes continuous capacity; request-only apps may not need it.\n- Scheduled jobs check SHOPPED_SERVICE_LIVE_FILE (/run/shopped/live) before jobs\n  and between batches. Healthy candidates aren't live. Keep effects idempotent\n  or use leases; marker checks do not cancel in-flight calls. Request-spawned\n  work must honor the app's kill switch where provided.\n\n## Migrations and releases\n- Record the database's single migration authority in the customer runbook.\n  If app-owned, never use database_migration_*: an independent tool ledger\n  diverges from the app history. Do not switch an established authority casually.\n- Current publication does not execute repository migrations. The owner applies\n  them before publish. App-owned migrations work may change this contract;\n  follow shipped behavior for this app, not proposed automation.\n- Keep migrations compatible with the still-running release: apply precedes\n  publish and releases overlap. Expand first with nullable columns/new tables;\n  remove/rename only in a later contract release.\n- Add one revision per schema PR, chained to main's current head; rebase if it\n  moved. Never edit applied history. Flag the revision in the PR title, update\n  head assertions and test indexes/constraints/grants with disposable Postgres.\n- Runtime credentials read/write data, not schema. Do not add startup DDL or\n  use an owner credential to bypass a failed upgrade.\n- Check startup revision policy. Exact equality to bundled head prevents old\n  releases restarting or pre-migration rollback booting after migration. Flag\n  that hazard; prefer tested compatible-revision acceptance where supported.\n- Close clean read transactions before slow provider calls (SELECT starts one\n  too). Preserve atomic writes and test disposable Postgres, not only SQLite.\n- Branch \u2192 tests \u2192 PR \u2192 current-head CI/review \u2192 authorized publication of the\n  exact bound branch-head SHA. If auto-deploy is enabled, a merge can publish.\n  Complete owner prerequisites and deployment authorization before that merge.\n  Report merged/activated SHAs separately; never enable auto-deploy as a repair.\n- Before PR: state revision/compatibility/restart policy, env count/secret names,\n  public/CSP and resources/storage changes (or explicitly none).\n\n## Proof without platform access\n- Use fixtures for nested mount/query/hash, masked Host, stripped backend paths,\n  missing/expired synthetic identity rejection, no-base localhost, cache/public\n  paths and disposable schema cases. Stub providers and disable schedulers.\n- Local tests don't prove real sign-in/ingress/activation; the owner checks those\n  after publication. Never perform owner-only operations without approval.\n",
    ".claude/skills/shopped-hosting/SKILL.md": "---\nname: shopped-hosting\ndescription: Develop a Git-backed Shopped app. Use for routing/assets, auth/public paths, CSP/cache, service env/secrets/storage/resources, jobs, schema work, releases and hosted-only regressions, even when localhost works.\n---\nRead the repo entry point, `.shopped/agent-guide.md` and customer hosting facts\nin `docs/SHOPPED-HOSTING.md`. Add a failing local regression for the affected\ncontract. Exercise nested mounts and no-base localhost, including absent/expired\nidentity rejection. Synthetic identity belongs only in test fixtures.\nRun the contract checker and application CI, including disposable database tests.\nComplete the customer pre-PR checklist: revision and compatible parent, env count\nand new secret names, public/CSP and resource/storage changes. Flag migrations\nand restart/rollback hazards to the owner. Report the tested SHA and owner\nprerequisites, not a deploy. Never perform owner operations without approval.\n"
  },
  "entry": "<!-- SHOPPED-HOSTING:BEGIN version=3 -->\n## Shopped hosting \u2014 read before app changes\nRead `.shopped/agent-guide.md` and customer facts/test commands in\n`docs/SHOPPED-HOSTING.md`; Claude Code also has the repo-local hosting skill.\n- Keep browser paths below the injected base/mount, not the origin root.\n- Use platform identity; don't invent hosted cookie sessions or email claims.\n- Keep secret values out of Git; list env/secret names for the owner.\n- Preserve manifest CSP, public-path boundaries and opt-in non-personal caching.\n- Fence scheduled jobs for live-only execution; keep external effects idempotent.\n- Test nested mounted and no-base modes; synthetic identity only in tests.\n- Flag migrations in the PR title; one compatible revision chained to main's head.\n  App-owned history never uses database_migration_*.\n- PR \u2192 CI/review \u2192 authorized exact-SHA release. Check auto-deploy before merge:\n  when enabled, merging can publish. Complete owner prerequisites first; never\n  perform owner-only operations or a production-deploying merge without approval.\n<!-- SHOPPED-HOSTING:END -->\n",
  "customer": "# Customer hosting facts\n\nOwner: fill in these facts before release. Generic rules are in\n`.shopped/agent-guide.md`; do not duplicate them here. No live IDs or secrets.\n\n- Effective app root and manifest:\n- Server entry, service roots and health path:\n- Browser base helpers and synthetic identity/mount fixtures:\n- Local focused/full CI commands (stub providers; disable external effects):\n- Disposable database test command:\n- Public host/alias \u2192 prefix map (identity stripped on public paths):\n- Auto-deploy state (verify manifest and binding allowance):\n- Single migration authority (app-owned histories forbid database_migration_*):\n- Migration apply timing and startup accepted revisions/restart/rollback policy:\n- Environment entry count, owner-provisioned secret names (never values):\n\n## Pre-PR checklist\n- Revision (flag in title), main's parent and backward compatibility:\n- Restart/rollback policy and owner prerequisites:\n- Resulting env count/limit and new secret names:\n- Public-path/CSP changes and regression tests:\n- Resources/storage changes and owner review:\n"
};

// repo-agent-guide.ts
function guideRoot(root) {
  if (root && (root.startsWith("/") || root.includes("\\") || root.includes("\0") || root.split("/").some((part) => !part || part === "." || part === ".."))) {
    throw new Error("Guide root must be an exact repository-relative directory");
  }
  return root;
}
function guidePath(root, path) {
  return root ? `${guideRoot(root)}/${path}` : path;
}
async function hash(content) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
var BEGIN = "<!-- SHOPPED-HOSTING:BEGIN ";
var END = "<!-- SHOPPED-HOSTING:END -->";
function managedBlock(content) {
  const start = content.indexOf(BEGIN);
  if (start === -1) {
    if (content.includes(END)) throw new Error("Unpaired hosting end marker");
    return null;
  }
  const end = content.indexOf(END, start);
  if (end === -1 || content.indexOf(BEGIN, start + 1) !== -1 || content.indexOf(END, end + END.length) !== -1) {
    throw new Error("Conflicting hosting managed markers");
  }
  return { start, end: end + END.length, text: content.slice(start, end + END.length) };
}
function entryFile(files, root, name) {
  let path = guidePath(root, name);
  let file = files[path];
  if (file?.mode === "120000") {
    const target = file.content.replace(/^\.\//, "");
    if (!["AGENTS.md", "CLAUDE.md"].includes(target) || target === name) throw new Error(`${path}: unsupported symlink; preserve and review manually`);
    path = guidePath(root, target);
    file = files[path];
    if (file?.mode === "120000") throw new Error(`${path}: cyclic/indirect symlink`);
  }
  return { path, file };
}
function scopeLink(root) {
  return `<!-- SHOPPED-HOSTING:LINK ${root} -->
For the app in ${root}, read [its agent entry point](${root}/AGENTS.md).
`;
}
function installedMetadata(files, root) {
  const file = files[guidePath(root, ".shopped/agent-guide-version.json")];
  if (!file) return null;
  if (file.mode === "120000") throw new Error("Guide metadata cannot be a symlink");
  const parsed = JSON.parse(file.content);
  if (!parsed || !Number.isSafeInteger(parsed.version) || typeof parsed.digest !== "string") throw new Error("Invalid installed guide metadata");
  return parsed;
}
async function repoGuideWarning(files, root = "") {
  const path = guidePath(root, ".shopped/agent-guide-version.json");
  try {
    const metadata = installedMetadata(files, root);
    if (metadata?.version === REPO_AGENT_GUIDE_BUNDLE.metadata.version && metadata.digest === REPO_AGENT_GUIDE_BUNDLE.metadata.digest) {
      let valid = true;
      for (const [relative, expected] of Object.entries(REPO_AGENT_GUIDE_BUNDLE.metadata.managedFiles)) {
        const file = files[guidePath(root, relative)];
        if (!file || file.mode === "120000" || await hash(file.content) !== expected) valid = false;
      }
      const expectedEntry = REPO_AGENT_GUIDE_BUNDLE.entry.trimEnd();
      const expectedEntryDigest = await hash(expectedEntry);
      for (const name of ["AGENTS.md", "CLAUDE.md"]) {
        const resolved = entryFile(files, root, name);
        const block = resolved.file ? managedBlock(resolved.file.content) : null;
        if (!block || block.text !== expectedEntry || metadata.entryDigests?.[resolved.path] !== expectedEntryDigest) valid = false;
      }
      if (root) {
        const link = scopeLink(root);
        const resolved = entryFile(files, "", "AGENTS.md");
        if (!resolved.file?.content.includes(link) || metadata.rootLinkDigest !== await hash(link)) valid = false;
      }
      if (valid) return null;
    }
    return { code: "repo_agent_guide_outdated", path, message: `Repository hosting guidance is missing, modified or older than supported v${REPO_AGENT_GUIDE_BUNDLE.metadata.version}. Review URL/mount, identity/public paths, env limits, cache/storage and migration/restart rules. Publication is unchanged. An authorized owner can open an update PR or use the local guide updater; existing instructions are preserved.` };
  } catch {
    return { code: "repo_agent_guide_conflict", path, message: "Repository hosting guidance metadata is unreadable or conflicts with the managed layout. Publication is unchanged; use the local guide updater for a conflict report." };
  }
}
async function planRepoGuideUpdate(files, root = "") {
  guideRoot(root);
  const conflicts = [];
  const writes = /* @__PURE__ */ new Map();
  let previous;
  try {
    previous = installedMetadata(files, root);
  } catch (error2) {
    return { writes: [], conflicts: [String(error2)], version: REPO_AGENT_GUIDE_BUNDLE.metadata.version };
  }
  if (previous && previous.version > REPO_AGENT_GUIDE_BUNDLE.metadata.version) return { writes: [], conflicts: ["Installed guide is newer than this updater; refusing downgrade"], version: REPO_AGENT_GUIDE_BUNDLE.metadata.version };
  for (const [relative, content] of Object.entries(REPO_AGENT_GUIDE_BUNDLE.files)) {
    const path = guidePath(root, relative);
    const file = files[path];
    if (file?.mode === "120000") {
      conflicts.push(`${path}: managed files cannot be symlinks`);
      continue;
    }
    if (file && file.content !== content && await hash(file.content) !== previous?.managedFiles?.[relative]) {
      conflicts.push(`${path}: customer edits or unrecognized existing file; manual review required`);
      continue;
    }
    if (file?.content !== content) writes.set(path, { path, content, mode: file?.mode ?? "100644" });
  }
  const entryDigests = {};
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const { path, file } = entryFile(files, root, name);
      if (writes.has(path)) continue;
      const old = file?.content ?? "";
      const block = managedBlock(old);
      const entry = REPO_AGENT_GUIDE_BUNDLE.entry.trimEnd();
      if (block && block.text !== entry && await hash(block.text) !== previous?.entryDigests?.[path]) {
        conflicts.push(`${path}: managed block changed or no recognized baseline`);
        continue;
      }
      const content = block ? old.slice(0, block.start) + entry + old.slice(block.end) : `${old}${old && !old.endsWith("\n") ? "\n" : ""}${old ? "\n" : ""}${entry}
`;
      entryDigests[path] = await hash(entry);
      if (content !== old) writes.set(path, { path, content, mode: file?.mode === "100755" ? "100755" : "100644" });
    } catch (error2) {
      conflicts.push(`${guidePath(root, name)}: ${String(error2)}`);
    }
  }
  const customerPath = guidePath(root, "docs/SHOPPED-HOSTING.md");
  if (!files[customerPath]) writes.set(customerPath, { path: customerPath, content: REPO_AGENT_GUIDE_BUNDLE.customer, mode: "100644" });
  let rootLinkDigest;
  if (root) {
    try {
      const { path, file } = entryFile(files, "", "AGENTS.md");
      const link = scopeLink(root);
      rootLinkDigest = await hash(link);
      if (file?.content.includes(`<!-- SHOPPED-HOSTING:LINK ${root} -->`) && !file.content.includes(link)) conflicts.push(`${path}: scoped discovery link was edited; manual review required`);
      else if (!file?.content.includes(link)) writes.set(path, { path, content: `${file?.content ?? ""}
${link}`, mode: file?.mode === "100755" ? "100755" : "100644" });
    } catch (error2) {
      conflicts.push(String(error2));
    }
  }
  const metadataPath = guidePath(root, ".shopped/agent-guide-version.json");
  const metadata = JSON.stringify({ ...REPO_AGENT_GUIDE_BUNDLE.metadata, entryDigests, ...rootLinkDigest ? { rootLinkDigest } : {} }, null, 2) + "\n";
  if (files[metadataPath]?.content !== metadata) writes.set(metadataPath, { path: metadataPath, content: metadata, mode: "100644" });
  return { writes: conflicts.length ? [] : [...writes.values()], conflicts, version: REPO_AGENT_GUIDE_BUNDLE.metadata.version };
}

// app-database-environments.ts
var DEVELOPMENT_DATABASE_ENVIRONMENT = "development";
var PRODUCTION_DATABASE_ENVIRONMENT = "production";

// ../app-worker/src/lib/skill-service-types.ts
var MAX_SERVICE_ENV_ENTRIES = 64;
var SERVICE_MEMORY_MB_MIN = 128;
var SERVICE_MEMORY_MB_MAX = 65536;
var SERVICE_CPUS_MIN = 0.1;
var SERVICE_CPUS_MAX = 16;
function isValidServiceMemoryMb(value) {
  return Number.isInteger(value) && value >= SERVICE_MEMORY_MB_MIN && value <= SERVICE_MEMORY_MB_MAX;
}
function isValidServiceCpus(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= SERVICE_CPUS_MIN && value <= SERVICE_CPUS_MAX;
}
var SERVICE_PUBLIC_PATHS_MAX = 32;
var SERVICE_PUBLIC_PATH_MAX_CHARS = 256;
var SERVICE_PUBLIC_HOSTNAME_MAX_CHARS = 253;
var DNS_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
var ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c|2e|00)/i;
function validateServicePublicHostname(value) {
  const message = 'public.hostname must be a lowercase DNS name (for example "app.example.com") with no port, wildcard, or IP address.';
  if (typeof value !== "string" || value.length > SERVICE_PUBLIC_HOSTNAME_MAX_CHARS) {
    return message;
  }
  const labels = value.split(".");
  if (labels.length < 2 || !labels.every((l) => DNS_LABEL_PATTERN.test(l))) {
    return message;
  }
  if (/^[0-9]+$/.test(labels[labels.length - 1])) return message;
  return null;
}
function validateServicePublicPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return 'public.paths entries must be strings that start with "/".';
  }
  if (value === "/" || value === "/*") {
    return 'public.paths must not expose the whole app: "/" and "/*" are not allowed. List the specific machine endpoints instead.';
  }
  if (value.length > SERVICE_PUBLIC_PATH_MAX_CHARS) {
    return `public.paths entries must be at most ${SERVICE_PUBLIC_PATH_MAX_CHARS} characters.`;
  }
  if (value.includes("?") || value.includes("#")) {
    return `public.paths entry "${value}" must not contain a query string or fragment.`;
  }
  if (value.includes("*")) {
    return `public.paths entry "${value}" must not contain a wildcard; an entry already matches everything below it.`;
  }
  if (!/^[\x21-\x7e]+$/.test(value) || value.includes("\\")) {
    return `public.paths entry "${value}" may only contain printable ASCII and no backslashes.`;
  }
  if (ENCODED_PATH_SEPARATOR_PATTERN.test(value)) {
    return `public.paths entry "${value}" must not contain an encoded slash, backslash, dot, or null.`;
  }
  const segments = value.slice(1).split("/");
  const inner = value.endsWith("/") ? segments.slice(0, -1) : segments;
  if (inner.some((segment) => !segment || segment === "." || segment === "..")) {
    return `public.paths entry "${value}" must not contain empty, "." or ".." segments.`;
  }
  return null;
}
function decodeServicePublicIngress(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: 'public must be an object with "hostname" and "paths".'
    };
  }
  const entry = raw;
  const hostnameError = validateServicePublicHostname(entry.hostname);
  if (hostnameError) return { ok: false, error: hostnameError };
  let additionalRoutes;
  if (entry.additionalRoutes !== void 0) {
    if (!Array.isArray(entry.additionalRoutes) || entry.additionalRoutes.length < 1 || entry.additionalRoutes.length > 3) {
      return {
        ok: false,
        error: "public.additionalRoutes needs between 1 and 3 entries."
      };
    }
    additionalRoutes = [];
    const hosts = /* @__PURE__ */ new Set([entry.hostname]);
    for (const route of entry.additionalRoutes) {
      if (!route || typeof route !== "object" || Array.isArray(route) || Object.keys(route).some((key) => key !== "hostname" && key !== "paths")) {
        return {
          ok: false,
          error: "public.additionalRoutes entries must contain only hostname and paths."
        };
      }
      const decoded = decodeServicePublicIngress(route);
      if (!decoded.ok) return decoded;
      if (hosts.has(decoded.value.hostname))
        return { ok: false, error: "public has a duplicate hostname." };
      hosts.add(decoded.value.hostname);
      additionalRoutes.push({
        hostname: decoded.value.hostname,
        paths: decoded.value.paths
      });
    }
  }
  const paths = entry.paths;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > SERVICE_PUBLIC_PATHS_MAX) {
    return {
      ok: false,
      error: `public.paths needs between 1 and ${SERVICE_PUBLIC_PATHS_MAX} entries.`
    };
  }
  const seen = /* @__PURE__ */ new Set();
  for (const path of paths) {
    const error2 = validateServicePublicPath(path);
    if (error2) return { ok: false, error: error2 };
    if (seen.has(path)) {
      return {
        ok: false,
        error: `public.paths lists "${path}" more than once.`
      };
    }
    seen.add(path);
  }
  return {
    ok: true,
    value: {
      hostname: entry.hostname,
      ...additionalRoutes ? { additionalRoutes } : {},
      paths: [...paths],
      ...typeof entry.redirectUrl === "string" && entry.redirectUrl ? { redirectUrl: entry.redirectUrl } : {}
    }
  };
}

// ../app-worker/src/lib/repository-app-service-config.ts
var SERVICE_ENV_ENVIRONMENTS = [
  DEVELOPMENT_DATABASE_ENVIRONMENT,
  PRODUCTION_DATABASE_ENVIRONMENT
];
function normalizedRepositoryPath(path, field) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${field} must be a repository-relative path.`);
  }
  return normalized;
}
function joinRepositoryPath(left, right) {
  return left ? `${left}/${right}` : right;
}
function serviceTargetRoot(target) {
  if (target.kind === "manifest-service") {
    return target.path ? normalizedRepositoryPath(target.path, `services.${target.name}.path`) : "";
  }
  const entry = normalizedRepositoryPath(target.entry, "frontend.entry");
  const separator = entry.lastIndexOf("/");
  return separator === -1 ? "" : entry.slice(0, separator);
}
function parseRepositoryServiceJson(path, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object.`);
  }
  const value = parsed;
  if (typeof value.start !== "string" || !value.start.trim()) {
    throw new Error(`${path} needs a "start" command that listens on $PORT.`);
  }
  const build = value.build ?? null;
  if (build !== null && typeof build !== "string") {
    throw new Error(`${path}: build must be a string command.`);
  }
  const install = value.install ?? null;
  if (install !== null && typeof install !== "string") {
    throw new Error(`${path}: install must be a string command.`);
  }
  if (install !== null && !install.trim()) {
    throw new Error(`${path}: install must not be an empty command.`);
  }
  const port = value.port ?? 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${path}: port must be an integer between 1 and 65535.`);
  }
  const healthPath = value.healthPath ?? "/";
  if (typeof healthPath !== "string" || !healthPath.startsWith("/")) {
    throw new Error(`${path}: healthPath must start with "/".`);
  }
  if (value.persistentData !== void 0 && typeof value.persistentData !== "boolean") {
    throw new Error(`${path}: persistentData must be a boolean.`);
  }
  if (value.alwaysOn !== void 0 && typeof value.alwaysOn !== "boolean") {
    throw new Error(`${path}: alwaysOn must be a boolean.`);
  }
  const resources = parseServiceResources(path, value.resources);
  const publicIngress = parseServicePublic(path, value.public);
  return {
    ...value.persistentData !== void 0 ? { persistentData: value.persistentData } : {},
    ...value.alwaysOn !== void 0 ? { alwaysOn: value.alwaysOn } : {},
    ...resources ? { resources } : {},
    ...publicIngress ? { public: publicIngress } : {},
    build,
    install: install?.trim() ?? null,
    start: value.start.trim(),
    port,
    healthPath,
    env: value.env === void 0 ? null : parseServiceEnvBlock(path, value.env)
  };
}
var SERVICE_RESOURCE_KEYS = ["memoryMb", "cpus"];
function parseServiceResources(path, raw) {
  if (raw === void 0) return void 0;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: resources must be an object.`);
  }
  const entry = raw;
  for (const key of Object.keys(entry)) {
    if (!SERVICE_RESOURCE_KEYS.includes(key)) {
      throw new Error(
        `${path}: resources.${key} is not supported (use ${SERVICE_RESOURCE_KEYS.join(" or ")}).`
      );
    }
  }
  if (entry.memoryMb !== void 0 && !isValidServiceMemoryMb(entry.memoryMb)) {
    throw new Error(
      `${path}: resources.memoryMb must be an integer between ${SERVICE_MEMORY_MB_MIN} and ${SERVICE_MEMORY_MB_MAX}.`
    );
  }
  if (entry.cpus !== void 0 && !isValidServiceCpus(entry.cpus)) {
    throw new Error(
      `${path}: resources.cpus must be a number between ${SERVICE_CPUS_MIN} and ${SERVICE_CPUS_MAX}.`
    );
  }
  const resources = {
    ...entry.memoryMb !== void 0 ? { memoryMb: entry.memoryMb } : {},
    ...entry.cpus !== void 0 ? { cpus: entry.cpus } : {}
  };
  return Object.keys(resources).length > 0 ? resources : void 0;
}
var SERVICE_PUBLIC_KEYS = [
  "hostname",
  "paths",
  "additionalRoutes",
  "environments"
];
function parseServicePublic(path, raw) {
  if (raw === void 0) return void 0;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${path}: public must be an object with "hostname" and "paths".`
    );
  }
  const entry = raw;
  for (const key of Object.keys(entry)) {
    if (!SERVICE_PUBLIC_KEYS.includes(key)) {
      throw new Error(
        `${path}: public.${key} is not supported (use ${SERVICE_PUBLIC_KEYS.join(", ")}).`
      );
    }
  }
  const decoded = decodeServicePublicIngress({
    hostname: entry.hostname,
    paths: entry.paths,
    additionalRoutes: entry.additionalRoutes
  });
  if (!decoded.ok) throw new Error(`${path}: ${decoded.error}`);
  return {
    ...decoded.value,
    environments: parseServiceEnvironmentSet(
      path,
      "public",
      entry.environments,
      "public.environments"
    )
  };
}
var SERVICE_ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]{0,63}$/;
var SERVICE_ENV_SECRET_NAME_PATTERN = /^[A-Z0-9_]+$/;
var SERVICE_ENV_RESERVED_NAMES = /* @__PURE__ */ new Set([
  "PORT",
  "DATABASE_URL",
  "DATABASE_URL_PSYCOPG"
]);
var SERVICE_ENV_RESERVED_PREFIX = "SHOPPED_";
var MAX_SERVICE_ENV_VALUE_CHARS = 4096;
function isServiceEnvEnvironment(value) {
  return SERVICE_ENV_ENVIRONMENTS.includes(value);
}
function parseServiceEnvironmentSet(path, name, raw, label = `env.${name}.environments`) {
  if (raw === void 0) return [PRODUCTION_DATABASE_ENVIRONMENT];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      `${path}: ${label} must be a non-empty array of ${SERVICE_ENV_ENVIRONMENTS.map((env) => `"${env}"`).join(" | ")}.`
    );
  }
  const environments = [];
  for (const entry of raw) {
    if (!isServiceEnvEnvironment(entry)) {
      throw new Error(
        `${path}: ${label} entries must be ${SERVICE_ENV_ENVIRONMENTS.map((env) => `"${env}"`).join(" | ")}.`
      );
    }
    if (environments.includes(entry)) {
      throw new Error(`${path}: ${label} lists "${entry}" more than once.`);
    }
    environments.push(entry);
  }
  return environments;
}
function parseServiceEnvSecretName(path, name, raw, label) {
  if (typeof raw !== "string" || !raw || !SERVICE_ENV_SECRET_NAME_PATTERN.test(raw)) {
    throw new Error(
      `${path}: env.${name}${label} must name a workspace secret (uppercase letters, digits, underscores).`
    );
  }
  return raw;
}
function parseServiceEnvEntry(path, name, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${path}: env.${name} must be an object with "secret" or "value".`
    );
  }
  const entry = raw;
  for (const field of Object.keys(entry)) {
    if (field !== "secret" && field !== "value" && field !== "environments") {
      throw new Error(
        `${path}: env.${name} has an unsupported field "${field}".`
      );
    }
  }
  if (entry.secret === void 0 === (entry.value === void 0)) {
    throw new Error(
      `${path}: env.${name} needs exactly one of "secret" or "value".`
    );
  }
  const sources = {};
  if (entry.secret !== void 0) {
    if (entry.secret && typeof entry.secret === "object" && !Array.isArray(entry.secret)) {
      if (entry.environments !== void 0) {
        throw new Error(
          `${path}: env.${name} must not combine a per-environment "secret" map with "environments" \u2014 the map keys already are the set.`
        );
      }
      const map = Object.entries(entry.secret);
      if (map.length === 0) {
        throw new Error(
          `${path}: env.${name}.secret map needs at least one environment.`
        );
      }
      for (const [environment, secret2] of map) {
        if (!isServiceEnvEnvironment(environment)) {
          throw new Error(
            `${path}: env.${name}.secret keys must be ${SERVICE_ENV_ENVIRONMENTS.map((env) => `"${env}"`).join(" | ")}.`
          );
        }
        sources[environment] = {
          secret: parseServiceEnvSecretName(
            path,
            name,
            secret2,
            `.secret.${environment}`
          )
        };
      }
      return sources;
    }
    const secret = parseServiceEnvSecretName(
      path,
      name,
      entry.secret,
      ".secret"
    );
    for (const environment of parseServiceEnvironmentSet(
      path,
      name,
      entry.environments
    )) {
      sources[environment] = { secret };
    }
    return sources;
  }
  if (typeof entry.value !== "string" || entry.value.length > MAX_SERVICE_ENV_VALUE_CHARS) {
    throw new Error(
      `${path}: env.${name}.value must be a string of at most ${MAX_SERVICE_ENV_VALUE_CHARS} characters.`
    );
  }
  for (const environment of parseServiceEnvironmentSet(
    path,
    name,
    entry.environments
  )) {
    sources[environment] = { value: entry.value };
  }
  return sources;
}
function parseServiceEnvBlock(path, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: env must be an object of environment variables.`);
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_SERVICE_ENV_ENTRIES) {
    throw new Error(
      `${path}: env supports at most ${MAX_SERVICE_ENV_ENTRIES} entries.`
    );
  }
  const declaration = {};
  for (const [name, entry] of entries) {
    if (!SERVICE_ENV_NAME_PATTERN.test(name)) {
      throw new Error(
        `${path}: env variable "${name}" must be uppercase letters, digits, and underscores (max 64 characters).`
      );
    }
    if (SERVICE_ENV_RESERVED_NAMES.has(name) || name.startsWith(SERVICE_ENV_RESERVED_PREFIX)) {
      throw new Error(
        `${path}: env variable "${name}" is reserved for the platform.`
      );
    }
    declaration[name] = parseServiceEnvEntry(path, name, entry);
  }
  return declaration;
}
function serviceEnvForEnvironment(env, environment) {
  const result = {};
  for (const [name, sources] of Object.entries(env)) {
    const source = sources[environment];
    if (source) result[name] = source;
  }
  return result;
}

// ../../scripts/repo-guide.ts
function regularFile(root, path) {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const segment = parts.slice(0, i).join("/");
    try {
      if (lstatSync(resolve(root, segment)).isSymbolicLink()) throw new Error(`${segment}: refusing symlink traversal`);
    } catch (error2) {
      if (error2.code !== "ENOENT") throw error2;
    }
  }
  return resolve(root, path);
}
function loadGuideFiles(root, appRoot) {
  const result = {};
  const paths = /* @__PURE__ */ new Set([
    ...Object.keys(REPO_AGENT_GUIDE_BUNDLE.files).map((path) => guidePath(appRoot, path)),
    guidePath(appRoot, ".shopped/agent-guide-version.json"),
    guidePath(appRoot, "docs/SHOPPED-HOSTING.md"),
    guidePath(appRoot, "AGENTS.md"),
    guidePath(appRoot, "CLAUDE.md"),
    ...appRoot ? ["AGENTS.md", "CLAUDE.md"] : []
  ]);
  for (const path of paths) {
    regularFile(root, path.split("/").slice(0, -1).join("/") || ".");
    try {
      const stat = lstatSync(resolve(root, path));
      if (stat.size > 128 * 1024 || !stat.isFile() && !stat.isSymbolicLink()) throw new Error(`${path}: unsupported or oversized guide file`);
      result[path] = stat.isSymbolicLink() ? { mode: "120000", content: readlinkSync(resolve(root, path)) } : { mode: stat.mode & 73 ? "100755" : "100644", content: readFileSync(resolve(root, path), "utf8") };
    } catch (error2) {
      if (error2.code !== "ENOENT") throw error2;
    }
  }
  return result;
}
function lintMountedUrls(path, source) {
  const patterns = [
    /(?:src|href|srcset)\s*=\s*["']\/(?!\/)[^"']*/gi,
    /url\(\s*["']?\/(?!\/)[^)]*/gi,
    /(?:fetch|window\.open|pushState|replaceState)\s*\([^\n)]*["']\/(?!\/)[^"']*/g,
    /(?:location\.href|location\.assign|location\.replace)\s*(?:=|\()\s*["']\/(?!\/)[^"']*/g
  ];
  const lines = /* @__PURE__ */ new Set();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) lines.add(source.slice(0, match.index).split("\n").length);
  }
  return [...lines].sort((a, b) => a - b).map((line) => `${path}:${line}: possible origin-root browser URL escapes injected mount (warning-only; review routes/public endpoints)`);
}
function checkRepoContract(root, manifestPath, emit) {
  guideRoot(manifestPath);
  const raw = readFileSync(regularFile(root, manifestPath), "utf8");
  const parsed = parseAppManifest(raw);
  for (const finding of parsed.diagnostics) emit(`${finding.severity}: ${manifestPath} ${finding.path} [${finding.code}]: ${finding.message}`);
  if (!parsed.ok) return 1;
  const manifest = parsed.manifest;
  const manifestRoot = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/")) : "";
  const configs = new Set(Object.entries(manifest.services).map(([name, service]) => joinRepositoryPath(serviceTargetRoot({ kind: "manifest-service", name, path: service.path }), "service.json")));
  if (manifest.frontend.kind === "server") {
    const serviceRoot = serviceTargetRoot({ kind: "server-frontend", name: "frontend", entry: manifest.frontend.entry });
    const root2 = serviceRoot ? joinRepositoryPath(manifestRoot, serviceRoot) : manifestRoot;
    configs.add(joinRepositoryPath(root2, "service.json"));
  }
  let errors = 0;
  for (const path of configs) {
    try {
      const bytes = readFileSync(regularFile(root, path), "utf8");
      let rawConfig;
      try {
        rawConfig = JSON.parse(bytes);
      } catch {
        throw new Error(`${path}: service.json is not valid JSON`);
      }
      if (rawConfig?.env === void 0) emit(`${path}: env block absent; existing runtime entries are preserved and unknown`);
      else if (rawConfig.env && typeof rawConfig.env === "object" && !Array.isArray(rawConfig.env)) {
        const count = Object.keys(rawConfig.env).length;
        emit(`${path}: env entries ${count}/${MAX_SERVICE_ENV_ENTRIES}; room remaining ${MAX_SERVICE_ENV_ENTRIES - count}`);
      } else emit(`${path}: invalid env block; count unavailable`);
      const config = parseRepositoryServiceJson(path, bytes);
      if (config.env) for (const environment of SERVICE_ENV_ENVIRONMENTS) {
        emit(`${path}: ${environment} entries ${Object.keys(serviceEnvForEnvironment(config.env, environment)).length}/${MAX_SERVICE_ENV_ENTRIES}`);
      }
    } catch (error2) {
      errors++;
      emit(`error: ${String(error2)}`);
    }
  }
  return errors ? 1 : 0;
}
function lintTree(root, directory, emit) {
  guideRoot(directory);
  let count = 0;
  let bytes = 0;
  let directories = 0;
  let halted = false;
  function walk(relative) {
    if (halted) return;
    if (++directories > 2048 || relative.split("/").length > 32) {
      halted = true;
      emit("warning: URL lint directory budget exceeded; pilot output is incomplete");
      return;
    }
    regularFile(root, relative || ".");
    for (const entry of readdirSync(resolve(root, relative), { withFileTypes: true })) {
      if (halted) return;
      if (entry.isSymbolicLink() || [".git", ".venv", "node_modules", ".claude"].includes(entry.name)) continue;
      const path = guidePath(relative, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || !/\.(?:html|css|js|mjs|jsx|tsx)$/.test(path)) continue;
      const stat = lstatSync(resolve(root, path));
      if (++count > 512 || (bytes += stat.size) > 16 * 1024 * 1024) {
        halted = true;
        emit("warning: URL lint budget exceeded; pilot output is incomplete");
        return;
      }
      if (stat.size > 1024 * 1024) {
        emit(`warning: ${path}: URL lint skipped oversized file`);
        continue;
      }
      for (const warning2 of lintMountedUrls(path, readFileSync(resolve(root, path), "utf8"))) emit(`warning: ${warning2}`);
    }
  }
  walk(directory);
}
async function runRepoGuide(args, emit = console.log) {
  const command = args[0];
  const value = (flag, fallback) => {
    const i = args.indexOf(flag);
    if (i < 0) return fallback;
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${flag} needs a value`);
    return args[i + 1];
  };
  const root = resolve(value("--root", "."));
  const subdir = guideRoot(value("--subdir", ""));
  if (command === "contract") {
    const result = checkRepoContract(root, value("--manifest", guidePath(subdir, "app.json")), emit);
    if (args.includes("--lint")) lintTree(root, guideRoot(value("--lint", subdir)), emit);
    return result;
  }
  if (!["init", "update", "check"].includes(command ?? "")) throw new Error("Use init|update|check|contract [--root repo] [--subdir app] [--write]");
  const files = loadGuideFiles(root, subdir);
  if (command === "check") {
    const warning2 = await repoGuideWarning(files, subdir);
    emit(warning2?.message ?? `Guide v${REPO_AGENT_GUIDE_BUNDLE.metadata.version} is current`);
    return warning2 ? 1 : 0;
  }
  const plan = await planRepoGuideUpdate(files, subdir);
  if (plan.conflicts.length) {
    plan.conflicts.forEach((conflict) => emit(`conflict: ${conflict}`));
    return 1;
  }
  for (const write of plan.writes) {
    emit(`${args.includes("--write") ? "write" : "would update"} ${write.path}`);
  }
  if (!args.includes("--write")) {
    emit("Preview only. Review the plan, then explicitly pass --write to update local files.");
    return 0;
  }
  if (JSON.stringify(loadGuideFiles(root, subdir)) !== JSON.stringify(files)) throw new Error("Guide files changed while planning; retry");
  for (const write of plan.writes) regularFile(root, write.path);
  for (const write of plan.writes) {
    const path = regularFile(root, write.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, write.content, { mode: write.mode === "100755" ? 493 : 420 });
  }
  emit(`Updated local guide to v${plan.version}; review the diff. No remote writes or publication performed.`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRepoGuide(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error2) => {
    console.error(String(error2));
    process.exitCode = 1;
  });
}
export {
  checkRepoContract,
  lintMountedUrls,
  lintTree,
  runRepoGuide
};
