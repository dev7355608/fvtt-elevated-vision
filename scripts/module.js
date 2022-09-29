/* globals
Hooks,
game,
canvas,
CONFIG,
renderTemplate,
foundry
*/
"use strict";

import { MODULE_ID } from "./const.js";
import { log } from "./util.js";

// API imports
import * as drawing from "./drawing.js";
import * as util from "./util.js";
import * as extract from "./perfect-vision/extract-pixels.js";
import { Shadow } from "./Shadow.js";
import { Point3d } from "./Point3d.js";
import { WallTracer } from "./WallTracer.js";
import { FILOQueue } from "./FILOQueue.js";
import { ShadowShader } from "./ShadowShader.js";
import { ElevationGrid } from "./ElevationGrid.js";

// Register methods, patches, settings
import { registerPIXIPolygonMethods } from "./PIXIPolygon.js";
import { registerAdditions, registerPatches } from "./patching.js";

// For elevation layer registration and API
import { ElevationLayer } from "./ElevationLayer.js";

// Elevation Layer control tools
import {
  addElevationLayerSceneControls,
  addElevationLayerSubControls,
  renderElevationLayerSubControls
} from "./controls.js";

// Settings, to toggle whether to change elevation on token move
import { SETTINGS, getSetting, registerSettings } from "./settings.js";
import { autoElevationChangeForToken, tokenElevationAt } from "./tokens.js";

Hooks.once("init", function() {
  game.modules.get(MODULE_ID).api = {
    drawing,
    util,
    extract,
    Point3d,
    Shadow,
    ElevationLayer,
    ElevationGrid,
    WallTracer,
    ShadowShader,
    FILOQueue
  };

  // These methods need to be registered early
  registerSettings();
  registerPIXIPolygonMethods();
  registerLayer();
  registerAdditions();
});

// Hooks.once("libWrapper.Ready", async function() {
//   registerPatches();
// });

Hooks.once("setup", async function() {
  registerPatches();
});

Hooks.on("canvasReady", async function() {
  // Set the elevation grid now that we know scene dimensions
  if ( !canvas.elevation ) return;
  canvas.elevation.initialize();
});

// https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});

Hooks.on("getSceneControlButtons", addElevationLayerSceneControls);
Hooks.on("renderSceneControls", addElevationLayerSubControls);
Hooks.on("renderTerrainLayerToolBar", renderElevationLayerSubControls);

function registerLayer() {
  CONFIG.Canvas.layers.elevation = { group: "primary", layerClass: ElevationLayer };
}

Hooks.on("refreshToken", function(token, options) {
  log(`refreshToken hook ${token.document?.elevation}`, token, options);
  log(`refreshToken hook at ${token.document.x},${token.document.y} with elevation ${token.document.elevation} animate: ${Boolean(token._animation)}`);

//   if ( !token._elevatedVision || !token._elevatedVision.tokenAdjustElevation ) return;
//   const hasAnimated = token._elevatedVision.tokenHasAnimated;
//   if ( !token._animation && hasAnimated ) {
//     // Reset flag to prevent further elevation adjustments
//     token._elevatedVision.adjustElevation = false;
//     return;
//   }
//
//   if ( !hasAnimated ) token._elevatedVision.tokenHasAnimated = true;
//
//   // Adjust the elevation
//   token.document.elevation = tokenElevationAt(token, token.document.x, token.document.y);
//   log(`refreshToken hook setting elevation to ${token.document.elevation}\n`);
});

// Reset the token elevation when moving the token after a cloned drag operation.
// Token.prototype._refresh is then used to update the elevation as the token is moved.
Hooks.on("preUpdateToken", function(tokenD, changes, options, userId) {
  const token = tokenD.object;
  log(`preUpdateToken hook ${changes.x}, ${changes.y}, ${changes.elevation} at elevation ${token.document?.elevation} with elevationD ${tokenD.elevation}`, changes);
  log(`preUpdateToken hook moving ${tokenD.x},${tokenD.y} --> ${changes.x ? changes.x : tokenD.x},${changes.y ? changes.y : tokenD.y}`)

  const tokenOrigin = { x: tokenD.x, y: tokenD.y };
  tokenD.object._elevatedVision ??= {};
  tokenD.object._elevatedVision.tokenAdjustElevation = false; // Just a placeholder
  tokenD.object._elevatedVision.tokenOrigin = tokenOrigin;
  tokenD.object._elevatedVision.tokenHasAnimated = false;

  if ( !getSetting(SETTINGS.AUTO_ELEVATION) ) return;
  if ( typeof changes.x === "undefined" && typeof changes.y === "undefined" ) return;

  const tokenDestination = { x: changes.x ? changes.x : tokenD.x, y: changes.y ? changes.y : tokenD.y };
  const elevationChange = autoElevationChangeForToken(tokenD.object, tokenOrigin, tokenDestination);
  if ( elevationChange === null ) return;

  tokenD.object._elevatedVision.tokenAdjustElevation = true;
  changes.elevation = elevationChange.newTerrainElevation;
});

Hooks.on("updateToken", function(tokenD, change, options, userId) {
  const token = tokenD.object;
  log(`updateToken hook ${change.x}, ${change.y}, ${change.elevation} at elevation ${token.document?.elevation} with elevationD ${tokenD.elevation} and tokenD ${tokenD.x},${tokenD.y} token ${tokenD.object.document?.x},${tokenD.object.document?.y} `, change);
})

// Add settings for minimum and step elevation to the scene configuration.
Hooks.on("renderSceneConfig", injectSceneConfiguration);
async function injectSceneConfiguration(app, html, data) {
  util.log("injectSceneConfig", app, html, data);

  if ( !app.object.getFlag(MODULE_ID, "elevationmin") ) app.object.setFlag(MODULE_ID, "elevationmin", 0);
  if ( !app.object.getFlag(MODULE_ID, "elevationstep") ) app.object.setFlag(MODULE_ID, "elevationstep", canvas.dimensions.distance);

  const form = html.find(`input[name="initial.scale"]`).closest(".form-group");
  const snippet = await renderTemplate(`modules/${MODULE_ID}/templates/scene-elevation-config.html`, data);
  form.append(snippet);
  app.setPosition({ height: "auto" });
}
