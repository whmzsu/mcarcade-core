// Helpers designed to help to make a simulator accessible.
var pxsim;
(function (pxsim) {
    var accessibility;
    (function (accessibility) {
        let keydownListenerAdded = false;
        let zeroWidthSpace = false;
        function makeFocusable(elem) {
            elem.setAttribute("focusable", "true");
            elem.setAttribute("tabindex", "0");
        }
        accessibility.makeFocusable = makeFocusable;
        function getGlobalAction(e) {
            const isMac = window.navigator && /Mac/i.test(window.navigator.platform);
            const meta = isMac ? e.metaKey : e.ctrlKey;
            if (e.key === "Escape") {
                e.preventDefault();
                return "escape";
            }
            else if (e.key === "/" && meta) {
                e.preventDefault();
                return "togglekeyboardcontrolshelp";
            }
            else if (e.key.toLowerCase() === "b" && meta) {
                e.preventDefault();
                return "toggleareamenu";
            }
            return null;
        }
        accessibility.getGlobalAction = getGlobalAction;
        function postKeyboardEvent() {
            if (keydownListenerAdded) {
                return;
            }
            keydownListenerAdded = true;
            document.addEventListener("keydown", (e) => {
                const action = getGlobalAction(e);
                if (action) {
                    const message = {
                        type: "action",
                        action
                    };
                    pxsim.Runtime.postMessage(message);
                }
            });
        }
        accessibility.postKeyboardEvent = postKeyboardEvent;
        function enableKeyboardInteraction(elem, handlerKeyDown, handlerKeyUp) {
            if (handlerKeyDown) {
                elem.addEventListener('keydown', (e) => {
                    const charCode = (typeof e.which == "number") ? e.which : e.keyCode;
                    if (charCode === 32 || charCode === 13) { // Enter or Space key
                        handlerKeyDown();
                    }
                });
            }
            if (handlerKeyUp) {
                elem.addEventListener('keyup', (e) => {
                    const charCode = (typeof e.which == "number") ? e.which : e.keyCode;
                    if (charCode === 32 || charCode === 13) { // Enter or Space key
                        handlerKeyUp();
                    }
                });
            }
        }
        accessibility.enableKeyboardInteraction = enableKeyboardInteraction;
        function setAria(elem, role, label) {
            if (role && !elem.hasAttribute("role")) {
                elem.setAttribute("role", role);
            }
            if (label && !elem.hasAttribute("aria-label")) {
                elem.setAttribute("aria-label", label);
            }
        }
        accessibility.setAria = setAria;
        function setLiveContent(value) {
            let liveRegion = document.getElementById("sim-live-region");
            if (!liveRegion) {
                let style = "border: 0;" +
                    "clip: rect(0, 0, 0, 0);" +
                    "height: 1px;" +
                    "margin: -1px;" +
                    "overflow: hidden;" +
                    "padding: 0;" +
                    "position: absolute;" +
                    "width: 1px;";
                liveRegion = document.createElement("div");
                liveRegion.id = "sim-live-region";
                liveRegion.setAttribute("aria-live", "polite");
                liveRegion.setAttribute("style", style);
                document.body.appendChild(liveRegion);
            }
            if (value) {
                liveRegion.textContent = `${value}${zeroWidthSpace ? '\u200B' : ''}`;
                zeroWidthSpace = !zeroWidthSpace;
            }
        }
        accessibility.setLiveContent = setLiveContent;
    })(accessibility = pxsim.accessibility || (pxsim.accessibility = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    const GROUND_COLOR = "blue";
    const POWER_COLOR = "red";
    const POWER5V_COLOR = "orange";
    ;
    ;
    ;
    ;
    ;
    ;
    function isOnBreadboardBottom(location) {
        let isBot = false;
        if (typeof location !== "string" && location.type === "breadboard") {
            let bbLoc = location;
            let row = bbLoc.row;
            isBot = 0 <= ["a", "b", "c", "d", "e"].indexOf(row);
        }
        return isBot;
    }
    const arrCount = (a) => a.reduce((p, n) => p + (n ? 1 : 0), 0);
    const arrAny = (a) => arrCount(a) > 0;
    function computePowerUsage(wire) {
        let ends = [wire.start, wire.end];
        let endIsGround = ends.map(e => e === "ground");
        let endIsThreeVolt = ends.map(e => e === "threeVolt");
        let endIsFiveVolt = ends.map(e => e === "fiveVolt");
        let endIsBot = ends.map(e => isOnBreadboardBottom(e));
        let hasGround = arrAny(endIsGround);
        let hasThreeVolt = arrAny(endIsThreeVolt);
        let hasFiveVolt = arrAny(endIsFiveVolt);
        let hasBot = arrAny(endIsBot);
        return {
            topGround: hasGround && !hasBot,
            topThreeVolt: hasThreeVolt && !hasBot,
            topFiveVolt: hasFiveVolt && !hasBot,
            bottomGround: hasGround && hasBot,
            bottomThreeVolt: hasThreeVolt && hasBot,
            bottomFiveVolt: hasFiveVolt && hasBot,
            singleGround: hasGround,
            singleThreeVolt: hasThreeVolt,
            singleFiveVolt: hasFiveVolt
        };
    }
    function mergePowerUsage(powerUsages) {
        const finalPowerUsage = powerUsages.reduce((p, n) => ({
            topGround: p.topGround || n.topGround,
            topThreeVolt: p.topThreeVolt || n.topThreeVolt,
            topFiveVolt: p.topFiveVolt || n.topFiveVolt,
            bottomGround: p.bottomGround || n.bottomGround,
            bottomThreeVolt: p.bottomThreeVolt || n.bottomThreeVolt,
            bottomFiveVolt: p.bottomFiveVolt || n.bottomFiveVolt,
            singleGround: n.singleGround ? p.singleGround === null : p.singleGround,
            singleThreeVolt: n.singleThreeVolt ? p.singleThreeVolt === null : p.singleThreeVolt,
            singleFiveVolt: n.singleFiveVolt ? p.singleFiveVolt === null : p.singleFiveVolt,
        }), {
            topGround: false,
            topThreeVolt: false,
            topFiveVolt: false,
            bottomGround: false,
            bottomThreeVolt: false,
            bottomFiveVolt: false,
            singleGround: null,
            singleThreeVolt: null,
            singleFiveVolt: null
        });
        if (finalPowerUsage.singleGround)
            finalPowerUsage.topGround = finalPowerUsage.bottomGround = false;
        if (finalPowerUsage.singleThreeVolt)
            finalPowerUsage.topThreeVolt = finalPowerUsage.bottomThreeVolt = false;
        if (finalPowerUsage.singleFiveVolt)
            finalPowerUsage.topFiveVolt = finalPowerUsage.bottomFiveVolt = false;
        return finalPowerUsage;
    }
    function copyDoubleArray(a) {
        return a.map(b => b.map(p => p));
    }
    function merge2(a, b) {
        let res = {};
        for (let aKey in a)
            res[aKey] = a[aKey];
        for (let bKey in b)
            res[bKey] = b[bKey];
        return res;
    }
    function merge3(a, b, c) {
        return merge2(merge2(a, b), c);
    }
    function readPin(arg) {
        pxsim.U.assert(!!arg, "Invalid pin: " + arg);
        const pin = /^(\w+)\.\s*(?:[a-z]*)?([A-Z][A-Z\d_]+)$/.exec(arg);
        return pin ? pin[2] : undefined;
    }
    pxsim.readPin = readPin;
    function mkReverseMap(map) {
        let origKeys = [];
        let origVals = [];
        for (let key in map) {
            origKeys.push(key);
            origVals.push(map[key]);
        }
        let newMap = {};
        for (let i = 0; i < origKeys.length; i++) {
            let newKey = origVals[i];
            let newVal = origKeys[i];
            newMap[newKey] = newVal;
        }
        return newMap;
    }
    function isConnectedToBB(pin) {
        return pin.orientation === "-Z" && pin.style === "male";
    }
    class Allocator {
        constructor(opts) {
            this.availablePowerPins = {
                top: {
                    fiveVolt: pxsim.mkRange(26, 51).map(n => ({ type: "breadboard", row: "+", col: `${n}` })),
                    threeVolt: pxsim.mkRange(26, 51).map(n => ({ type: "breadboard", row: "+", col: `${n}` })),
                    ground: pxsim.mkRange(26, 51).map(n => ({ type: "breadboard", row: "-", col: `${n}` })),
                },
                bottom: {
                    fiveVolt: pxsim.mkRange(1, 26).map(n => ({ type: "breadboard", row: "+", col: `${n}` })),
                    threeVolt: pxsim.mkRange(1, 26).map(n => ({ type: "breadboard", row: "+", col: `${n}` })),
                    ground: pxsim.mkRange(1, 26).map(n => ({ type: "breadboard", row: "-", col: `${n}` })),
                },
            };
            this.opts = opts;
        }
        allocPartIRs(def, name, bbFit) {
            let partIRs = [];
            const mkIR = (def, name, instPins, partParams) => {
                let pinIRs = [];
                for (let i = 0; i < def.numberOfPins; i++) {
                    let pinDef = def.pinDefinitions[i];
                    let pinTarget;
                    if (typeof pinDef.target === "string") {
                        pinTarget = pinDef.target;
                    }
                    else {
                        let instIdx = pinDef.target.pinInstantiationIdx;
                        if (!(!!instPins && instPins[instIdx] !== undefined)) {
                            pxsim.log(`error: parts no pin found for PinInstantiationIdx: ${instIdx}. (Is the part missing an ArgumentRole or "trackArgs=" annotations?)`);
                            return undefined;
                        }
                        pinTarget = instPins[instIdx];
                    }
                    let pinLoc = def.visual.pinLocations[i];
                    let adjustedY = bbFit.yOffset + pinLoc.y;
                    let relativeRowIdx = Math.round(adjustedY / def.visual.pinDistance);
                    let relativeYOffset = adjustedY - relativeRowIdx * def.visual.pinDistance;
                    let adjustedX = bbFit.xOffset + pinLoc.x;
                    let relativeColIdx = Math.round(adjustedX / def.visual.pinDistance);
                    let relativeXOffset = adjustedX - relativeColIdx * def.visual.pinDistance;
                    let pinBBFit = {
                        partRelativeRowIdx: relativeRowIdx,
                        partRelativeColIdx: relativeColIdx,
                        xOffset: relativeXOffset,
                        yOffset: relativeYOffset
                    };
                    pinIRs.push({
                        def: pinDef,
                        loc: pinLoc,
                        target: pinTarget,
                        bbFit: pinBBFit,
                    });
                }
                return {
                    name: name,
                    def: def,
                    pins: pinIRs,
                    partParams: partParams || {},
                    bbFit: bbFit
                };
            };
            // support for multiple possible instantions
            const instantiations = def.instantiations || [];
            if (def.instantiation)
                instantiations.push(def.instantiation);
            instantiations.forEach(instantiation => {
                if (instantiation.kind === "singleton") {
                    partIRs.push(mkIR(def, name));
                }
                else if (instantiation.kind === "function") {
                    let fnAlloc = instantiation;
                    let fnNms = fnAlloc.fullyQualifiedName.split(',');
                    let callsitesTrackedArgsHash = {};
                    fnNms.forEach(fnNm => { if (this.opts.fnArgs[fnNm])
                        this.opts.fnArgs[fnNm].forEach((targetArg) => { callsitesTrackedArgsHash[targetArg] = 1; }); });
                    let callsitesTrackedArgs = Object.keys(callsitesTrackedArgsHash);
                    if (!(!!callsitesTrackedArgs && !!callsitesTrackedArgs.length)) {
                        pxsim.log(`error: parts failed to read pin(s) from callsite for: ${fnNms}`);
                        return undefined;
                    }
                    callsitesTrackedArgs.forEach(fnArgsStr => {
                        const fnArgsSplit = fnArgsStr.split(",");
                        if (fnArgsSplit.length != fnAlloc.argumentRoles.length) {
                            pxsim.log(`error: parts mismatch between number of arguments at callsite (function name: ${fnNms}) vs number of argument roles in part definition (part: ${name}).`);
                            return;
                        }
                        let instPins = [];
                        let paramArgs = {};
                        fnArgsSplit.forEach((arg, idx) => {
                            let role = fnAlloc.argumentRoles[idx];
                            if (role.partParameter !== undefined) {
                                paramArgs[role.partParameter] = arg;
                            }
                            if (role.pinInstantiationIdx !== undefined) {
                                let instIdx = role.pinInstantiationIdx;
                                let pin = readPin(arg);
                                instPins[instIdx] = pin;
                            }
                        });
                        partIRs.push(mkIR(def, name, instPins, paramArgs));
                    });
                }
            });
            return partIRs.filter(ir => !!ir);
        }
        computePartDimensions(def, name) {
            let pinLocs = def.visual.pinLocations;
            let pinDefs = def.pinDefinitions;
            let numPins = def.numberOfPins;
            pxsim.U.assert(pinLocs.length === numPins, `Mismatch between "numberOfPins" and length of "visual.pinLocations" for "${name}"`);
            pxsim.U.assert(pinDefs.length === numPins, `Mismatch between "numberOfPins" and length of "pinDefinitions" for "${name}"`);
            pxsim.U.assert(numPins > 0, `Part "${name}" has no pins`);
            let pins = pinLocs.map((loc, idx) => merge3({ idx: idx }, loc, pinDefs[idx]));
            let bbPins = pins.filter(p => p.orientation === "-Z");
            let hasBBPins = bbPins.length > 0;
            let pinDist = def.visual.pinDistance;
            let xOff;
            let yOff;
            let colCount;
            let rowCount;
            if (hasBBPins) {
                let refPin = bbPins[0];
                let refPinColIdx = Math.ceil(refPin.x / pinDist);
                let refPinRowIdx = Math.ceil(refPin.y / pinDist);
                xOff = refPinColIdx * pinDist - refPin.x;
                yOff = refPinRowIdx * pinDist - refPin.y;
                colCount = Math.ceil((xOff + def.visual.width) / pinDist) + 1;
                rowCount = Math.ceil((yOff + def.visual.height) / pinDist) + 1;
            }
            else {
                colCount = Math.ceil(def.visual.width / pinDist);
                rowCount = Math.ceil(def.visual.height / pinDist);
                xOff = colCount * pinDist - def.visual.width;
                yOff = rowCount * pinDist - def.visual.height;
            }
            return {
                xOffset: xOff,
                yOffset: yOff,
                rowCount: rowCount,
                colCount: colCount
            };
        }
        allocColumns(colCounts) {
            let partsCount = colCounts.length;
            const totalColumnsCount = pxsim.visuals.BREADBOARD_MID_COLS; //TODO allow multiple breadboards
            let totalSpaceNeeded = colCounts.map(d => d.colCount).reduce((p, n) => p + n, 0);
            let extraSpace = totalColumnsCount - totalSpaceNeeded;
            if (extraSpace <= 0) {
                pxsim.log("Not enough breadboard space!");
                //TODO
            }
            let padding = Math.floor(extraSpace / (partsCount - 1 + 2));
            let partSpacing = padding; //Math.floor(extraSpace/(partsCount-1));
            let totalPartPadding = extraSpace - partSpacing * (partsCount - 1);
            let leftPadding = Math.floor(totalPartPadding / 2);
            let rightPadding = Math.ceil(totalPartPadding / 2);
            let nextAvailableCol = 1 + leftPadding;
            let partStartCol = colCounts.map(part => {
                let col = nextAvailableCol;
                nextAvailableCol += part.colCount + partSpacing;
                return col;
            });
            return partStartCol;
        }
        placeParts(parts) {
            const totalRowsCount = pxsim.visuals.BREADBOARD_MID_ROWS + 2; // 10 letters + 2 for the middle gap
            let startColumnIndices = this.allocColumns(parts.map(p => p.bbFit));
            let startRowIndicies = parts.map(p => {
                let extraRows = totalRowsCount - p.bbFit.rowCount;
                let topPad = Math.floor(extraRows / 2);
                let startIdx = topPad;
                if (startIdx > 4)
                    startIdx = 4;
                if (startIdx < 1)
                    startIdx = 1;
                return startIdx;
            });
            let placements = parts.map((p, idx) => {
                let row = startRowIndicies[idx];
                let col = startColumnIndices[idx];
                return merge2({ startColumnIdx: col, startRowIdx: row }, p);
            });
            return placements;
        }
        nextColor() {
            if (!this.availableWireColors || this.availableWireColors.length <= 0) {
                this.availableWireColors = pxsim.visuals.GPIO_WIRE_COLORS.map(c => c);
            }
            return this.availableWireColors.pop();
        }
        allocWireIRs(part) {
            let groupToColor = [];
            let wires = part.pins.map((pin, pinIdx) => {
                let end = pin.target;
                let start;
                let colIdx = part.startColumnIdx + pin.bbFit.partRelativeColIdx;
                let colName = pxsim.visuals.getColumnName(colIdx);
                let pinRowIdx = part.startRowIdx + pin.bbFit.partRelativeRowIdx;
                if (pinRowIdx >= 7) //account for middle gap
                    pinRowIdx -= 2;
                if (isConnectedToBB(pin.def)) {
                    //make a wire from bb top or bottom to target
                    let connectedToTop = pinRowIdx < 5;
                    let rowName = connectedToTop ? "j" : "a";
                    start = {
                        type: "breadboard",
                        row: rowName,
                        col: colName,
                        style: pin.def.style
                    };
                }
                else {
                    //make a wire directly from pin to target
                    let rowName = pxsim.visuals.getRowName(pinRowIdx);
                    start = {
                        type: "breadboard",
                        row: rowName,
                        col: colName,
                        xOffset: pin.bbFit.xOffset / part.def.visual.pinDistance,
                        yOffset: pin.bbFit.yOffset / part.def.visual.pinDistance,
                        style: pin.def.style
                    };
                }
                let color;
                if (end === "ground") {
                    color = GROUND_COLOR;
                }
                else if (end === "threeVolt") {
                    color = POWER_COLOR;
                }
                else if (end === "fiveVolt") {
                    color = POWER5V_COLOR;
                }
                else if (typeof pin.def.colorGroup === "number") {
                    if (groupToColor[pin.def.colorGroup]) {
                        color = groupToColor[pin.def.colorGroup];
                    }
                    else {
                        color = groupToColor[pin.def.colorGroup] = this.nextColor();
                    }
                }
                else {
                    color = this.nextColor();
                }
                return {
                    start: start,
                    end: end,
                    color: color,
                    pinIdx: pinIdx,
                };
            });
            return merge2(part, { wires: wires });
        }
        allocLocation(location, opts) {
            if (location === "ground" || location === "threeVolt" || location == "fiveVolt") {
                //special case if there is only a single ground or three volt pin in the whole build
                if (location === "ground" && this.powerUsage.singleGround) {
                    let boardGroundPin = this.getBoardGroundPin();
                    return { type: "dalboard", pin: boardGroundPin };
                }
                else if (location === "threeVolt" && this.powerUsage.singleThreeVolt) {
                    let boardThreeVoltPin = this.getBoardThreeVoltPin();
                    return { type: "dalboard", pin: boardThreeVoltPin };
                }
                else if (location === "fiveVolt" && this.powerUsage.singleFiveVolt) {
                    let boardFiveVoltPin = this.getBoardFiveVoltPin();
                    return { type: "dalboard", pin: boardFiveVoltPin };
                }
                pxsim.U.assert(!!opts.referenceBBPin);
                let nearestCoord = this.opts.getBBCoord(opts.referenceBBPin);
                let firstTopAndBot = [
                    this.availablePowerPins.top.ground[0] || this.availablePowerPins.top.threeVolt[0],
                    this.availablePowerPins.bottom.ground[0] || this.availablePowerPins.bottom.threeVolt[0]
                ].map(loc => {
                    return this.opts.getBBCoord(loc);
                });
                if (!firstTopAndBot[0] || !firstTopAndBot[1]) {
                    pxsim.debug(`No more available "${location}" locations!`);
                    //TODO
                }
                let nearTop = pxsim.visuals.findClosestCoordIdx(nearestCoord, firstTopAndBot) == 0;
                let barPins;
                if (nearTop) {
                    if (location === "ground") {
                        barPins = this.availablePowerPins.top.ground;
                    }
                    else if (location === "threeVolt") {
                        barPins = this.availablePowerPins.top.threeVolt;
                    }
                    else if (location === "fiveVolt") {
                        barPins = this.availablePowerPins.top.fiveVolt;
                    }
                }
                else {
                    if (location === "ground") {
                        barPins = this.availablePowerPins.bottom.ground;
                    }
                    else if (location === "threeVolt") {
                        barPins = this.availablePowerPins.bottom.threeVolt;
                    }
                    else if (location === "fiveVolt") {
                        barPins = this.availablePowerPins.bottom.fiveVolt;
                    }
                }
                let pinCoords = barPins.map(rowCol => {
                    return this.opts.getBBCoord(rowCol);
                });
                let closestPinIdx = pxsim.visuals.findClosestCoordIdx(nearestCoord, pinCoords);
                let pin = barPins[closestPinIdx];
                if (nearTop) {
                    this.availablePowerPins.top.ground.splice(closestPinIdx, 1);
                    this.availablePowerPins.top.threeVolt.splice(closestPinIdx, 1);
                }
                else {
                    this.availablePowerPins.bottom.ground.splice(closestPinIdx, 1);
                    this.availablePowerPins.bottom.threeVolt.splice(closestPinIdx, 1);
                }
                return pin;
            }
            else if (location.type === "breadboard") {
                return location;
            }
            else if (location === "MOSI" || location === "MISO" || location === "SCK") {
                if (!this.opts.boardDef.spiPins)
                    pxsim.debug("No SPI pin mappings found!");
                let pin = this.opts.boardDef.spiPins[location];
                return { type: "dalboard", pin: pin };
            }
            else if (location === "SDA" || location === "SCL") {
                if (!this.opts.boardDef.i2cPins)
                    pxsim.debug("No I2C pin mappings found!");
                let pin = this.opts.boardDef.i2cPins[location];
                return { type: "dalboard", pin: pin };
            }
            else {
                //it must be a MicrobitPin
                pxsim.U.assert(typeof location === "string", "Unknown location type: " + location);
                let mbPin = location;
                let boardPin = this.opts.boardDef.gpioPinMap[mbPin] || mbPin;
                if (!boardPin) { // this pin is internal
                    pxsim.debug(`unknown pin location for ${mbPin}`);
                    return undefined;
                }
                return { type: "dalboard", pin: boardPin };
            }
        }
        getBoardGroundPin() {
            let pin = this.opts.boardDef.groundPins && this.opts.boardDef.groundPins[0] || null;
            if (!pin) {
                pxsim.debug("No available ground pin on board!");
                //TODO
            }
            return pin;
        }
        getBoardThreeVoltPin() {
            let pin = this.opts.boardDef.threeVoltPins && this.opts.boardDef.threeVoltPins[0] || null;
            if (!pin) {
                pxsim.debug("No available 3.3V pin on board!");
                //TODO
            }
            return pin;
        }
        getBoardFiveVoltPin() {
            let pin = this.opts.boardDef.fiveVoltPins && this.opts.boardDef.fiveVoltPins[0] || null;
            if (!pin) {
                pxsim.debug("No available 5V pin on board!");
                //TODO
            }
            return pin;
        }
        allocPowerWires(powerUsage) {
            let boardGroundPin = this.getBoardGroundPin();
            let threeVoltPin = this.getBoardThreeVoltPin();
            let fiveVoltPin = this.getBoardFiveVoltPin();
            const topLeft = { type: "breadboard", row: "-", col: "26" };
            const botLeft = { type: "breadboard", row: "-", col: "1" };
            const topRight = { type: "breadboard", row: "-", col: "50" };
            const botRight = { type: "breadboard", row: "-", col: "25" };
            let top, bot;
            if (this.opts.boardDef.attachPowerOnRight) {
                top = topRight;
                bot = botRight;
            }
            else {
                top = topLeft;
                bot = botLeft;
            }
            let groundWires = [];
            let threeVoltWires = [];
            let fiveVoltWires = [];
            if (powerUsage.bottomGround && powerUsage.topGround) {
                //bb top - <==> bb bot -
                groundWires.push({
                    start: this.allocLocation("ground", { referenceBBPin: top }),
                    end: this.allocLocation("ground", { referenceBBPin: bot }),
                    color: GROUND_COLOR,
                });
            }
            if (powerUsage.topGround) {
                //board - <==> bb top -
                groundWires.push({
                    start: this.allocLocation("ground", { referenceBBPin: top }),
                    end: { type: "dalboard", pin: boardGroundPin },
                    color: GROUND_COLOR,
                });
            }
            else if (powerUsage.bottomGround) {
                //board - <==> bb bot -
                groundWires.push({
                    start: this.allocLocation("ground", { referenceBBPin: bot }),
                    end: { type: "dalboard", pin: boardGroundPin },
                    color: GROUND_COLOR,
                });
            }
            if (powerUsage.bottomThreeVolt && powerUsage.bottomGround) {
                //bb top + <==> bb bot +
                threeVoltWires.push({
                    start: this.allocLocation("threeVolt", { referenceBBPin: top }),
                    end: this.allocLocation("threeVolt", { referenceBBPin: bot }),
                    color: POWER_COLOR,
                });
            }
            else if (powerUsage.bottomFiveVolt && powerUsage.bottomGround) {
                //bb top + <==> bb bot +
                fiveVoltWires.push({
                    start: this.allocLocation("fiveVolt", { referenceBBPin: top }),
                    end: this.allocLocation("fiveVolt", { referenceBBPin: bot }),
                    color: POWER5V_COLOR,
                });
            }
            if (powerUsage.topThreeVolt) {
                //board + <==> bb top +
                threeVoltWires.push({
                    start: this.allocLocation("threeVolt", { referenceBBPin: top }),
                    end: { type: "dalboard", pin: threeVoltPin },
                    color: POWER_COLOR,
                });
            }
            else if (powerUsage.bottomThreeVolt) {
                //board + <==> bb bot +
                threeVoltWires.push({
                    start: this.allocLocation("threeVolt", { referenceBBPin: bot }),
                    end: { type: "dalboard", pin: threeVoltPin },
                    color: POWER5V_COLOR,
                });
            }
            if (powerUsage.topFiveVolt && !powerUsage.topThreeVolt) {
                //board + <==> bb top +
                fiveVoltWires.push({
                    start: this.allocLocation("fiveVolt", { referenceBBPin: top }),
                    end: { type: "dalboard", pin: fiveVoltPin },
                    color: POWER_COLOR,
                });
            }
            else if (powerUsage.bottomFiveVolt && !powerUsage.bottomThreeVolt) {
                //board + <==> bb bot +
                fiveVoltWires.push({
                    start: this.allocLocation("fiveVolt", { referenceBBPin: bot }),
                    end: { type: "dalboard", pin: fiveVoltPin },
                    color: POWER5V_COLOR,
                });
            }
            let assembly = [];
            if (groundWires.length > 0)
                assembly.push({ wireIndices: groundWires.map((w, i) => i) });
            let numGroundWires = groundWires.length;
            if (threeVoltWires.length > 0)
                assembly.push({
                    wireIndices: threeVoltWires.map((w, i) => i + numGroundWires)
                });
            if (fiveVoltWires.length > 0)
                assembly.push({
                    wireIndices: threeVoltWires.map((w, i) => i + numGroundWires + threeVoltWires.length)
                });
            return {
                wires: groundWires.concat(threeVoltWires).concat(fiveVoltWires),
                assembly: assembly
            };
        }
        allocWire(wireIR) {
            const ends = [wireIR.start, wireIR.end];
            const endIsPower = ends.map(e => e === "ground" || e === "threeVolt" || e === "fiveVolt");
            //allocate non-power first so we know the nearest pin for the power end
            let endInsts = ends.map((e, idx) => !endIsPower[idx] ? this.allocLocation(e, {}) : undefined);
            //allocate power pins closest to the other end of the wire
            endInsts = endInsts.map((e, idx) => {
                if (e)
                    return e;
                const locInst = endInsts[1 - idx]; // non-power end
                const l = this.allocLocation(ends[idx], {
                    referenceBBPin: locInst,
                });
                return l;
            });
            // one of the pins is not accessible
            if (!endInsts[0] || !endInsts[1])
                return undefined;
            return { start: endInsts[0], end: endInsts[1], color: wireIR.color };
        }
        allocPart(ir) {
            let bbConnections = ir.pins
                .filter(p => isConnectedToBB(p.def))
                .map(p => {
                let rowIdx = ir.startRowIdx + p.bbFit.partRelativeRowIdx;
                if (rowIdx >= 7) //account for middle gap
                    rowIdx -= 2;
                let rowName = pxsim.visuals.getRowName(rowIdx);
                let colIdx = ir.startColumnIdx + p.bbFit.partRelativeColIdx;
                let colName = pxsim.visuals.getColumnName(colIdx);
                return {
                    type: "breadboard",
                    row: rowName,
                    col: colName,
                };
            });
            let part = {
                name: ir.name,
                visual: ir.def.visual,
                bbFit: ir.bbFit,
                startColumnIdx: ir.startColumnIdx,
                startRowIdx: ir.startRowIdx,
                breadboardConnections: bbConnections,
                params: ir.partParams,
                simulationBehavior: ir.def.simulationBehavior
            };
            return part;
        }
        allocAll() {
            let partNmAndDefs = this.opts.partsList
                .map(partName => { return { name: partName, def: this.opts.partDefs[partName] }; })
                .filter(d => !!d.def);
            if (partNmAndDefs.length > 0) {
                let dimensions = partNmAndDefs.map(nmAndPart => this.computePartDimensions(nmAndPart.def, nmAndPart.name));
                let partIRs = [];
                partNmAndDefs.forEach((nmAndDef, idx) => {
                    let dims = dimensions[idx];
                    let irs = this.allocPartIRs(nmAndDef.def, nmAndDef.name, dims);
                    partIRs = partIRs.concat(irs);
                });
                const partPlacements = this.placeParts(partIRs);
                const partsAndWireIRs = partPlacements.map(p => this.allocWireIRs(p));
                const allWireIRs = partsAndWireIRs.map(p => p.wires).reduce((p, n) => p.concat(n), []);
                const allPowerUsage = allWireIRs.map(w => computePowerUsage(w));
                this.powerUsage = mergePowerUsage(allPowerUsage);
                const basicWires = this.allocPowerWires(this.powerUsage);
                const partsAndWires = partsAndWireIRs.map((irs, idx) => {
                    const part = this.allocPart(irs);
                    const wires = irs.wires.map(w => this.allocWire(w));
                    if (wires.some(w => !w))
                        return undefined;
                    const pinIdxToWireIdx = [];
                    irs.wires.forEach((wIR, idx) => {
                        pinIdxToWireIdx[wIR.pinIdx] = idx;
                    });
                    const assembly = irs.def.assembly.map(stepDef => {
                        return {
                            part: stepDef.part,
                            wireIndices: (stepDef.pinIndices || []).map(i => pinIdxToWireIdx[i])
                        };
                    });
                    return {
                        part: part,
                        wires: wires,
                        assembly: assembly
                    };
                }).filter(p => !!p);
                const all = [basicWires].concat(partsAndWires)
                    .filter(pw => pw.assembly && pw.assembly.length); // only keep steps with something to do
                // hide breadboard if not used
                const hideBreadboard = !all.some(r => (r.part && r.part.breadboardConnections && r.part.breadboardConnections.length > 0)
                    || r.wires && r.wires.some(w => (w.end.type == "breadboard" && w.end.style != "croc") || (w.start.type == "breadboard" && w.start.style != "croc")));
                return {
                    partsAndWires: all,
                    wires: [],
                    parts: [],
                    hideBreadboard
                };
            }
            else {
                return {
                    partsAndWires: [],
                    wires: [],
                    parts: []
                };
            }
        }
    }
    function allocateDefinitions(opts) {
        return new Allocator(opts).allocAll();
    }
    pxsim.allocateDefinitions = allocateDefinitions;
})(pxsim || (pxsim = {}));
/// <reference path="../localtypings/vscode-debug-protocol.d.ts" />
/**
 * Heavily adapted from https://github.com/microsoft/vscode-debugadapter-node
 * and altered to run in a browser and communcate via JSON over a websocket
 * rather than through stdin and stdout
 */
var pxsim;
(function (pxsim) {
    var protocol;
    (function (protocol) {
        class Message {
            constructor(type) {
                this.seq = 0;
                this.type = type;
            }
        }
        protocol.Message = Message;
        class Response extends Message {
            constructor(request, message) {
                super('response');
                this.request_seq = request.seq;
                this.command = request.command;
                if (message) {
                    this.success = false;
                    this.message = message;
                }
                else {
                    this.success = true;
                }
            }
        }
        protocol.Response = Response;
        class Event extends Message {
            constructor(event, body) {
                super('event');
                this.event = event;
                if (body) {
                    this.body = body;
                }
            }
        }
        protocol.Event = Event;
        class Source {
            constructor(name, path, id = 0, origin, data) {
                this.name = name;
                this.path = path;
                this.sourceReference = id;
                if (origin) {
                    this.origin = origin;
                }
                if (data) {
                    this.adapterData = data;
                }
            }
        }
        protocol.Source = Source;
        class Scope {
            constructor(name, reference, expensive = false) {
                this.name = name;
                this.variablesReference = reference;
                this.expensive = expensive;
            }
        }
        protocol.Scope = Scope;
        class StackFrame {
            constructor(i, nm, src, ln = 0, col = 0) {
                this.id = i;
                this.source = src;
                this.line = ln;
                this.column = col;
                this.name = nm;
            }
        }
        protocol.StackFrame = StackFrame;
        class Thread {
            constructor(id, name) {
                this.id = id;
                if (name) {
                    this.name = name;
                }
                else {
                    this.name = 'Thread #' + id;
                }
            }
        }
        protocol.Thread = Thread;
        class Variable {
            constructor(name, value, ref = 0, indexedVariables, namedVariables) {
                this.name = name;
                this.value = value;
                this.variablesReference = ref;
                if (typeof namedVariables === 'number') {
                    this.namedVariables = namedVariables;
                }
                if (typeof indexedVariables === 'number') {
                    this.indexedVariables = indexedVariables;
                }
            }
        }
        protocol.Variable = Variable;
        class Breakpoint {
            constructor(verified, line, column, source) {
                this.verified = verified;
                const e = this;
                if (typeof line === 'number') {
                    e.line = line;
                }
                if (typeof column === 'number') {
                    e.column = column;
                }
                if (source) {
                    e.source = source;
                }
            }
        }
        protocol.Breakpoint = Breakpoint;
        class Module {
            constructor(id, name) {
                this.id = id;
                this.name = name;
            }
        }
        protocol.Module = Module;
        class CompletionItem {
            constructor(label, start, length = 0) {
                this.label = label;
                this.start = start;
                this.length = length;
            }
        }
        protocol.CompletionItem = CompletionItem;
        class StoppedEvent extends Event {
            constructor(reason, threadId, exception_text = null) {
                super('stopped');
                this.body = {
                    reason: reason,
                    threadId: threadId
                };
                if (exception_text) {
                    const e = this;
                    e.body.text = exception_text;
                }
            }
        }
        protocol.StoppedEvent = StoppedEvent;
        class ContinuedEvent extends Event {
            constructor(threadId, allThreadsContinued) {
                super('continued');
                this.body = {
                    threadId: threadId
                };
                if (typeof allThreadsContinued === 'boolean') {
                    this.body.allThreadsContinued = allThreadsContinued;
                }
            }
        }
        protocol.ContinuedEvent = ContinuedEvent;
        class InitializedEvent extends Event {
            constructor() {
                super('initialized');
            }
        }
        protocol.InitializedEvent = InitializedEvent;
        class TerminatedEvent extends Event {
            constructor(restart) {
                super('terminated');
                if (typeof restart === 'boolean') {
                    const e = this;
                    e.body = {
                        restart: restart
                    };
                }
            }
        }
        protocol.TerminatedEvent = TerminatedEvent;
        class OutputEvent extends Event {
            constructor(output, category = 'console', data) {
                super('output');
                this.body = {
                    category: category,
                    output: output
                };
                if (data !== undefined) {
                    this.body.data = data;
                }
            }
        }
        protocol.OutputEvent = OutputEvent;
        class ThreadEvent extends Event {
            constructor(reason, threadId) {
                super('thread');
                this.body = {
                    reason: reason,
                    threadId: threadId
                };
            }
        }
        protocol.ThreadEvent = ThreadEvent;
        class BreakpointEvent extends Event {
            constructor(reason, breakpoint) {
                super('breakpoint');
                this.body = {
                    reason: reason,
                    breakpoint: breakpoint
                };
            }
        }
        protocol.BreakpointEvent = BreakpointEvent;
        class ModuleEvent extends Event {
            constructor(reason, module) {
                super('module');
                this.body = {
                    reason: reason,
                    module: module
                };
            }
        }
        protocol.ModuleEvent = ModuleEvent;
        class ProtocolServer {
            constructor() {
                this._pendingRequests = {};
            }
            start(host) {
                this._sequence = 1;
                this.host = host;
                this.host.onData(msg => {
                    if (msg.type === 'request') {
                        this.dispatchRequest(msg);
                    }
                    else if (msg.type === 'response') {
                        const response = msg;
                        const clb = this._pendingRequests[response.seq];
                        if (clb) {
                            delete this._pendingRequests[response.seq];
                            clb(response);
                        }
                    }
                });
            }
            stop() {
                if (this.host) {
                    this.host.close();
                }
            }
            sendEvent(event) {
                this.send('event', event);
            }
            sendResponse(response) {
                if (response.seq > 0) {
                    pxsim.error(`attempt to send more than one response for command ${response.command}`);
                }
                else {
                    this.send('response', response);
                }
            }
            sendRequest(command, args, timeout, cb) {
                const request = {
                    command: command
                };
                if (args && Object.keys(args).length > 0) {
                    request.arguments = args;
                }
                this.send('request', request);
                if (cb) {
                    this._pendingRequests[request.seq] = cb;
                    const timer = setTimeout(() => {
                        clearTimeout(timer);
                        const clb = this._pendingRequests[request.seq];
                        if (clb) {
                            delete this._pendingRequests[request.seq];
                            clb(new protocol.Response(request, 'timeout'));
                        }
                    }, timeout);
                }
            }
            send(typ, message) {
                message.type = typ;
                message.seq = this._sequence++;
                if (this.host) {
                    const json = JSON.stringify(message);
                    this.host.send(json);
                }
            }
            // ---- protected ----------------------------------------------------------
            dispatchRequest(request) {
            }
        }
        protocol.ProtocolServer = ProtocolServer;
        class DebugSession extends ProtocolServer {
            constructor() {
                super(...arguments);
                this._debuggerLinesStartAt1 = false;
                this._debuggerColumnsStartAt1 = false;
                this._clientLinesStartAt1 = true;
                this._clientColumnsStartAt1 = true;
            }
            shutdown() {
            }
            dispatchRequest(request) {
                const response = new protocol.Response(request);
                try {
                    if (request.command === 'initialize') {
                        let args = request.arguments;
                        if (typeof args.linesStartAt1 === 'boolean') {
                            this._clientLinesStartAt1 = args.linesStartAt1;
                        }
                        if (typeof args.columnsStartAt1 === 'boolean') {
                            this._clientColumnsStartAt1 = args.columnsStartAt1;
                        }
                        if (args.pathFormat !== 'path') {
                            this.sendErrorResponse(response, 2018, 'debug adapter only supports native paths', null);
                        }
                        else {
                            const initializeResponse = response;
                            initializeResponse.body = {};
                            this.initializeRequest(initializeResponse, args);
                        }
                    }
                    else if (request.command === 'launch') {
                        this.launchRequest(response, request.arguments);
                    }
                    else if (request.command === 'attach') {
                        this.attachRequest(response, request.arguments);
                    }
                    else if (request.command === 'disconnect') {
                        this.disconnectRequest(response, request.arguments);
                    }
                    else if (request.command === 'setBreakpoints') {
                        this.setBreakPointsRequest(response, request.arguments);
                    }
                    else if (request.command === 'setFunctionBreakpoints') {
                        this.setFunctionBreakPointsRequest(response, request.arguments);
                    }
                    else if (request.command === 'setExceptionBreakpoints') {
                        this.setExceptionBreakPointsRequest(response, request.arguments);
                    }
                    else if (request.command === 'configurationDone') {
                        this.configurationDoneRequest(response, request.arguments);
                    }
                    else if (request.command === 'continue') {
                        this.continueRequest(response, request.arguments);
                    }
                    else if (request.command === 'next') {
                        this.nextRequest(response, request.arguments);
                    }
                    else if (request.command === 'stepIn') {
                        this.stepInRequest(response, request.arguments);
                    }
                    else if (request.command === 'stepOut') {
                        this.stepOutRequest(response, request.arguments);
                    }
                    else if (request.command === 'stepBack') {
                        this.stepBackRequest(response, request.arguments);
                    }
                    else if (request.command === 'restartFrame') {
                        this.restartFrameRequest(response, request.arguments);
                    }
                    else if (request.command === 'goto') {
                        this.gotoRequest(response, request.arguments);
                    }
                    else if (request.command === 'pause') {
                        this.pauseRequest(response, request.arguments);
                    }
                    else if (request.command === 'stackTrace') {
                        this.stackTraceRequest(response, request.arguments);
                    }
                    else if (request.command === 'scopes') {
                        this.scopesRequest(response, request.arguments);
                    }
                    else if (request.command === 'variables') {
                        this.variablesRequest(response, request.arguments);
                    }
                    else if (request.command === 'setVariable') {
                        this.setVariableRequest(response, request.arguments);
                    }
                    else if (request.command === 'source') {
                        this.sourceRequest(response, request.arguments);
                    }
                    else if (request.command === 'threads') {
                        this.threadsRequest(response);
                    }
                    else if (request.command === 'evaluate') {
                        this.evaluateRequest(response, request.arguments);
                    }
                    else if (request.command === 'stepInTargets') {
                        this.stepInTargetsRequest(response, request.arguments);
                    }
                    else if (request.command === 'gotoTargets') {
                        this.gotoTargetsRequest(response, request.arguments);
                    }
                    else if (request.command === 'completions') {
                        this.completionsRequest(response, request.arguments);
                    }
                    else {
                        this.customRequest(request.command, response, request.arguments);
                    }
                }
                catch (e) {
                    this.sendErrorResponse(response, 1104, '{_stack}', { _exception: e.message, _stack: e.stack });
                }
            }
            initializeRequest(response, args) {
                // This default debug adapter does not support conditional breakpoints.
                response.body.supportsConditionalBreakpoints = false;
                // This default debug adapter does not support hit conditional breakpoints.
                response.body.supportsHitConditionalBreakpoints = false;
                // This default debug adapter does not support function breakpoints.
                response.body.supportsFunctionBreakpoints = false;
                // This default debug adapter implements the 'configurationDone' request.
                response.body.supportsConfigurationDoneRequest = true;
                // This default debug adapter does not support hovers based on the 'evaluate' request.
                response.body.supportsEvaluateForHovers = false;
                // This default debug adapter does not support the 'stepBack' request.
                response.body.supportsStepBack = false;
                // This default debug adapter does not support the 'setVariable' request.
                response.body.supportsSetVariable = false;
                // This default debug adapter does not support the 'restartFrame' request.
                response.body.supportsRestartFrame = false;
                // This default debug adapter does not support the 'stepInTargetsRequest' request.
                response.body.supportsStepInTargetsRequest = false;
                // This default debug adapter does not support the 'gotoTargetsRequest' request.
                response.body.supportsGotoTargetsRequest = false;
                // This default debug adapter does not support the 'completionsRequest' request.
                response.body.supportsCompletionsRequest = false;
                this.sendResponse(response);
            }
            disconnectRequest(response, args) {
                this.sendResponse(response);
                this.shutdown();
            }
            launchRequest(response, args) {
                this.sendResponse(response);
            }
            attachRequest(response, args) {
                this.sendResponse(response);
            }
            setBreakPointsRequest(response, args) {
                this.sendResponse(response);
            }
            setFunctionBreakPointsRequest(response, args) {
                this.sendResponse(response);
            }
            setExceptionBreakPointsRequest(response, args) {
                this.sendResponse(response);
            }
            configurationDoneRequest(response, args) {
                this.sendResponse(response);
            }
            continueRequest(response, args) {
                this.sendResponse(response);
            }
            nextRequest(response, args) {
                this.sendResponse(response);
            }
            stepInRequest(response, args) {
                this.sendResponse(response);
            }
            stepOutRequest(response, args) {
                this.sendResponse(response);
            }
            stepBackRequest(response, args) {
                this.sendResponse(response);
            }
            restartFrameRequest(response, args) {
                this.sendResponse(response);
            }
            gotoRequest(response, args) {
                this.sendResponse(response);
            }
            pauseRequest(response, args) {
                this.sendResponse(response);
            }
            sourceRequest(response, args) {
                this.sendResponse(response);
            }
            threadsRequest(response) {
                this.sendResponse(response);
            }
            stackTraceRequest(response, args) {
                this.sendResponse(response);
            }
            scopesRequest(response, args) {
                this.sendResponse(response);
            }
            variablesRequest(response, args) {
                this.sendResponse(response);
            }
            setVariableRequest(response, args) {
                this.sendResponse(response);
            }
            evaluateRequest(response, args) {
                this.sendResponse(response);
            }
            stepInTargetsRequest(response, args) {
                this.sendResponse(response);
            }
            gotoTargetsRequest(response, args) {
                this.sendResponse(response);
            }
            completionsRequest(response, args) {
                this.sendResponse(response);
            }
            /**
             * Override this hook to implement custom requests.
             */
            customRequest(command, response, args) {
                this.sendErrorResponse(response, 1014, 'unrecognized request', null);
            }
            sendErrorResponse(response, codeOrMessage, format, variables) {
                let msg;
                if (typeof codeOrMessage === 'number') {
                    msg = {
                        id: codeOrMessage,
                        format: format
                    };
                    if (variables) {
                        msg.variables = variables;
                    }
                    msg.showUser = true;
                }
                else {
                    msg = codeOrMessage;
                }
                response.success = false;
                DebugSession.formatPII(msg.format, true, msg.variables);
                if (!response.body) {
                    response.body = {};
                }
                response.body.error = msg;
                this.sendResponse(response);
            }
            convertClientLineToDebugger(line) {
                if (this._debuggerLinesStartAt1) {
                    return this._clientLinesStartAt1 ? line : line + 1;
                }
                return this._clientLinesStartAt1 ? line - 1 : line;
            }
            convertDebuggerLineToClient(line) {
                if (this._debuggerLinesStartAt1) {
                    return this._clientLinesStartAt1 ? line : line - 1;
                }
                return this._clientLinesStartAt1 ? line + 1 : line;
            }
            convertClientColumnToDebugger(column) {
                if (this._debuggerColumnsStartAt1) {
                    return this._clientColumnsStartAt1 ? column : column + 1;
                }
                return this._clientColumnsStartAt1 ? column - 1 : column;
            }
            convertDebuggerColumnToClient(column) {
                if (this._debuggerColumnsStartAt1) {
                    return this._clientColumnsStartAt1 ? column : column - 1;
                }
                return this._clientColumnsStartAt1 ? column + 1 : column;
            }
            convertClientPathToDebugger(clientPath) {
                if (this._clientPathsAreURIs != this._debuggerPathsAreURIs) {
                    if (this._clientPathsAreURIs) {
                        return DebugSession.uri2path(clientPath);
                    }
                    else {
                        return DebugSession.path2uri(clientPath);
                    }
                }
                return clientPath;
            }
            convertDebuggerPathToClient(debuggerPath) {
                if (this._debuggerPathsAreURIs != this._clientPathsAreURIs) {
                    if (this._debuggerPathsAreURIs) {
                        return DebugSession.uri2path(debuggerPath);
                    }
                    else {
                        return DebugSession.path2uri(debuggerPath);
                    }
                }
                return debuggerPath;
            }
            static path2uri(str) {
                let pathName = str.replace(/\\/g, '/');
                if (pathName[0] !== '/') {
                    pathName = '/' + pathName;
                }
                return encodeURI('file://' + pathName);
            }
            static uri2path(url) {
                return url;
                //return Url.parse(url).pathname;
            }
            /*
            * If argument starts with '_' it is OK to send its value to telemetry.
            */
            static formatPII(format, excludePII, args) {
                return format.replace(DebugSession._formatPIIRegexp, function (match, paramName) {
                    if (excludePII && paramName.length > 0 && paramName[0] !== '_') {
                        return match;
                    }
                    return args[paramName] && args.hasOwnProperty(paramName) ?
                        args[paramName] :
                        match;
                });
            }
        }
        DebugSession._formatPIIRegexp = /{([^}]+)}/g;
        protocol.DebugSession = DebugSession;
    })(protocol = pxsim.protocol || (pxsim.protocol = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var util;
    (function (util) {
        function injectPolyphils() {
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
            if (!String.prototype.startsWith) {
                Object.defineProperty(String.prototype, 'startsWith', {
                    value: function (search, pos) {
                        if (search === undefined || search == null)
                            return false;
                        pos = !pos || pos < 0 ? 0 : +pos;
                        return this.substring(pos, pos + search.length) === search;
                    }
                });
            }
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/fill
            if (!Array.prototype.fill) {
                Object.defineProperty(Array.prototype, 'fill', {
                    writable: true,
                    enumerable: true,
                    value: function (value) {
                        // Steps 1-2.
                        if (this == null) {
                            throw new TypeError('this is null or not defined');
                        }
                        let O = Object(this);
                        // Steps 3-5.
                        let len = O.length >>> 0;
                        // Steps 6-7.
                        let start = arguments[1];
                        let relativeStart = start >> 0;
                        // Step 8.
                        let k = relativeStart < 0 ?
                            Math.max(len + relativeStart, 0) :
                            Math.min(relativeStart, len);
                        // Steps 9-10.
                        let end = arguments[2];
                        let relativeEnd = end === undefined ?
                            len : end >> 0;
                        // Step 11.
                        let final = relativeEnd < 0 ?
                            Math.max(len + relativeEnd, 0) :
                            Math.min(relativeEnd, len);
                        // Step 12.
                        while (k < final) {
                            O[k] = value;
                            k++;
                        }
                        // Step 13.
                        return O;
                    }
                });
            }
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
            if (!Array.prototype.find) {
                Object.defineProperty(Array.prototype, 'find', {
                    writable: true,
                    enumerable: true,
                    value: function (predicate) {
                        // 1. Let O be ? ToObject(this value).
                        if (this == null) {
                            throw new TypeError('"this" is null or not defined');
                        }
                        let o = Object(this);
                        // 2. Let len be ? ToLength(? Get(O, "length")).
                        const len = o.length >>> 0;
                        // 3. If IsCallable(predicate) is false, throw a TypeError exception.
                        if (typeof predicate !== 'function') {
                            throw new TypeError('predicate must be a function');
                        }
                        // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
                        const thisArg = arguments[1];
                        // 5. Let k be 0.
                        let k = 0;
                        // 6. Repeat, while k < len
                        while (k < len) {
                            // a. Let Pk be ! ToString(k).
                            // b. Let kValue be ? Get(O, Pk).
                            // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
                            // d. If testResult is true, return kValue.
                            const kValue = o[k];
                            if (predicate.call(thisArg, kValue, k, o)) {
                                return kValue;
                            }
                            // e. Increase k by 1.
                            k++;
                        }
                        // 7. Return undefined.
                        return undefined;
                    },
                });
            }
            // Polyfill for Uint8Array.slice for IE and Safari
            // https://tc39.github.io/ecma262/#sec-%typedarray%.prototype.slice
            // TODO: Move this polyfill to a more appropriate file. It is left here for now because moving it causes a crash in IE; see PXT issue #1301.
            if (!Uint8Array.prototype.slice) {
                Object.defineProperty(Uint8Array.prototype, 'slice', {
                    value: Array.prototype.slice,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint16Array.prototype.slice) {
                Object.defineProperty(Uint16Array.prototype, 'slice', {
                    value: Array.prototype.slice,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint32Array.prototype.slice) {
                Object.defineProperty(Uint32Array.prototype, 'slice', {
                    value: Array.prototype.slice,
                    writable: true,
                    enumerable: true
                });
            }
            // https://tc39.github.io/ecma262/#sec-%typedarray%.prototype.fill
            if (!Uint8Array.prototype.fill) {
                Object.defineProperty(Uint8Array.prototype, 'fill', {
                    value: Array.prototype.fill,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint16Array.prototype.fill) {
                Object.defineProperty(Uint16Array.prototype, 'fill', {
                    value: Array.prototype.fill,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint32Array.prototype.fill) {
                Object.defineProperty(Uint32Array.prototype, 'fill', {
                    value: Array.prototype.fill,
                    writable: true,
                    enumerable: true
                });
            }
            // https://tc39.github.io/ecma262/#sec-%typedarray%.prototype.some
            if (!Uint8Array.prototype.some) {
                Object.defineProperty(Uint8Array.prototype, 'some', {
                    value: Array.prototype.some,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint16Array.prototype.some) {
                Object.defineProperty(Uint16Array.prototype, 'some', {
                    value: Array.prototype.some,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint32Array.prototype.some) {
                Object.defineProperty(Uint32Array.prototype, 'some', {
                    value: Array.prototype.some,
                    writable: true,
                    enumerable: true
                });
            }
            // https://tc39.github.io/ecma262/#sec-%typedarray%.prototype.reverse
            if (!Uint8Array.prototype.reverse) {
                Object.defineProperty(Uint8Array.prototype, 'reverse', {
                    value: Array.prototype.reverse,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint16Array.prototype.reverse) {
                Object.defineProperty(Uint16Array.prototype, 'reverse', {
                    value: Array.prototype.reverse,
                    writable: true,
                    enumerable: true
                });
            }
            if (!Uint32Array.prototype.reverse) {
                Object.defineProperty(Uint32Array.prototype, 'reverse', {
                    value: Array.prototype.reverse,
                    writable: true,
                    enumerable: true
                });
            }
            // Inject Math imul polyfill
            if (!Math.imul) {
                // for explanations see:
                // http://stackoverflow.com/questions/3428136/javascript-integer-math-incorrect-results (second answer)
                // (but the code below doesn't come from there; I wrote it myself)
                // TODO use Math.imul if available
                Math.imul = function (a, b) {
                    const ah = (a >>> 16) & 0xffff;
                    const al = a & 0xffff;
                    const bh = (b >>> 16) & 0xffff;
                    const bl = b & 0xffff;
                    // the shift by 0 fixes the sign on the high part
                    // the final |0 converts the unsigned value into a signed value
                    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
                };
            }
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
            if (typeof Object.assign != 'function') {
                // Must be writable: true, enumerable: false, configurable: true
                Object.defineProperty(Object, "assign", {
                    value: function assign(target, varArgs) {
                        'use strict';
                        if (target == null) { // TypeError if undefined or null
                            throw new TypeError('Cannot convert undefined or null to object');
                        }
                        let to = Object(target);
                        for (let index = 1; index < arguments.length; index++) {
                            let nextSource = arguments[index];
                            if (nextSource != null) { // Skip over if undefined or null
                                for (let nextKey in nextSource) {
                                    // Avoid bugs when hasOwnProperty is shadowed
                                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                                        to[nextKey] = nextSource[nextKey];
                                    }
                                }
                            }
                        }
                        return to;
                    },
                    writable: true,
                    configurable: true
                });
            }
            // https://stackoverflow.com/a/53327815
            if (!Promise.prototype.finally) {
                Promise.prototype.finally = Promise.prototype.finally || {
                    finally(fn) {
                        const onFinally = (callback) => Promise.resolve(fn()).then(callback);
                        return this.then(result => onFinally(() => result), reason => onFinally(() => Promise.reject(reason)));
                    }
                }.finally;
            }
        }
        util.injectPolyphils = injectPolyphils;
        class Lazy {
            constructor(_func) {
                this._func = _func;
                this._evaluated = false;
            }
            get value() {
                if (!this._evaluated) {
                    this._value = this._func();
                    this._evaluated = true;
                }
                return this._value;
            }
        }
        util.Lazy = Lazy;
        function getNormalizedParts(path) {
            path = path.replace(/\\/g, "/");
            const parts = [];
            path.split("/").forEach(part => {
                if (part === ".." && parts.length) {
                    parts.pop();
                }
                else if (part && part !== ".") {
                    parts.push(part);
                }
            });
            return parts;
        }
        util.getNormalizedParts = getNormalizedParts;
        function normalizePath(path) {
            return getNormalizedParts(path).join("/");
        }
        util.normalizePath = normalizePath;
        function relativePath(fromDir, toFile) {
            const fParts = getNormalizedParts(fromDir);
            const tParts = getNormalizedParts(toFile);
            let i = 0;
            while (fParts[i] === tParts[i]) {
                i++;
                if (i === fParts.length || i === tParts.length) {
                    break;
                }
            }
            const fRemainder = fParts.slice(i);
            const tRemainder = tParts.slice(i);
            for (let i = 0; i < fRemainder.length; i++) {
                tRemainder.unshift("..");
            }
            return tRemainder.join("/");
        }
        util.relativePath = relativePath;
        function pathJoin(...paths) {
            let result = "";
            paths.forEach(path => {
                path.replace(/\\/g, "/");
                if (path.lastIndexOf("/") === path.length - 1) {
                    path = path.slice(0, path.length - 1);
                }
                result += "/" + path;
            });
            return result;
        }
        util.pathJoin = pathJoin;
        function toArray(a) {
            if (Array.isArray(a)) {
                return a;
            }
            let r = [];
            for (let i = 0; i < a.length; ++i)
                r.push(a[i]);
            return r;
        }
        util.toArray = toArray;
    })(util = pxsim.util || (pxsim.util = {}));
})(pxsim || (pxsim = {}));
/// <reference path="./debugProtocol.ts" />
/// <reference path="./utils.ts" />
var pxsim;
(function (pxsim) {
    function getWarningMessage(msg) {
        let r = {
            type: "debugger",
            subtype: "warning",
            breakpointIds: [],
            message: msg
        };
        let s = pxsim.runtime.currFrame;
        while (s != null) {
            r.breakpointIds.push(s.lastBrkId);
            s = s.parent;
        }
        return r;
    }
    pxsim.getWarningMessage = getWarningMessage;
    class BreakpointMap {
        constructor(breakpoints) {
            this.fileMap = {};
            this.idMap = {};
            breakpoints.forEach(tuple => {
                const [id, bp] = tuple;
                if (!this.fileMap[bp.source.path]) {
                    this.fileMap[bp.source.path] = [];
                }
                this.fileMap[bp.source.path].push(tuple);
                this.idMap[id] = bp;
            });
            for (const file in this.fileMap) {
                const bps = this.fileMap[file];
                // Sort the breakpoints to make finding the closest breakpoint to a
                // given line easier later. Order first by start line and then from
                // worst to best choice for each line.
                this.fileMap[file] = bps.sort(([, a], [, b]) => {
                    if (a.line === b.line) {
                        if (b.endLine === a.endLine) {
                            return a.column - b.column;
                        }
                        // We want the closest breakpoint, so give preference to breakpoints
                        // that span fewer lines (i.e. breakpoints that are "tighter" around
                        // the line being searched for)
                        return b.endLine - a.endLine;
                    }
                    return a.line - b.line;
                });
            }
        }
        getById(id) {
            return this.idMap[id];
        }
        verifyBreakpoint(path, breakpoint) {
            const breakpoints = this.fileMap[path];
            let best;
            if (breakpoints) {
                // Breakpoints are pre-sorted for each file. The last matching breakpoint
                // in the list should be the best match
                for (const [id, bp] of breakpoints) {
                    if (bp.line <= breakpoint.line && bp.endLine >= breakpoint.line) {
                        best = [id, bp];
                    }
                }
            }
            if (best) {
                best[1].verified = true;
                return best;
            }
            return [-1, { verified: false }];
        }
    }
    pxsim.BreakpointMap = BreakpointMap;
    function valToJSON(v, heap) {
        switch (typeof v) {
            case "string":
            case "number":
            case "boolean":
                return v;
            case "function":
                return {
                    text: "(function)",
                    type: "function",
                };
            case "undefined":
                return null;
            case "object":
                if (!v)
                    return null;
                if (v instanceof pxsim.RefObject) {
                    if (heap)
                        heap[v.id] = v;
                    let preview = pxsim.RefObject.toDebugString(v);
                    let type = preview.startsWith('[') ? "array" : preview;
                    return {
                        id: v.id,
                        preview: preview,
                        hasFields: v.fields !== null || preview.startsWith('['),
                        type: type,
                    };
                }
                if (v._width && v._height) {
                    return {
                        text: v._width + 'x' + v._height,
                        type: "image",
                    };
                }
                return {
                    text: "(object)",
                    type: "object",
                };
            default:
                throw new Error();
        }
    }
    function dumpHeap(v, heap, fields, filters, includeAll = false) {
        function frameVars(frame, fields) {
            const r = {};
            for (let k of Object.keys(frame)) {
                // skip members starting with __
                if (!/^__/.test(k) && /___\d+$/.test(k) && (!filters || filters.indexOf(k) !== -1)) {
                    r[k] = valToJSON(frame[k], heap);
                }
            }
            if (frame.fields && fields) {
                // Fields of an object.
                for (let k of fields) {
                    k = k.substring(k.lastIndexOf(".") + 1);
                    r[k] = valToJSON(evalGetter(frame.vtable.iface[k], frame), heap);
                }
            }
            if (frame.fields) {
                for (let k of Object.keys(frame.fields).filter(field => includeAll || !field.startsWith('_'))) {
                    r[k] = valToJSON(frame.fields[k], heap);
                }
            }
            else if (frame instanceof pxsim.RefMap) {
                for (const entry of frame.data) {
                    r[entry.key] = valToJSON(entry.val, heap);
                }
            }
            else if (Array.isArray(frame.data)) {
                // This is an Array.
                frame.data.forEach((element, index) => {
                    r[index] = valToJSON(element, heap);
                });
            }
            else if (frame._width !== undefined && frame._height !== undefined) {
                // Probably a RefImage
                r["width"] = frame._width;
                r["height"] = frame._height;
                if (includeAll && frame._bpp !== undefined) {
                    r["isMono"] = frame._bpp === 1;
                }
            }
            return r;
        }
        return frameVars(v, fields);
    }
    pxsim.dumpHeap = dumpHeap;
    function evalGetter(fn, target) {
        // This function evaluates a getter, and we assume it doesn't have any side effects.
        let parentFrame = {};
        // We create a dummy stack frame
        let stackFrame = {
            pc: 0,
            arg0: target,
            fn,
            parent: parentFrame
        };
        // And we evaluate the getter
        while (stackFrame.fn) {
            stackFrame = stackFrame.fn(stackFrame);
        }
        return stackFrame.retval;
    }
    function injectEnvironmentGlobals(msg, heap) {
        const environmentGlobals = pxsim.runtime.environmentGlobals;
        const keys = Object.keys(environmentGlobals);
        if (!keys.length)
            return;
        const envVars = msg.environmentGlobals = {};
        Object.keys(environmentGlobals)
            .forEach(n => envVars[n] = valToJSON(pxsim.runtime.environmentGlobals[n], heap));
    }
    pxsim.injectEnvironmentGlobals = injectEnvironmentGlobals;
    function getBreakpointMsg(s, brkId, userGlobals) {
        const heap = {};
        const msg = {
            type: "debugger",
            subtype: "breakpoint",
            breakpointId: brkId,
            globals: dumpHeap(pxsim.runtime.globals, heap, undefined, userGlobals),
            stackframes: [],
        };
        while (s != null) {
            let info = getInfoForFrame(s, heap);
            if (info)
                msg.stackframes.push(info);
            s = s.parent;
        }
        return { msg, heap };
    }
    pxsim.getBreakpointMsg = getBreakpointMsg;
    function getInfoForFrame(s, heap) {
        let info = s.fn ? s.fn.info : null;
        if (info) {
            let argInfo = {
                thisParam: valToJSON(s.argL, heap),
                params: []
            };
            if (info.argumentNames) {
                const args = info.argumentNames;
                argInfo.params = args.map((paramName, index) => ({
                    name: paramName,
                    value: valToJSON(s["arg" + index], heap)
                }));
            }
            return {
                locals: dumpHeap(s, heap),
                funcInfo: info,
                breakpointId: s.lastBrkId,
                callLocationId: s.callLocIdx,
                arguments: argInfo
            };
        }
        return undefined;
    }
    class SimDebugSession extends pxsim.protocol.DebugSession {
        constructor(container) {
            super();
            let options = {
                onDebuggerBreakpoint: b => this.onDebuggerBreakpoint(b),
                onDebuggerWarning: w => this.onDebuggerWarning(w),
                onDebuggerResume: () => this.onDebuggerResume(),
                onStateChanged: s => this.onStateChanged(s)
            };
            this.driver = new pxsim.SimulatorDriver(container, options);
        }
        runCode(js, parts, fnArgs, breakpoints, board) {
            this.breakpoints = breakpoints;
            if (this.projectDir) {
                this.fixBreakpoints();
            }
            this.sendEvent(new pxsim.protocol.InitializedEvent());
            this.driver.run(js, {
                parts,
                fnArgs,
                boardDefinition: board
            });
        }
        stopSimulator(unload = false) {
            this.driver.stop(unload);
        }
        initializeRequest(response, args) {
            response.body.supportsConditionalBreakpoints = false;
            response.body.supportsHitConditionalBreakpoints = false;
            response.body.supportsFunctionBreakpoints = false;
            response.body.supportsEvaluateForHovers = false;
            response.body.supportsStepBack = false;
            response.body.supportsSetVariable = false;
            response.body.supportsRestartFrame = false;
            response.body.supportsStepInTargetsRequest = false;
            response.body.supportsGotoTargetsRequest = false;
            response.body.supportsCompletionsRequest = false;
            // This default debug adapter implements the 'configurationDone' request.
            response.body.supportsConfigurationDoneRequest = true;
            this.sendResponse(response);
        }
        disconnectRequest(response, args) {
            this.sendResponse(response);
            this.shutdown();
        }
        launchRequest(response, args) {
            if (!this.projectDir) {
                this.projectDir = pxsim.util.normalizePath(args.projectDir);
                if (this.breakpoints) {
                    this.fixBreakpoints();
                }
            }
            this.sendResponse(response);
        }
        setBreakPointsRequest(response, args) {
            response.body = { breakpoints: [] };
            const ids = [];
            args.breakpoints.forEach(requestedBp => {
                if (this.breakpoints) {
                    const [id, bp] = this.breakpoints.verifyBreakpoint(pxsim.util.relativePath(this.projectDir, args.source.path), requestedBp);
                    response.body.breakpoints.push(bp);
                    if (bp.verified) {
                        ids.push(id);
                    }
                }
                else {
                    response.body.breakpoints.push({ verified: false });
                }
            });
            this.driver.setBreakpoints(ids);
            this.sendResponse(response);
        }
        continueRequest(response, args) {
            this.driver.resume(pxsim.SimulatorDebuggerCommand.Resume);
            this.sendResponse(response);
        }
        nextRequest(response, args) {
            this.driver.resume(pxsim.SimulatorDebuggerCommand.StepOver);
            this.sendResponse(response);
        }
        stepInRequest(response, args) {
            this.driver.resume(pxsim.SimulatorDebuggerCommand.StepInto);
            this.sendResponse(response);
        }
        stepOutRequest(response, args) {
            this.driver.resume(pxsim.SimulatorDebuggerCommand.StepOut);
            this.sendResponse(response);
        }
        pauseRequest(response, args) {
            this.driver.resume(pxsim.SimulatorDebuggerCommand.Pause);
            this.sendResponse(response);
        }
        threadsRequest(response) {
            response.body = { threads: [{ id: SimDebugSession.THREAD_ID, name: "main" }] };
            this.sendResponse(response);
        }
        stackTraceRequest(response, args) {
            if (this.lastBreak) {
                const frames = this.state.getFrames();
                response.body = { stackFrames: frames };
            }
            this.sendResponse(response);
        }
        scopesRequest(response, args) {
            if (this.state) {
                response.body = { scopes: this.state.getScopes(args.frameId) };
            }
            this.sendResponse(response);
        }
        variablesRequest(response, args) {
            if (this.state) {
                response.body = { variables: this.state.getVariables(args.variablesReference) };
            }
            this.sendResponse(response);
        }
        onDebuggerBreakpoint(breakMsg) {
            this.lastBreak = breakMsg;
            this.state = new StoppedState(this.lastBreak, this.breakpoints, this.projectDir);
            if (breakMsg.exceptionMessage) {
                const message = breakMsg.exceptionMessage.replace(/___\d+/g, '');
                this.sendEvent(new pxsim.protocol.StoppedEvent("exception", SimDebugSession.THREAD_ID, message));
            }
            else {
                this.sendEvent(new pxsim.protocol.StoppedEvent("breakpoint", SimDebugSession.THREAD_ID));
            }
        }
        onDebuggerWarning(warnMsg) {
        }
        onDebuggerResume() {
            this.sendEvent(new pxsim.protocol.ContinuedEvent(SimDebugSession.THREAD_ID, true));
        }
        onStateChanged(state) {
            switch (state) {
                case pxsim.SimulatorState.Paused:
                    // Sending a stopped event here would be redundant
                    break;
                case pxsim.SimulatorState.Running:
                    this.sendEvent(new pxsim.protocol.ContinuedEvent(SimDebugSession.THREAD_ID, true));
                    break;
                case pxsim.SimulatorState.Stopped:
                    this.sendEvent(new pxsim.protocol.TerminatedEvent());
                    break;
                //case SimulatorState.Unloaded:
                //case SimulatorState.Pending:
                default:
            }
        }
        fixBreakpoints() {
            // Fix breakpoint locations from the debugger's format to the client's
            for (const bpId in this.breakpoints.idMap) {
                const bp = this.breakpoints.idMap[bpId];
                bp.source.path = pxsim.util.pathJoin(this.projectDir, bp.source.path);
                bp.line = this.convertDebuggerLineToClient(bp.line);
                bp.endLine = this.convertDebuggerLineToClient(bp.endLine);
                bp.column = this.convertDebuggerColumnToClient(bp.column);
                bp.endColumn = this.convertDebuggerColumnToClient(bp.endColumn);
            }
        }
    }
    // We only have one thread
    // TODO: We could theoretically visualize the individual fibers
    SimDebugSession.THREAD_ID = 1;
    pxsim.SimDebugSession = SimDebugSession;
    /**
     * Maintains the state at the current breakpoint and handles lazy
     * queries for stack frames, scopes, variables, etc. The protocol
     * expects requests to be made in the order:
     *      Frames -> Scopes -> Variables
     */
    class StoppedState {
        constructor(_message, _map, _dir) {
            this._message = _message;
            this._map = _map;
            this._dir = _dir;
            this._currentId = 1;
            this._frames = {};
            this._vars = {};
            const globalId = this.nextId();
            this._vars[globalId] = this.getVariableValues(this._message.globals);
            this._globalScope = {
                name: "Globals",
                variablesReference: globalId,
                expensive: false
            };
        }
        /**
         * Get stack frames for current breakpoint.
         */
        getFrames() {
            return this._message.stackframes.map((s, i) => {
                const bp = this._map.getById(s.breakpointId);
                if (bp) {
                    this._frames[s.breakpointId] = s;
                    return {
                        id: s.breakpointId,
                        name: s.funcInfo ? s.funcInfo.functionName : (i === 0 ? "main" : "anonymous"),
                        line: bp.line,
                        column: bp.column,
                        endLine: bp.endLine,
                        endColumn: bp.endLine,
                        source: bp.source
                    };
                }
                return undefined;
            }).filter(b => !!b);
        }
        /**
         * Returns scopes visible to the given stack frame.
         *
         * TODO: Currently, we only support locals and globals (no closures)
         */
        getScopes(frameId) {
            const frame = this._frames[frameId];
            if (frame) {
                const localId = this.nextId();
                this._vars[localId] = this.getVariableValues(frame.locals);
                return [{
                        name: "Locals",
                        variablesReference: localId,
                        expensive: false
                    }, this._globalScope];
            }
            return [this._globalScope];
        }
        /**
         * Returns variable information (and object properties)
         */
        getVariables(variablesReference) {
            const lz = this._vars[variablesReference];
            return (lz && lz.value) || [];
        }
        getVariableValues(v) {
            return new pxsim.util.Lazy(() => {
                const result = [];
                for (const name in v) {
                    const value = v[name];
                    let vString;
                    let variablesReference = 0;
                    if (value === null) {
                        vString = "null";
                    }
                    else if (value === undefined) {
                        vString = "undefined";
                    }
                    else if (typeof value === "object") {
                        vString = "(object)";
                        variablesReference = this.nextId();
                        // Variables should be requested lazily, so reference loops aren't an issue
                        this._vars[variablesReference] = this.getVariableValues(value);
                    }
                    else {
                        vString = value.toString();
                    }
                    // Remove the metadata from the name
                    const displayName = name.substr(0, name.lastIndexOf("___"));
                    result.push({
                        name: displayName,
                        value: vString,
                        variablesReference
                    });
                }
                return result;
            });
        }
        nextId() {
            return this._currentId++;
        }
    }
})(pxsim || (pxsim = {}));
/// <reference path="../localtypings/pxtparts.d.ts"/>
/// <reference path="../localtypings/pxtarget.d.ts"/>
var pxsim;
(function (pxsim) {
    let multiplayer;
    (function (multiplayer) {
        let IconType;
        (function (IconType) {
            IconType[IconType["Player"] = 0] = "Player";
            IconType[IconType["Reaction"] = 1] = "Reaction";
        })(IconType = multiplayer.IconType || (multiplayer.IconType = {}));
    })(multiplayer = pxsim.multiplayer || (pxsim.multiplayer = {}));
    function print(delay = 0) {
        function p() {
            try {
                window.print();
            }
            catch (e) {
                // oops
            }
        }
        if (delay)
            setTimeout(p, delay);
        else
            p();
    }
    pxsim.print = print;
    let Embed;
    (function (Embed) {
        function start() {
            window.addEventListener("message", receiveMessage, false);
            Embed.frameid = window.location.hash.slice(1);
            initServiceWorker();
            pxsim.Runtime.postMessage({ type: 'ready', frameid: Embed.frameid });
        }
        Embed.start = start;
        function receiveMessage(event) {
            let origin = event.origin; // || (<any>event).originalEvent.origin;
            // TODO: test origins
            let data = event.data || {};
            let type = data.type;
            if (!type)
                return;
            switch (type) {
                case "run":
                    run(data);
                    break;
                case "instructions":
                    pxsim.instructions.renderInstructions(data);
                    break;
                case "stop":
                    stop();
                    break;
                case "mute":
                    mute(data.mute);
                    break;
                case "stopsound":
                    stopSound();
                    break;
                case "print":
                    print();
                    break;
                case 'recorder':
                    recorder(data);
                    break;
                case "screenshot":
                    pxsim.Runtime.postScreenshotAsync(data);
                    break;
                case "custom":
                    if (pxsim.handleCustomMessage)
                        pxsim.handleCustomMessage(data);
                    break;
                case 'pxteditor':
                    break; //handled elsewhere
                case 'debugger':
                    if (runtime)
                        runtime.handleDebuggerMsg(data);
                    break;
                case 'simulator':
                    let simData = data;
                    switch (simData.command) {
                        case "focus":
                            tickEvent("simulator.focus", { timestamp: simData.timestamp });
                            break;
                        case "blur":
                            tickEvent("simulator.blur", { timestamp: simData.timestamp });
                            break;
                    }
                default:
                    queue(data);
                    break;
            }
        }
        // TODO remove this; this should be using Runtime.runtime which gets
        // set correctly depending on which runtime is currently running
        let runtime;
        function stop() {
            if (runtime) {
                runtime.kill();
                if (runtime.board)
                    runtime.board.kill();
            }
        }
        Embed.stop = stop;
        function run(msg) {
            stop();
            if (msg.mute)
                mute(msg.mute);
            if (msg.localizedStrings)
                pxsim.localization.setLocalizedStrings(msg.localizedStrings);
            const rt = new pxsim.Runtime(msg);
            runtime = rt;
            rt.board.initAsync(msg)
                .then(() => {
                if (rt === runtime) {
                    rt.run((v) => {
                        pxsim.dumpLivePointers();
                        pxsim.Runtime.postMessage({ type: "toplevelcodefinished" });
                    });
                }
                // else: a new runtime was started while this one was still initializing.
                // This runtime has already been stopped by the beginning of this function.
            });
        }
        Embed.run = run;
        function mute(mute) {
            pxsim.AudioContextManager.mute(mute);
        }
        function stopSound() {
            pxsim.AudioContextManager.stopAll();
        }
        function queue(msg) {
            if (!runtime || runtime.dead) {
                return;
            }
            runtime.board.receiveMessage(msg);
        }
        function recorder(rec) {
            if (!runtime)
                return;
            switch (rec.action) {
                case "start":
                    runtime.startRecording(rec.width);
                    break;
                case "stop":
                    runtime.stopRecording();
                    break;
            }
        }
    })(Embed = pxsim.Embed || (pxsim.Embed = {}));
    /**
     * Log an event to the parent editor (allowSimTelemetry must be enabled in target)
     * @param id The id of the event
     * @param data Any custom values associated with this event
     */
    function tickEvent(id, data) {
        postMessageToEditor({
            type: "pxtsim",
            action: "event",
            tick: id,
            data
        });
    }
    pxsim.tickEvent = tickEvent;
    /**
     * Log an error to the parent editor (allowSimTelemetry must be enabled in target)
     * @param cat The category of the error
     * @param msg The error message
     * @param data Any custom values associated with this event
     */
    function reportError(cat, msg, data) {
        postMessageToEditor({
            type: "pxtsim",
            action: "event",
            tick: "error",
            category: cat,
            message: msg,
            data
        });
    }
    pxsim.reportError = reportError;
    function postMessageToEditor(message) {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
            window.parent.postMessage(message, "*");
        }
    }
    function initServiceWorker() {
        // pxsim is included in both the webapp and the simulator so we need to check if the ---simulator is
        // present in the window location
        if ("serviceWorker" in navigator && window.location.href.indexOf("---simulator") !== -1 && !pxsim.U.isLocalHost()) {
            // We don't have access to the webconfig in pxtsim so we need to extract the ref from the URL
            const pathname = window.location.pathname;
            const ref = pathname.substring(1, pathname.indexOf("---"));
            // Only reload if there is already a service worker installed
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.addEventListener("message", ev => {
                    const message = ev.data;
                    // We need to check the ref of the activated service worker so that we don't reload if you have
                    // index.html and beta open at the same time
                    if (message && message.type === "serviceworker" && message.state === "activated" && message.ref === ref) {
                        reload();
                    }
                });
            }
            const serviceWorkerUrl = window.location.href.replace(/---simulator.*$/, "---simserviceworker");
            navigator.serviceWorker.register(serviceWorkerUrl).then(function (registration) {
                pxsim.log("Simulator ServiceWorker registration successful with scope: ", registration.scope);
            }, function (err) {
                pxsim.log("Simulator ServiceWorker registration failed: ", err);
            });
        }
    }
    function reload() {
        // Continuously send message just in case the editor isn't ready to handle it yet
        setInterval(() => {
            pxsim.Runtime.postMessage({ type: "simulator", command: "reload" });
        }, 3000);
    }
    pxsim.reload = reload;
})(pxsim || (pxsim = {}));
pxsim.util.injectPolyphils();
if (typeof window !== 'undefined') {
    window.addEventListener('load', function (ev) {
        pxsim.Embed.start();
    });
}
var pxsim;
(function (pxsim) {
    var instructions;
    (function (instructions) {
        const LOC_LBL_SIZE = 10;
        const QUANT_LBL_SIZE = 30;
        const QUANT_LBL = (q) => `${q}x`;
        const WIRE_QUANT_LBL_SIZE = 20;
        const LBL_VERT_PAD = 3;
        const LBL_RIGHT_PAD = 5;
        const LBL_LEFT_PAD = 5;
        const REQ_WIRE_HEIGHT = 40;
        const REQ_CMP_HEIGHT = 50;
        const REQ_CMP_SCALE = 0.5 * 3;
        const ORIENTATION = "portrait";
        const PPI = 96.0;
        const PAGE_SCALAR = 0.95;
        const [FULL_PAGE_WIDTH, FULL_PAGE_HEIGHT] = (ORIENTATION == "portrait" ? [PPI * 8.5 * PAGE_SCALAR, PPI * 11.0 * PAGE_SCALAR] : [PPI * 11.0 * PAGE_SCALAR, PPI * 8.5 * PAGE_SCALAR]);
        const PAGE_MARGIN = PPI * 0.45;
        const PAGE_WIDTH = FULL_PAGE_WIDTH - PAGE_MARGIN * 2;
        const PAGE_HEIGHT = FULL_PAGE_HEIGHT - PAGE_MARGIN * 2;
        const BORDER_COLOR = "gray";
        const BORDER_RADIUS = 5 * 4;
        const BORDER_WIDTH = 2 * 2;
        const [PANEL_ROWS, PANEL_COLS] = [1, 1];
        const PANEL_MARGIN = 20;
        const PANEL_PADDING = 8 * 3;
        const PANEL_WIDTH = PAGE_WIDTH / PANEL_COLS - (PANEL_MARGIN + PANEL_PADDING + BORDER_WIDTH) * PANEL_COLS;
        const PANEL_HEIGHT = PAGE_HEIGHT / PANEL_ROWS - (PANEL_MARGIN + PANEL_PADDING + BORDER_WIDTH) * PANEL_ROWS;
        const BOARD_WIDTH = 465;
        const BOARD_LEFT = (PANEL_WIDTH - BOARD_WIDTH) / 2.0 + PANEL_PADDING;
        const BOARD_BOT = PANEL_PADDING;
        const NUM_BOX_SIZE = 120;
        const NUM_FONT = 80;
        const NUM_MARGIN = 10;
        const FRONT_PAGE_BOARD_WIDTH = 400;
        const PART_SCALAR = 1.7;
        const PARTS_BOARD_SCALE = 0.17;
        const PARTS_BB_SCALE = 0.25;
        const PARTS_CMP_SCALE = 0.3;
        const PARTS_WIRE_SCALE = 0.23;
        const STYLE = `
            .instr-panel {
                margin: ${PANEL_MARGIN}px;
                padding: ${PANEL_PADDING}px;
                border-width: ${BORDER_WIDTH}px;
                border-color: ${BORDER_COLOR};
                border-style: solid;
                border-radius: ${BORDER_RADIUS}px;
                display: inline-block;
                width: ${PANEL_WIDTH}px;
                height: ${PANEL_HEIGHT}px;
                position: relative;
                overflow: hidden;
                page-break-inside: avoid;
            }
            .board-svg {
                margin: 0 auto;
                display: block;
                position: absolute;
                bottom: ${BOARD_BOT}px;
                left: ${BOARD_LEFT}px;
            }
            .panel-num-outer {
                position: absolute;
                left: ${-BORDER_WIDTH}px;
                top: ${-BORDER_WIDTH}px;
                width: ${NUM_BOX_SIZE}px;
                height: ${NUM_BOX_SIZE}px;
                border-width: ${BORDER_WIDTH}px;
                border-style: solid;
                border-color: ${BORDER_COLOR};
                border-radius: ${BORDER_RADIUS}px 0 ${BORDER_RADIUS}px 0;
            }
            .panel-num {
                margin: ${NUM_MARGIN}px 0;
                text-align: center;
                font-size: ${NUM_FONT}px;
            }
            .cmp-div {
                display: inline-block;
            }
            .reqs-div {
                margin-left: ${PANEL_PADDING + NUM_BOX_SIZE}px;
                margin-top: 5px;
            }
            .partslist-wire,
            .partslist-cmp {
                margin: 10px;
            }
            .partslist-wire {
                display: inline-block;
            }
            `;
        function mkTxt(p, txt, size) {
            let el = pxsim.svg.elt("text");
            let [x, y] = p;
            pxsim.svg.hydrate(el, { x: x, y: y, style: `font-size:${size}px;` });
            el.textContent = txt;
            return el;
        }
        function mkBoardImgSvg(def) {
            const boardView = pxsim.visuals.mkBoardView({
                visual: def.visual,
                boardDef: def
            });
            return boardView.getView();
        }
        function mkBBSvg() {
            const bb = new pxsim.visuals.Breadboard({});
            return bb.getSVGAndSize();
        }
        function wrapSvg(el, opts) {
            //TODO: Refactor this function; it is too complicated. There is a lot of error-prone math being done
            // to scale and place all elements which could be simplified with more forethought.
            let svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            let dims = { l: 0, t: 0, w: 0, h: 0 };
            let cmpSvgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgEl.appendChild(cmpSvgEl);
            cmpSvgEl.appendChild(el.el);
            let cmpSvgAtts = {
                "viewBox": `${el.x} ${el.y} ${el.w} ${el.h}`,
                "preserveAspectRatio": "xMidYMid",
            };
            dims.w = el.w;
            dims.h = el.h;
            let scale = (scaler) => {
                dims.h *= scaler;
                dims.w *= scaler;
                cmpSvgAtts.width = dims.w;
                cmpSvgAtts.height = dims.h;
            };
            if (opts.cmpScale) {
                scale(opts.cmpScale);
            }
            if (opts.cmpWidth && opts.cmpWidth < dims.w) {
                scale(opts.cmpWidth / dims.w);
            }
            else if (opts.cmpHeight && opts.cmpHeight < dims.h) {
                scale(opts.cmpHeight / dims.h);
            }
            pxsim.svg.hydrate(cmpSvgEl, cmpSvgAtts);
            let elDims = { l: dims.l, t: dims.t, w: dims.w, h: dims.h };
            let updateL = (newL) => {
                if (newL < dims.l) {
                    let extraW = dims.l - newL;
                    dims.l = newL;
                    dims.w += extraW;
                }
            };
            let updateR = (newR) => {
                let oldR = dims.l + dims.w;
                if (oldR < newR) {
                    let extraW = newR - oldR;
                    dims.w += extraW;
                }
            };
            let updateT = (newT) => {
                if (newT < dims.t) {
                    let extraH = dims.t - newT;
                    dims.t = newT;
                    dims.h += extraH;
                }
            };
            let updateB = (newB) => {
                let oldB = dims.t + dims.h;
                if (oldB < newB) {
                    let extraH = newB - oldB;
                    dims.h += extraH;
                }
            };
            //labels
            let [xOff, yOff] = [-0.3, 0.3]; //HACK: these constants tweak the way "mkTxt" knows how to center the text
            const txtAspectRatio = [1.4, 1.0];
            if (opts && opts.top) {
                let size = opts.topSize;
                let txtW = size / txtAspectRatio[0];
                let txtH = size / txtAspectRatio[1];
                let [cx, y] = [elDims.l + elDims.w / 2, elDims.t - LBL_VERT_PAD - txtH / 2];
                let lbl = pxsim.visuals.mkTxt(cx, y, size, 0, opts.top, xOff, yOff);
                pxsim.U.addClass(lbl, "cmp-lbl");
                svgEl.appendChild(lbl);
                let len = txtW * opts.top.length;
                updateT(y - txtH / 2);
                updateL(cx - len / 2);
                updateR(cx + len / 2);
            }
            if (opts && opts.bot) {
                let size = opts.botSize;
                let txtW = size / txtAspectRatio[0];
                let txtH = size / txtAspectRatio[1];
                let [cx, y] = [elDims.l + elDims.w / 2, elDims.t + elDims.h + LBL_VERT_PAD + txtH / 2];
                let lbl = pxsim.visuals.mkTxt(cx, y, size, 0, opts.bot, xOff, yOff);
                pxsim.U.addClass(lbl, "cmp-lbl");
                svgEl.appendChild(lbl);
                let len = txtW * opts.bot.length;
                updateB(y + txtH / 2);
                updateL(cx - len / 2);
                updateR(cx + len / 2);
            }
            if (opts && opts.right) {
                let size = opts.rightSize;
                let txtW = size / txtAspectRatio[0];
                let txtH = size / txtAspectRatio[1];
                let len = txtW * opts.right.length;
                let [cx, cy] = [elDims.l + elDims.w + LBL_RIGHT_PAD + len / 2, elDims.t + elDims.h / 2];
                let lbl = pxsim.visuals.mkTxt(cx, cy, size, 0, opts.right, xOff, yOff);
                pxsim.U.addClass(lbl, "cmp-lbl");
                svgEl.appendChild(lbl);
                updateT(cy - txtH / 2);
                updateR(cx + len / 2);
                updateB(cy + txtH / 2);
            }
            if (opts && opts.left) {
                let size = opts.leftSize;
                let txtW = size / txtAspectRatio[0];
                let txtH = size / txtAspectRatio[1];
                let len = txtW * opts.left.length;
                let [cx, cy] = [elDims.l - LBL_LEFT_PAD - len / 2, elDims.t + elDims.h / 2];
                let lbl = pxsim.visuals.mkTxt(cx, cy, size, 0, opts.left, xOff, yOff);
                pxsim.U.addClass(lbl, "cmp-lbl");
                svgEl.appendChild(lbl);
                updateT(cy - txtH / 2);
                updateL(cx - len / 2);
                updateB(cy + txtH / 2);
            }
            let svgAtts = {
                "viewBox": `${dims.l} ${dims.t} ${dims.w} ${dims.h}`,
                "width": dims.w * PART_SCALAR,
                "height": dims.h * PART_SCALAR,
                "preserveAspectRatio": "xMidYMid",
            };
            pxsim.svg.hydrate(svgEl, svgAtts);
            let div = document.createElement("div");
            div.appendChild(svgEl);
            return div;
        }
        function mkCmpDiv(cmp, opts) {
            let state = pxsim.runtime.board;
            let el;
            if (cmp == "wire") {
                el = pxsim.visuals.mkWirePart([0, 0], opts.wireClr || "red", opts.crocClips);
            }
            else {
                let partVis = cmp;
                if (typeof partVis.builtIn == "string") {
                    let cnstr = state.builtinPartVisuals[partVis.builtIn];
                    el = cnstr([0, 0]);
                }
                else {
                    el = pxsim.visuals.mkGenericPartSVG(partVis);
                }
            }
            return wrapSvg(el, opts);
        }
        function mkBoardProps(allocOpts) {
            let allocRes = pxsim.allocateDefinitions(allocOpts);
            let stepToWires = [];
            let stepToCmps = [];
            let stepOffset = 1;
            allocRes.partsAndWires.forEach(cAndWs => {
                let part = cAndWs.part;
                let wires = cAndWs.wires;
                cAndWs.assembly.forEach((step, idx) => {
                    if (step.part && part)
                        stepToCmps[stepOffset + idx] = [part];
                    if (step.wireIndices && step.wireIndices.length > 0 && wires)
                        stepToWires[stepOffset + idx] = step.wireIndices.map(i => wires[i]);
                });
                stepOffset += cAndWs.assembly.length;
            });
            let numSteps = stepOffset;
            let lastStep = numSteps - 1;
            let allCmps = allocRes.partsAndWires.map(r => r.part).filter(p => !!p);
            let allWires = allocRes.partsAndWires.map(r => r.wires || []).reduce((p, n) => p.concat(n), []);
            let colorToWires = {};
            let allWireColors = [];
            allWires.forEach(w => {
                if (!colorToWires[w.color]) {
                    colorToWires[w.color] = [];
                    allWireColors.push(w.color);
                }
                colorToWires[w.color].push(w);
            });
            return {
                boardDef: allocOpts.boardDef,
                cmpDefs: allocOpts.partDefs,
                fnArgs: allocOpts.fnArgs,
                allAlloc: allocRes,
                stepToWires: stepToWires,
                stepToCmps: stepToCmps,
                allWires: allWires,
                allCmps: allCmps,
                lastStep: lastStep,
                colorToWires: colorToWires,
                allWireColors: allWireColors,
            };
        }
        function mkBlankBoardAndBreadboard(props, width, buildMode = false) {
            const state = pxsim.runtime.board;
            const opts = {
                state: state,
                boardDef: props.boardDef,
                forceBreadboardLayout: true,
                forceBreadboardRender: props.allAlloc.requiresBreadboard,
                partDefs: props.cmpDefs,
                maxWidth: `${width}px`,
                fnArgs: props.fnArgs,
                wireframe: buildMode,
                partsList: []
            };
            let boardHost = new pxsim.visuals.BoardHost(pxsim.visuals.mkBoardView({
                visual: opts.boardDef.visual,
                boardDef: opts.boardDef,
                wireframe: opts.wireframe
            }), opts);
            let view = boardHost.getView();
            pxsim.U.addClass(view, "board-svg");
            //set smiley
            //HACK
            // let img = board.board.displayCmp.image;
            // img.set(1, 0, 255);
            // img.set(3, 0, 255);
            // img.set(0, 2, 255);
            // img.set(1, 3, 255);
            // img.set(2, 3, 255);
            // img.set(3, 3, 255);
            // img.set(4, 2, 255);
            // board.updateState();
            return boardHost;
        }
        function drawSteps(board, step, props) {
            let view = board.getView();
            if (step > 0) {
                pxsim.U.addClass(view, "grayed");
            }
            for (let i = 0; i <= step; i++) {
                let cmps = props.stepToCmps[i];
                if (cmps) {
                    cmps.forEach(partInst => {
                        let cmp = board.addPart(partInst);
                        //last step
                        if (i === step) {
                            //highlight locations pins
                            partInst.breadboardConnections.forEach(bbLoc => board.highlightBreadboardPin(bbLoc));
                            pxsim.U.addClass(cmp.element, "notgrayed");
                        }
                    });
                }
                let wires = props.stepToWires[i];
                if (wires) {
                    wires.forEach(w => {
                        let wire = board.addWire(w);
                        if (!wire)
                            return;
                        //last step
                        if (i === step) {
                            //location highlights
                            if (w.start.type == "breadboard") {
                                let lbls = board.highlightBreadboardPin(w.start);
                            }
                            else {
                                board.highlightBoardPin(w.start.pin);
                            }
                            if (w.end.type == "breadboard") {
                                board.highlightBreadboardPin(w.end);
                            }
                            else {
                                board.highlightBoardPin(w.end.pin);
                            }
                            //highlight wire
                            board.highlightWire(wire);
                        }
                    });
                }
            }
        }
        function mkPanel() {
            //panel
            let panel = document.createElement("div");
            pxsim.U.addClass(panel, "instr-panel");
            return panel;
        }
        function mkPartsPanel(props) {
            let panel = mkPanel();
            // board and breadboard
            let boardImg = mkBoardImgSvg(props.boardDef);
            let board = wrapSvg(boardImg, { left: QUANT_LBL(1), leftSize: QUANT_LBL_SIZE, cmpScale: PARTS_BOARD_SCALE });
            panel.appendChild(board);
            let bbRaw = mkBBSvg();
            let bb = wrapSvg(bbRaw, { left: QUANT_LBL(1), leftSize: QUANT_LBL_SIZE, cmpScale: PARTS_BB_SCALE });
            panel.appendChild(bb);
            // components
            let cmps = props.allCmps;
            cmps.forEach(c => {
                let quant = 1;
                // TODO: don't special case this
                if (c.visual.builtIn === "buttonpair") {
                    quant = 2;
                }
                let cmp = mkCmpDiv(c.visual, {
                    left: QUANT_LBL(quant),
                    leftSize: QUANT_LBL_SIZE,
                    cmpScale: PARTS_CMP_SCALE,
                });
                pxsim.U.addClass(cmp, "partslist-cmp");
                panel.appendChild(cmp);
            });
            // wires
            props.allWireColors.forEach(clr => {
                let quant = props.colorToWires[clr].length;
                let style = props.boardDef.pinStyles[clr] || "female";
                let cmp = mkCmpDiv("wire", {
                    left: QUANT_LBL(quant),
                    leftSize: WIRE_QUANT_LBL_SIZE,
                    wireClr: clr,
                    cmpScale: PARTS_WIRE_SCALE,
                    crocClips: style == "croc"
                });
                pxsim.U.addClass(cmp, "partslist-wire");
                panel.appendChild(cmp);
            });
            return panel;
        }
        function mkStepPanel(step, props) {
            let panel = mkPanel();
            //board
            let board = mkBlankBoardAndBreadboard(props, BOARD_WIDTH, true);
            drawSteps(board, step, props);
            panel.appendChild(board.getView());
            //number
            let numDiv = document.createElement("div");
            pxsim.U.addClass(numDiv, "panel-num-outer");
            pxsim.U.addClass(numDiv, "noselect");
            panel.appendChild(numDiv);
            let num = document.createElement("div");
            pxsim.U.addClass(num, "panel-num");
            num.textContent = (step + 1) + "";
            numDiv.appendChild(num);
            // add requirements
            let reqsDiv = document.createElement("div");
            pxsim.U.addClass(reqsDiv, "reqs-div");
            panel.appendChild(reqsDiv);
            let wires = (props.stepToWires[step] || []);
            let mkLabel = (loc) => {
                if (loc.type === "breadboard") {
                    let { row, col } = loc;
                    return `(${row},${col})`;
                }
                else
                    return loc.pin;
            };
            wires.forEach(w => {
                let croc = false;
                if (w.end.type == "dalboard") {
                    croc = props.boardDef.pinStyles[w.end.pin] == "croc";
                }
                let cmp = mkCmpDiv("wire", {
                    top: mkLabel(w.end),
                    topSize: LOC_LBL_SIZE,
                    bot: mkLabel(w.start),
                    botSize: LOC_LBL_SIZE,
                    wireClr: w.color,
                    cmpHeight: REQ_WIRE_HEIGHT,
                    crocClips: croc
                });
                pxsim.U.addClass(cmp, "cmp-div");
                reqsDiv.appendChild(cmp);
            });
            let cmps = (props.stepToCmps[step] || []);
            cmps.forEach(c => {
                let locs;
                if (c.visual.builtIn === "buttonpair") {
                    //TODO: don't special case this
                    locs = [c.breadboardConnections[0], c.breadboardConnections[2]];
                }
                else {
                    locs = [c.breadboardConnections[0]];
                }
                locs.forEach((l, i) => {
                    let topLbl;
                    if (l) {
                        let { row, col } = l;
                        topLbl = `(${row},${col})`;
                    }
                    else {
                        topLbl = "";
                    }
                    let scale = REQ_CMP_SCALE;
                    if (c.visual.builtIn === "buttonpair")
                        scale *= 0.5; //TODO: don't special case
                    let cmp = mkCmpDiv(c.visual, {
                        top: topLbl,
                        topSize: LOC_LBL_SIZE,
                        cmpHeight: REQ_CMP_HEIGHT,
                        cmpScale: scale
                    });
                    pxsim.U.addClass(cmp, "cmp-div");
                    reqsDiv.appendChild(cmp);
                });
            });
            return panel;
        }
        function updateFrontPanel(props) {
            let panel = document.getElementById("front-panel");
            let board = mkBlankBoardAndBreadboard(props, FRONT_PAGE_BOARD_WIDTH, false);
            board.addAll(props.allAlloc);
            panel.appendChild(board.getView());
            return [panel, props];
        }
        function renderParts(container, options) {
            if (!options.boardDef.pinStyles)
                options.boardDef.pinStyles = {};
            if (options.configData)
                pxsim.setConfigData(options.configData.cfg, options.configData.cfgKey);
            const msg = {
                type: "run",
                code: "",
                boardDefinition: options.boardDef,
                partDefinitions: options.partDefinitions
            };
            pxsim.runtime = new pxsim.Runtime(msg);
            pxsim.runtime.board = null;
            pxsim.initCurrentRuntime(msg); // TODO it seems Runtime() ctor already calls this?
            let style = document.createElement("style");
            style.textContent += STYLE;
            document.head.appendChild(style);
            const cmpDefs = options.partDefinitions;
            //props
            let dummyBreadboard = new pxsim.visuals.Breadboard({});
            let props = mkBoardProps({
                boardDef: options.boardDef,
                partDefs: cmpDefs,
                partsList: options.parts,
                fnArgs: options.fnArgs,
                getBBCoord: dummyBreadboard.getCoord.bind(dummyBreadboard)
            });
            props.allAlloc.requiresBreadboard = true;
            //front page
            let frontPanel = updateFrontPanel(props);
            //all required parts
            let partsPanel = mkPartsPanel(props);
            container.appendChild(partsPanel);
            //steps
            for (let s = 0; s <= props.lastStep; s++) {
                let p = mkStepPanel(s, props);
                container.appendChild(p);
            }
            //final
            //let finalPanel = mkFinalPanel(props);
            //container.appendChild(finalPanel);
            if (options.print)
                pxsim.print(2000);
        }
        instructions.renderParts = renderParts;
        function renderInstructions(msg) {
            document.getElementById("proj-title").innerText = msg.options.name || "";
            renderParts(document.body, msg.options);
        }
        instructions.renderInstructions = renderInstructions;
    })(instructions = pxsim.instructions || (pxsim.instructions = {}));
})(pxsim || (pxsim = {}));
// APIs for language/runtime support (records, locals, function values)
var pxsim;
(function (pxsim) {
    pxsim.quiet = false;
    function check(cond, msg = "sim: check failed") {
        if (!cond) {
            debugger;
            throw new Error(msg);
        }
    }
    pxsim.check = check;
    pxsim.title = "";
    let cfgKey = {};
    let cfg = {};
    function getConfig(id) {
        if (cfg.hasOwnProperty(id + ""))
            return cfg[id + ""];
        return null;
    }
    pxsim.getConfig = getConfig;
    function getConfigKey(id) {
        if (cfgKey.hasOwnProperty(id))
            return cfgKey[id];
        return null;
    }
    pxsim.getConfigKey = getConfigKey;
    function getAllConfigKeys() {
        return Object.keys(cfgKey);
    }
    pxsim.getAllConfigKeys = getAllConfigKeys;
    function setConfigKey(key, id) {
        cfgKey[key] = id;
    }
    pxsim.setConfigKey = setConfigKey;
    function setConfig(id, val) {
        cfg[id] = val;
    }
    pxsim.setConfig = setConfig;
    function setConfigData(cfg_, cfgKey_) {
        cfg = cfg_;
        cfgKey = cfgKey_;
    }
    pxsim.setConfigData = setConfigData;
    function getConfigData() {
        return { cfg, cfgKey };
    }
    pxsim.getConfigData = getConfigData;
    function setTitle(t) {
        pxsim.title = t;
    }
    pxsim.setTitle = setTitle;
    class RefObject {
        constructor() {
            if (pxsim.runtime)
                this.id = pxsim.runtime.registerLiveObject(this);
            else
                this.id = 0;
        }
        destroy() { }
        scan(mark) {
            throw pxsim.U.userError("scan not implemented");
        }
        gcKey() { throw pxsim.U.userError("gcKey not implemented"); }
        gcSize() { throw pxsim.U.userError("gcSize not implemented"); }
        gcIsStatic() { return false; }
        print() {
            if (pxsim.runtime && pxsim.runtime.refCountingDebug)
                pxsim.log(`RefObject id:${this.id}`);
        }
        // render a debug preview string
        toDebugString() {
            return "(object)";
        }
        static toAny(o) {
            if (o && o.toAny)
                return o.toAny();
            return o;
        }
        static fromAny(o) {
            if (!o)
                return o;
            if (o instanceof RefObject)
                return o; // already a Ref* object
            if (Array.isArray(o))
                return pxsim.RefCollection.fromAny(o);
            if (typeof o === "object")
                return RefRecord.fromAny(o);
            return o; // number, string, boolean, null, undefined, etc...
        }
        static toDebugString(o) {
            if (o === null)
                return "null";
            if (o === undefined)
                return "undefined;";
            if (o.vtable && o.vtable.name) {
                if (o.vtable.name === "_Map" && o instanceof RefMap) {
                    return "(object)";
                }
                return o.vtable.name;
            }
            if (o.toDebugString)
                return o.toDebugString();
            if (o.vtable && o.vtable.name)
                return o.vtable.name;
            if (typeof o == "string")
                return JSON.stringify(o);
            return o.toString();
        }
    }
    pxsim.RefObject = RefObject;
    class FnWrapper {
        constructor(func, caps, args) {
            this.func = func;
            this.caps = caps;
            this.args = args;
        }
    }
    pxsim.FnWrapper = FnWrapper;
    class RefRecord extends RefObject {
        constructor() {
            super(...arguments);
            this.fields = {};
        }
        scan(mark) {
            for (let k of Object.keys(this.fields))
                mark(k, this.fields[k]);
        }
        gcKey() { return this.vtable.name; }
        gcSize() { return this.vtable.numFields + 1; }
        destroy() {
            this.fields = null;
            this.vtable = null;
        }
        print() {
            if (pxsim.runtime && pxsim.runtime.refCountingDebug)
                pxsim.log(`RefRecord id:${this.id} (${this.vtable.name})`);
        }
        toDebugString() {
            let s = "RefRecord: {";
            const keys = Object.keys(this.fields);
            for (let i = 0; i < keys.length; ++i) {
                if (i > 0)
                    s += ", ";
                s += keys[i] + ": " + RefObject.toDebugString(this.fields[keys[i]]);
            }
            return s + "}";
        }
        toAny() {
            const r = {};
            for (let k of Object.keys(this.fields)) {
                r[k] = RefObject.toAny(this.fields[k]);
            }
            return r;
        }
        static fromAny(o) {
            const r = new RefRecord();
            for (let k of Object.keys(o)) {
                r.fields[k] = RefObject.fromAny(o[k]);
            }
            return r;
        }
    }
    pxsim.RefRecord = RefRecord;
    class RefAction extends RefObject {
        constructor() {
            super(...arguments);
            this.fields = [];
        }
        scan(mark) {
            for (let i = 0; i < this.fields.length; ++i)
                mark("_cap" + i, this.fields[i]);
        }
        gcKey() { return pxsim.functionName(this.func); }
        gcSize() { return this.fields.length + 3; }
        isRef(idx) {
            check(0 <= idx && idx < this.fields.length);
            return idx < this.len;
        }
        ldclo(n) {
            n >>= 2;
            check(0 <= n && n < this.fields.length);
            return this.fields[n];
        }
        destroy() {
            this.fields = null;
            this.func = null;
        }
        print() {
            if (pxsim.runtime && pxsim.runtime.refCountingDebug)
                pxsim.log(`RefAction id:${this.id} len:${this.fields.length}`);
        }
    }
    pxsim.RefAction = RefAction;
    let pxtcore;
    (function (pxtcore) {
        function seedAddRandom(num) {
            // nothing yet
        }
        pxtcore.seedAddRandom = seedAddRandom;
        function mkAction(len, fn) {
            let r = new RefAction();
            r.len = len;
            r.func = fn;
            for (let i = 0; i < len; ++i)
                r.fields.push(null);
            return r;
        }
        pxtcore.mkAction = mkAction;
        function runAction(a, args) {
            let cb = pxsim.getResume();
            if (a instanceof RefAction) {
                cb(new FnWrapper(a.func, a.fields, args));
            }
            else {
                // no-closure case
                cb(new FnWrapper(a, null, args));
            }
        }
        pxtcore.runAction = runAction;
        let counters = {};
        // TODO move this somewhere else, so it can be invoked also on data coming from hardware
        function processPerfCounters(msg) {
            let r = "";
            const addfmtr = (s, len) => {
                r += s.length >= len ? s : ("              " + s).slice(-len);
            };
            const addfmtl = (s, len) => {
                r += s.length >= len ? s : (s + "                         ").slice(0, len);
            };
            const addnum = (n) => addfmtr("" + Math.round(n), 6);
            const addstats = (numstops, us) => {
                addfmtr(Math.round(us) + "", 8);
                r += " /";
                addnum(numstops);
                r += " =";
                addnum(us / numstops);
            };
            for (let line of msg.split(/\n/)) {
                if (!line)
                    continue;
                if (!/^\d/.test(line))
                    continue;
                const fields = line.split(/,/);
                let pi = counters[fields[2]];
                if (!pi)
                    counters[fields[2]] = pi = { stops: 0, us: 0, meds: [] };
                addfmtl(fields[2], 25);
                const numstops = parseInt(fields[0]);
                const us = parseInt(fields[1]);
                addstats(numstops, us);
                r += " |";
                addstats(numstops - pi.stops, us - pi.us);
                r += " ~";
                const med = parseInt(fields[3]);
                addnum(med);
                if (pi.meds.length > 10)
                    pi.meds.shift();
                pi.meds.push(med);
                const mm = pi.meds.slice();
                mm.sort((a, b) => a - b);
                const ubermed = mm[mm.length >> 1];
                r += " ~~";
                addnum(ubermed);
                pi.stops = numstops;
                pi.us = us;
                r += "\n";
            }
            pxsim.log(r);
        }
        function dumpPerfCounters() {
            if (!pxsim.runtime || !pxsim.runtime.perfCounters)
                return;
            let csv = "calls,us,name\n";
            for (let p of pxsim.runtime.perfCounters) {
                p.lastFew.sort();
                const median = p.lastFew[p.lastFew.length >> 1];
                csv += `${p.numstops},${p.value},${p.name},${median}\n`;
            }
            processPerfCounters(csv);
            // pxsim.log(csv)
        }
        pxtcore.dumpPerfCounters = dumpPerfCounters;
    })(pxtcore = pxsim.pxtcore || (pxsim.pxtcore = {}));
    class RefRefLocal extends RefObject {
        constructor() {
            super(...arguments);
            this.v = undefined;
        }
        scan(mark) {
            mark("*", this.v);
        }
        gcKey() { return "LOC"; }
        gcSize() { return 2; }
        destroy() {
        }
        print() {
            if (pxsim.runtime && pxsim.runtime.refCountingDebug)
                pxsim.log(`RefRefLocal id:${this.id} v:${this.v}`);
        }
    }
    pxsim.RefRefLocal = RefRefLocal;
    class RefMap extends RefObject {
        constructor() {
            super(...arguments);
            this.vtable = pxsim.mkMapVTable();
            this.data = [];
        }
        scan(mark) {
            for (let d of this.data) {
                mark(d.key, d.val);
            }
        }
        gcKey() { return "{...}"; }
        gcSize() { return this.data.length * 2 + 4; }
        findIdx(key) {
            key = key + ""; // make sure it's a string
            for (let i = 0; i < this.data.length; ++i) {
                if (this.data[i].key == key)
                    return i;
            }
            return -1;
        }
        destroy() {
            super.destroy();
            for (let i = 0; i < this.data.length; ++i) {
                this.data[i].val = 0;
            }
            this.data = [];
        }
        print() {
            if (pxsim.runtime && pxsim.runtime.refCountingDebug)
                pxsim.log(`RefMap id:${this.id} size:${this.data.length}`);
        }
        toDebugString() {
            let s = "RefMap: {";
            for (let i = 0; i < this.data.length; ++i) {
                if (i > 0)
                    s += ", ";
                s += this.data[i].key + ": " + RefObject.toDebugString(this.data[i].val);
            }
            return s + "}";
        }
        toAny() {
            const r = {};
            this.data.forEach(d => {
                r[d.key] = RefObject.toAny(d.val);
            });
            return r;
        }
        static fromAny(o) {
            const r = new RefMap();
            for (let k of Object.keys(o)) {
                r.data.push({ key: k, val: RefObject.fromAny(o[k]) });
            }
            return r;
        }
    }
    pxsim.RefMap = RefMap;
    function num(v) {
        return v;
    }
    function ref(v) {
        if (v === undefined)
            return null;
        return v;
    }
    function dumpLivePointers() {
        if (pxsim.runtime)
            pxsim.runtime.dumpLivePointers();
    }
    pxsim.dumpLivePointers = dumpLivePointers;
    let numops;
    (function (numops) {
        function toString(v) {
            if (v === null)
                return "null";
            else if (v === undefined)
                return "undefined";
            return v.toString();
        }
        numops.toString = toString;
        function toBoolDecr(v) {
            return !!v;
        }
        numops.toBoolDecr = toBoolDecr;
        function toBool(v) {
            return !!v;
        }
        numops.toBool = toBool;
    })(numops = pxsim.numops || (pxsim.numops = {}));
    let langsupp;
    (function (langsupp) {
        function toInt(v) { return (v | 0); } // TODO
        langsupp.toInt = toInt;
        function toFloat(v) { return v; }
        langsupp.toFloat = toFloat;
        function ignore(v) { return v; }
        langsupp.ignore = ignore;
    })(langsupp = pxsim.langsupp || (pxsim.langsupp = {}));
    (function (pxtcore) {
        function ptrOfLiteral(v) {
            return v;
        }
        pxtcore.ptrOfLiteral = ptrOfLiteral;
        function debugMemLeaks() {
            dumpLivePointers();
        }
        pxtcore.debugMemLeaks = debugMemLeaks;
        function templateHash() {
            return 0;
        }
        pxtcore.templateHash = templateHash;
        function programHash() {
            return 0;
        }
        pxtcore.programHash = programHash;
        function programName() {
            return pxsim.title;
        }
        pxtcore.programName = programName;
        function programSize() {
            return 0;
        }
        pxtcore.programSize = programSize;
        function afterProgramPage() {
            return 0;
        }
        pxtcore.afterProgramPage = afterProgramPage;
        function getConfig(key, defl) {
            let r = pxsim.getConfig(key);
            if (r == null)
                return defl;
            return r;
        }
        pxtcore.getConfig = getConfig;
        // these shouldn't generally be called when compiled for simulator
        // provide implementation to silence warnings and as future-proofing
        function toInt(n) { return n >> 0; }
        pxtcore.toInt = toInt;
        function toUInt(n) { return n >>> 0; }
        pxtcore.toUInt = toUInt;
        function toDouble(n) { return n; }
        pxtcore.toDouble = toDouble;
        function toFloat(n) { return n; }
        pxtcore.toFloat = toFloat;
        function fromInt(n) { return n; }
        pxtcore.fromInt = fromInt;
        function fromUInt(n) { return n; }
        pxtcore.fromUInt = fromUInt;
        function fromDouble(n) { return n; }
        pxtcore.fromDouble = fromDouble;
        function fromFloat(n) { return n; }
        pxtcore.fromFloat = fromFloat;
        function fromBool(n) { return !!n; }
        pxtcore.fromBool = fromBool;
    })(pxtcore = pxsim.pxtcore || (pxsim.pxtcore = {}));
    let pxtrt;
    (function (pxtrt) {
        function toInt8(v) {
            return ((v & 0xff) << 24) >> 24;
        }
        pxtrt.toInt8 = toInt8;
        function toInt16(v) {
            return ((v & 0xffff) << 16) >> 16;
        }
        pxtrt.toInt16 = toInt16;
        function toInt32(v) {
            return v | 0;
        }
        pxtrt.toInt32 = toInt32;
        function toUInt32(v) {
            return v >>> 0;
        }
        pxtrt.toUInt32 = toUInt32;
        function toUInt8(v) {
            return v & 0xff;
        }
        pxtrt.toUInt8 = toUInt8;
        function toUInt16(v) {
            return v & 0xffff;
        }
        pxtrt.toUInt16 = toUInt16;
        function nullFix(v) {
            if (v === null || v === undefined || v === false)
                return 0;
            if (v === true)
                return 1;
            return v;
        }
        pxtrt.nullFix = nullFix;
        function nullCheck(v) {
            if (v === null || v === undefined)
                pxsim.U.userError("Dereferencing null/undefined value.");
        }
        pxtrt.nullCheck = nullCheck;
        function panic(code) {
            pxsim.U.userError("PANIC! Code " + code);
        }
        pxtrt.panic = panic;
        function stringToBool(s) {
            return s ? 1 : 0;
        }
        pxtrt.stringToBool = stringToBool;
        function ptrToBool(v) {
            return v ? 1 : 0;
        }
        pxtrt.ptrToBool = ptrToBool;
        function emptyToNull(s) {
            if (s == "")
                return 0;
            return s;
        }
        pxtrt.emptyToNull = emptyToNull;
        function ldlocRef(r) {
            return (r.v);
        }
        pxtrt.ldlocRef = ldlocRef;
        function stlocRef(r, v) {
            r.v = v;
        }
        pxtrt.stlocRef = stlocRef;
        function mklocRef() {
            return new RefRefLocal();
        }
        pxtrt.mklocRef = mklocRef;
        // Store a captured local in a closure. It returns the action, so it can be chained.
        function stclo(a, idx, v) {
            check(0 <= idx && idx < a.fields.length);
            check(a.fields[idx] === null);
            //pxsim.log(`STCLO [${idx}] = ${v}`)
            a.fields[idx] = v;
            return a;
        }
        pxtrt.stclo = stclo;
        function runtimeWarning(msg) {
            pxsim.Runtime.postMessage(pxsim.getWarningMessage(msg));
        }
        pxtrt.runtimeWarning = runtimeWarning;
        function mkMap() {
            return new RefMap();
        }
        pxtrt.mkMap = mkMap;
        function mapGet(map, key) {
            return mapGetByString(map, pxtrt.mapKeyNames[key]);
        }
        pxtrt.mapGet = mapGet;
        function mapSet(map, key, val) {
            return mapSetByString(map, pxtrt.mapKeyNames[key], val);
        }
        pxtrt.mapSet = mapSet;
        function mapGetByString(map, key) {
            if (!map) {
                pxsim.throwFailedPropertyAccessError(map, key);
            }
            key += "";
            if (map instanceof RefRecord) {
                let r = map;
                return r.fields[key];
            }
            let i = map.findIdx(key);
            if (i < 0) {
                return undefined;
            }
            return (map.data[i].val);
        }
        pxtrt.mapGetByString = mapGetByString;
        function mapDeleteByString(map, key) {
            if (map === undefined || map === null) {
                pxsim.throwNullUndefinedAsObjectError();
            }
            if (!(map instanceof RefMap)) {
                pxsim.throwFailedCastError(map, "object");
            }
            let i = map.findIdx(key);
            if (i >= 0)
                map.data.splice(i, 1);
            return true;
        }
        pxtrt.mapDeleteByString = mapDeleteByString;
        pxtrt.mapSetGeneric = mapSetByString;
        pxtrt.mapGetGeneric = mapGetByString;
        function mapSetByString(map, key, val) {
            if (!map) {
                pxsim.throwFailedPropertyAccessError(map, key);
            }
            key += "";
            if (map instanceof RefRecord) {
                let r = map;
                r.fields[key] = val;
                return;
            }
            let i = map.findIdx(key);
            if (i < 0) {
                map.data.push({
                    key: key,
                    val: val,
                });
            }
            else {
                map.data[i].val = val;
            }
        }
        pxtrt.mapSetByString = mapSetByString;
        function keysOf(v) {
            if (v === undefined || v === null) {
                pxsim.throwNullUndefinedAsObjectError();
            }
            let r = new pxsim.RefCollection();
            if (v instanceof RefMap)
                for (let k of v.data) {
                    r.push(k.key);
                }
            return r;
        }
        pxtrt.keysOf = keysOf;
    })(pxtrt = pxsim.pxtrt || (pxsim.pxtrt = {}));
    (function (pxtcore) {
        function mkClassInstance(vtable) {
            check(!!vtable.methods);
            let r = new RefRecord();
            r.vtable = vtable;
            return r;
        }
        pxtcore.mkClassInstance = mkClassInstance;
        function switch_eq(a, b) {
            if (a == b) {
                return true;
            }
            return false;
        }
        pxtcore.switch_eq = switch_eq;
        function typeOf(obj) {
            return typeof obj;
        }
        pxtcore.typeOf = typeOf;
    })(pxtcore = pxsim.pxtcore || (pxsim.pxtcore = {}));
    let thread;
    (function (thread) {
        thread.panic = pxtrt.panic;
        function pause(ms) {
            let cb = pxsim.getResume();
            pxsim.runtime.schedule(() => { cb(); }, ms);
        }
        thread.pause = pause;
        function runInBackground(a) {
            typeCheck(a);
            pxsim.runtime.runFiberAsync(a);
        }
        thread.runInBackground = runInBackground;
        function forever(a) {
            function loop() {
                pxsim.runtime.runFiberAsync(a)
                    .then(() => pxsim.U.delay(20))
                    .then(loop);
            }
            typeCheck(a);
            loop();
        }
        thread.forever = forever;
        function typeCheck(a) {
            if (!a || !(a instanceof RefAction) && !a.info) {
                pxsim.throwFailedCastError(a, "function");
            }
        }
        thread.typeCheck = typeCheck;
    })(thread = pxsim.thread || (pxsim.thread = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    // A ref-counted collection of either primitive or ref-counted objects (String, Image,
    // user-defined record, another collection)
    class RefCollection extends pxsim.RefObject {
        constructor() {
            super();
            this.data = [];
        }
        scan(mark) {
            for (let i = 0; i < this.data.length; ++i)
                mark("[" + i + "]", this.data[i]);
        }
        gcKey() { return "[...]"; }
        gcSize() { return this.data.length + 2; }
        toArray() {
            return this.data.slice(0);
        }
        toAny() {
            return this.data.map(v => pxsim.RefObject.toAny(v));
        }
        static fromAny(arr, deep = true) {
            const r = new RefCollection();
            if (deep)
                r.data = arr.map(v => pxsim.RefObject.fromAny(v));
            else
                r.data = arr.slice(0);
            return r;
        }
        toDebugString() {
            let s = "[";
            for (let i = 0; i < this.data.length; ++i) {
                if (i > 0)
                    s += ",";
                let newElem = pxsim.RefObject.toDebugString(this.data[i]);
                if (s.length + newElem.length > 100) {
                    if (i == 0) {
                        s += newElem.substr(0, 100);
                    }
                    s += "...";
                    break;
                }
                else {
                    s += newElem;
                }
            }
            s += "]";
            return s;
        }
        destroy() {
            let data = this.data;
            for (let i = 0; i < data.length; ++i) {
                data[i] = 0;
            }
            this.data = [];
        }
        isValidIndex(x) {
            return (x >= 0 && x < this.data.length);
        }
        push(x) {
            this.data.push(x);
        }
        pop() {
            return this.data.pop();
            ;
        }
        getLength() {
            return this.data.length;
        }
        setLength(x) {
            this.data.length = x;
        }
        getAt(x) {
            return this.data[x];
        }
        setAt(x, y) {
            this.data[x] = y;
        }
        insertAt(x, y) {
            this.data.splice(x, 0, y);
        }
        removeAt(x) {
            let ret = this.data.splice(x, 1);
            return ret[0]; // return the deleted element.
        }
        indexOf(x, start) {
            return this.data.indexOf(x, start);
        }
        print() {
            //pxsim.log(`RefCollection id:${this.id} refs:${this.refcnt} len:${this.data.length} d0:${this.data[0]}`)
        }
    }
    pxsim.RefCollection = RefCollection;
    let Array_;
    (function (Array_) {
        function mk() {
            return new RefCollection();
        }
        Array_.mk = mk;
        function isArray(c) {
            return c instanceof RefCollection;
        }
        Array_.isArray = isArray;
        function length(c) {
            typeCheck(c);
            return c.getLength();
        }
        Array_.length = length;
        function setLength(c, x) {
            typeCheck(c);
            c.setLength(x);
        }
        Array_.setLength = setLength;
        function push(c, x) {
            typeCheck(c);
            c.push(x);
        }
        Array_.push = push;
        function pop(c, x) {
            typeCheck(c);
            let ret = c.pop();
            // no decr() since we're returning it
            return ret;
        }
        Array_.pop = pop;
        function getAt(c, x) {
            typeCheck(c);
            let tmp = c.getAt(x);
            return tmp;
        }
        Array_.getAt = getAt;
        function removeAt(c, x) {
            typeCheck(c);
            if (!c.isValidIndex(x))
                return;
            // no decr() since we're returning it
            return c.removeAt(x);
        }
        Array_.removeAt = removeAt;
        function insertAt(c, x, y) {
            typeCheck(c);
            c.insertAt(x, y);
        }
        Array_.insertAt = insertAt;
        function setAt(c, x, y) {
            typeCheck(c);
            c.setAt(x, y);
        }
        Array_.setAt = setAt;
        function indexOf(c, x, start) {
            typeCheck(c);
            return c.indexOf(x, start);
        }
        Array_.indexOf = indexOf;
        function removeElement(c, x) {
            typeCheck(c);
            let idx = indexOf(c, x, 0);
            if (idx >= 0) {
                removeAt(c, idx);
                return 1;
            }
            return 0;
        }
        Array_.removeElement = removeElement;
        function typeCheck(c) {
            if (!(c instanceof RefCollection)) {
                pxsim.throwFailedCastError(c, "Array");
            }
        }
        Array_.typeCheck = typeCheck;
    })(Array_ = pxsim.Array_ || (pxsim.Array_ = {}));
    let Math_;
    (function (Math_) {
        // for explanations see:
        // http://stackoverflow.com/questions/3428136/javascript-integer-math-incorrect-results (second answer)
        // (but the code below doesn't come from there; I wrote it myself)
        Math_.imul = Math.imul || function (a, b) {
            const ah = (a >>> 16) & 0xffff;
            const al = a & 0xffff;
            const bh = (b >>> 16) & 0xffff;
            const bl = b & 0xffff;
            // the shift by 0 fixes the sign on the high part
            // the final |0 converts the unsigned value into a signed value
            return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
        };
        function idiv(x, y) {
            return ((x | 0) / (y | 0)) | 0;
        }
        Math_.idiv = idiv;
        function round(n) { return Math.round(n); }
        Math_.round = round;
        function roundWithPrecision(x, digits) {
            digits = digits | 0;
            // invalid digits input
            if (digits <= 0)
                return Math.round(x);
            if (x == 0)
                return 0;
            let r = 0;
            while (r == 0 && digits < 21) {
                const d = Math.pow(10, digits++);
                r = Math.round(x * d + Number.EPSILON) / d;
            }
            return r;
        }
        Math_.roundWithPrecision = roundWithPrecision;
        function ceil(n) { return Math.ceil(n); }
        Math_.ceil = ceil;
        function floor(n) { return Math.floor(n); }
        Math_.floor = floor;
        function sqrt(n) { return Math.sqrt(n); }
        Math_.sqrt = sqrt;
        function pow(x, y) {
            return Math.pow(x, y);
        }
        Math_.pow = pow;
        function clz32(n) { return Math.clz32(n); }
        Math_.clz32 = clz32;
        function log(n) { return Math.log(n); }
        Math_.log = log;
        function log10(n) { return Math.log10(n); }
        Math_.log10 = log10;
        function log2(n) { return Math.log2(n); }
        Math_.log2 = log2;
        function exp(n) { return Math.exp(n); }
        Math_.exp = exp;
        function sin(n) { return Math.sin(n); }
        Math_.sin = sin;
        function sinh(n) { return Math.sinh(n); }
        Math_.sinh = sinh;
        function cos(n) { return Math.cos(n); }
        Math_.cos = cos;
        function cosh(n) { return Math.cosh(n); }
        Math_.cosh = cosh;
        function tan(n) { return Math.tan(n); }
        Math_.tan = tan;
        function tanh(n) { return Math.tanh(n); }
        Math_.tanh = tanh;
        function asin(n) { return Math.asin(n); }
        Math_.asin = asin;
        function asinh(n) { return Math.asinh(n); }
        Math_.asinh = asinh;
        function acos(n) { return Math.acos(n); }
        Math_.acos = acos;
        function acosh(n) { return Math.acosh(n); }
        Math_.acosh = acosh;
        function atan(n) { return Math.atan(n); }
        Math_.atan = atan;
        function atanh(x) { return Math.atanh(x); }
        Math_.atanh = atanh;
        function atan2(y, x) { return Math.atan2(y, x); }
        Math_.atan2 = atan2;
        function trunc(x) { return x > 0 ? Math.floor(x) : Math.ceil(x); }
        Math_.trunc = trunc;
        function random() { return Math.random(); }
        Math_.random = random;
        function randomRange(min, max) {
            if (min == max)
                return min;
            if (min > max) {
                let t = min;
                min = max;
                max = t;
            }
            if (Math.floor(min) == min && Math.floor(max) == max)
                return min + Math.floor(Math.random() * (max - min + 1));
            else
                return min + Math.random() * (max - min);
        }
        Math_.randomRange = randomRange;
    })(Math_ = pxsim.Math_ || (pxsim.Math_ = {}));
    let Number_;
    (function (Number_) {
        function lt(x, y) { return x < y; }
        Number_.lt = lt;
        function le(x, y) { return x <= y; }
        Number_.le = le;
        function neq(x, y) { return !eq(x, y); }
        Number_.neq = neq;
        function eq(x, y) { return pxsim.pxtrt.nullFix(x) == pxsim.pxtrt.nullFix(y); }
        Number_.eq = eq;
        function eqDecr(x, y) {
            if (pxsim.pxtrt.nullFix(x) == pxsim.pxtrt.nullFix(y)) {
                return true;
            }
            else {
                return false;
            }
        }
        Number_.eqDecr = eqDecr;
        function gt(x, y) { return x > y; }
        Number_.gt = gt;
        function ge(x, y) { return x >= y; }
        Number_.ge = ge;
        function div(x, y) { return Math.floor(x / y) | 0; }
        Number_.div = div;
        function mod(x, y) { return x % y; }
        Number_.mod = mod;
        function bnot(x) { return ~x; }
        Number_.bnot = bnot;
        function toString(x) { return (x + ""); }
        Number_.toString = toString;
    })(Number_ = pxsim.Number_ || (pxsim.Number_ = {}));
    let thumb;
    (function (thumb) {
        function adds(x, y) { return (x + y) | 0; }
        thumb.adds = adds;
        function subs(x, y) { return (x - y) | 0; }
        thumb.subs = subs;
        function divs(x, y) { return Math.floor(x / y) | 0; }
        thumb.divs = divs;
        function muls(x, y) { return Math_.imul(x, y); }
        thumb.muls = muls;
        function ands(x, y) { return x & y; }
        thumb.ands = ands;
        function orrs(x, y) { return x | y; }
        thumb.orrs = orrs;
        function eors(x, y) { return x ^ y; }
        thumb.eors = eors;
        function lsls(x, y) { return x << y; }
        thumb.lsls = lsls;
        function lsrs(x, y) { return x >>> y; }
        thumb.lsrs = lsrs;
        function asrs(x, y) { return x >> y; }
        thumb.asrs = asrs;
        function bnot(x) { return ~x; }
        thumb.bnot = bnot;
        function ignore(v) { return v; }
        thumb.ignore = ignore;
    })(thumb = pxsim.thumb || (pxsim.thumb = {}));
    let avr;
    (function (avr) {
        function toInt(v) {
            return (v << 16) >> 16;
        }
        function adds(x, y) { return toInt(x + y); }
        avr.adds = adds;
        function subs(x, y) { return toInt(x - y); }
        avr.subs = subs;
        function divs(x, y) { return toInt(Math.floor(x / y)); }
        avr.divs = divs;
        function muls(x, y) { return toInt(Math_.imul(x, y)); }
        avr.muls = muls;
        function ands(x, y) { return toInt(x & y); }
        avr.ands = ands;
        function orrs(x, y) { return toInt(x | y); }
        avr.orrs = orrs;
        function eors(x, y) { return toInt(x ^ y); }
        avr.eors = eors;
        function lsls(x, y) { return toInt(x << y); }
        avr.lsls = lsls;
        function lsrs(x, y) { return (x & 0xffff) >>> y; }
        avr.lsrs = lsrs;
        function asrs(x, y) { return toInt(x >> y); }
        avr.asrs = asrs;
        function bnot(x) { return ~x; }
        avr.bnot = bnot;
        function ignore(v) { return v; }
        avr.ignore = ignore;
    })(avr = pxsim.avr || (pxsim.avr = {}));
    let String_;
    (function (String_) {
        function stringConv(v) {
            const cb = pxsim.getResume();
            if (v instanceof pxsim.RefRecord) {
                if (v.vtable.toStringMethod) {
                    pxsim.runtime.runFiberAsync(v.vtable.toStringMethod, v)
                        .then(() => {
                        cb(pxsim.runtime.currFrame.retval + "");
                    });
                    return;
                }
            }
            cb(v + "");
        }
        String_.stringConv = stringConv;
        function mkEmpty() {
            return "";
        }
        String_.mkEmpty = mkEmpty;
        function fromCharCode(code) {
            return (String.fromCharCode(code));
        }
        String_.fromCharCode = fromCharCode;
        function toNumber(s) {
            typeCheck(s);
            return parseFloat(s);
        }
        String_.toNumber = toNumber;
        // TODO check edge-conditions
        function concat(a, b) {
            typeCheck(a);
            return (a + b);
        }
        String_.concat = concat;
        function substring(s, i, j) {
            typeCheck(s);
            return (s.slice(i, i + j));
        }
        String_.substring = substring;
        function equals(s1, s2) {
            typeCheck(s1);
            return s1 == s2;
        }
        String_.equals = equals;
        function compare(s1, s2) {
            typeCheck(s1);
            if (s1 == s2)
                return 0;
            if (s1 < s2)
                return -1;
            return 1;
        }
        String_.compare = compare;
        function compareDecr(s1, s2) {
            typeCheck(s1);
            if (s1 == s2) {
                return 0;
            }
            if (s1 < s2)
                return -1;
            return 1;
        }
        String_.compareDecr = compareDecr;
        function length(s) {
            typeCheck(s);
            return s.length;
        }
        String_.length = length;
        function substr(s, start, length) {
            typeCheck(s);
            return (s.substr(start, length));
        }
        String_.substr = substr;
        function inRange(s, i) {
            typeCheck(s);
            return 0 <= i && i < s.length;
        }
        function charAt(s, i) {
            typeCheck(s);
            return (s.charAt(i));
        }
        String_.charAt = charAt;
        function charCodeAt(s, i) {
            typeCheck(s);
            return inRange(s, i) ? s.charCodeAt(i) : 0;
        }
        String_.charCodeAt = charCodeAt;
        function indexOf(s, searchValue, start) {
            typeCheck(s);
            if (searchValue == null)
                return -1;
            return s.indexOf(searchValue, start);
        }
        String_.indexOf = indexOf;
        function lastIndexOf(s, searchValue, start) {
            typeCheck(s);
            if (searchValue == null)
                return -1;
            return s.lastIndexOf(searchValue, start);
        }
        String_.lastIndexOf = lastIndexOf;
        function includes(s, searchValue, start) {
            typeCheck(s);
            if (searchValue == null)
                return false;
            return s.includes(searchValue, start);
        }
        String_.includes = includes;
        function typeCheck(s) {
            if (typeof s !== "string") {
                pxsim.throwFailedCastError(s, "string");
            }
        }
        String_.typeCheck = typeCheck;
    })(String_ = pxsim.String_ || (pxsim.String_ = {}));
    let Boolean_;
    (function (Boolean_) {
        function toString(v) {
            return v ? "true" : "false";
        }
        Boolean_.toString = toString;
        function bang(v) {
            return !v;
        }
        Boolean_.bang = bang;
    })(Boolean_ = pxsim.Boolean_ || (pxsim.Boolean_ = {}));
    class RefBuffer extends pxsim.RefObject {
        constructor(data) {
            super();
            this.data = data;
            this.isStatic = false;
        }
        scan(mark) {
            // nothing to do
        }
        gcKey() { return "Buffer"; }
        gcSize() { return 2 + (this.data.length + 3 >> 2); }
        gcIsStatic() { return this.isStatic; }
        print() {
            // pxsim.log(`RefBuffer id:${this.id} refs:${this.refcnt} len:${this.data.length} d0:${this.data[0]}`)
        }
        toDebugString() {
            return BufferMethods.toHex(this);
        }
    }
    pxsim.RefBuffer = RefBuffer;
    let BufferMethods;
    (function (BufferMethods) {
        // keep in sync with C++!
        let NumberFormat;
        (function (NumberFormat) {
            NumberFormat[NumberFormat["Int8LE"] = 1] = "Int8LE";
            NumberFormat[NumberFormat["UInt8LE"] = 2] = "UInt8LE";
            NumberFormat[NumberFormat["Int16LE"] = 3] = "Int16LE";
            NumberFormat[NumberFormat["UInt16LE"] = 4] = "UInt16LE";
            NumberFormat[NumberFormat["Int32LE"] = 5] = "Int32LE";
            NumberFormat[NumberFormat["Int8BE"] = 6] = "Int8BE";
            NumberFormat[NumberFormat["UInt8BE"] = 7] = "UInt8BE";
            NumberFormat[NumberFormat["Int16BE"] = 8] = "Int16BE";
            NumberFormat[NumberFormat["UInt16BE"] = 9] = "UInt16BE";
            NumberFormat[NumberFormat["Int32BE"] = 10] = "Int32BE";
            NumberFormat[NumberFormat["UInt32LE"] = 11] = "UInt32LE";
            NumberFormat[NumberFormat["UInt32BE"] = 12] = "UInt32BE";
            NumberFormat[NumberFormat["Float32LE"] = 13] = "Float32LE";
            NumberFormat[NumberFormat["Float64LE"] = 14] = "Float64LE";
            NumberFormat[NumberFormat["Float32BE"] = 15] = "Float32BE";
            NumberFormat[NumberFormat["Float64BE"] = 16] = "Float64BE";
        })(NumberFormat = BufferMethods.NumberFormat || (BufferMethods.NumberFormat = {}));
        ;
        function fmtInfoCore(fmt) {
            switch (fmt) {
                case NumberFormat.Int8LE: return -1;
                case NumberFormat.UInt8LE: return 1;
                case NumberFormat.Int16LE: return -2;
                case NumberFormat.UInt16LE: return 2;
                case NumberFormat.Int32LE: return -4;
                case NumberFormat.UInt32LE: return 4;
                case NumberFormat.Int8BE: return -10;
                case NumberFormat.UInt8BE: return 10;
                case NumberFormat.Int16BE: return -20;
                case NumberFormat.UInt16BE: return 20;
                case NumberFormat.Int32BE: return -40;
                case NumberFormat.UInt32BE: return 40;
                case NumberFormat.Float32LE: return 4;
                case NumberFormat.Float32BE: return 40;
                case NumberFormat.Float64LE: return 8;
                case NumberFormat.Float64BE: return 80;
                default: throw pxsim.U.userError("bad format");
            }
        }
        function fmtInfo(fmt) {
            let size = fmtInfoCore(fmt);
            let signed = false;
            if (size < 0) {
                signed = true;
                size = -size;
            }
            let swap = false;
            if (size >= 10) {
                swap = true;
                size /= 10;
            }
            let isFloat = fmt >= NumberFormat.Float32LE;
            return { size, signed, swap, isFloat };
        }
        BufferMethods.fmtInfo = fmtInfo;
        function getNumber(buf, fmt, offset) {
            typeCheck(buf);
            let inf = fmtInfo(fmt);
            if (inf.isFloat) {
                let subarray = buf.data.buffer.slice(offset, offset + inf.size);
                if (inf.swap) {
                    let u8 = new Uint8Array(subarray);
                    u8.reverse();
                }
                if (inf.size == 4)
                    return new Float32Array(subarray)[0];
                else
                    return new Float64Array(subarray)[0];
            }
            let r = 0;
            for (let i = 0; i < inf.size; ++i) {
                r <<= 8;
                let off = inf.swap ? offset + i : offset + inf.size - i - 1;
                r |= buf.data[off];
            }
            if (inf.signed) {
                let missingBits = 32 - (inf.size * 8);
                r = (r << missingBits) >> missingBits;
            }
            else {
                r = r >>> 0;
            }
            return r;
        }
        BufferMethods.getNumber = getNumber;
        function setNumber(buf, fmt, offset, r) {
            typeCheck(buf);
            let inf = fmtInfo(fmt);
            if (inf.isFloat) {
                let arr = new Uint8Array(inf.size);
                if (inf.size == 4)
                    new Float32Array(arr.buffer)[0] = r;
                else
                    new Float64Array(arr.buffer)[0] = r;
                if (inf.swap)
                    arr.reverse();
                for (let i = 0; i < inf.size; ++i) {
                    buf.data[offset + i] = arr[i];
                }
                return;
            }
            for (let i = 0; i < inf.size; ++i) {
                let off = !inf.swap ? offset + i : offset + inf.size - i - 1;
                buf.data[off] = (r & 0xff);
                r >>= 8;
            }
        }
        BufferMethods.setNumber = setNumber;
        function createBuffer(size) {
            return new RefBuffer(new Uint8Array(size));
        }
        BufferMethods.createBuffer = createBuffer;
        function createBufferFromHex(hex) {
            String_.typeCheck(hex);
            let r = createBuffer(hex.length >> 1);
            for (let i = 0; i < hex.length; i += 2)
                r.data[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
            r.isStatic = true;
            return r;
        }
        BufferMethods.createBufferFromHex = createBufferFromHex;
        function isReadOnly(buf) {
            typeCheck(buf);
            return buf.isStatic;
        }
        BufferMethods.isReadOnly = isReadOnly;
        function getBytes(buf) {
            typeCheck(buf);
            // not sure if this is any useful...
            return buf.data;
        }
        BufferMethods.getBytes = getBytes;
        function inRange(buf, off) {
            return 0 <= off && off < buf.data.length;
        }
        function getUint8(buf, off) {
            typeCheck(buf);
            return getByte(buf, off);
        }
        BufferMethods.getUint8 = getUint8;
        function getByte(buf, off) {
            typeCheck(buf);
            if (inRange(buf, off))
                return buf.data[off];
            else
                return 0;
        }
        BufferMethods.getByte = getByte;
        function setUint8(buf, off, v) {
            typeCheck(buf);
            setByte(buf, off, v);
        }
        BufferMethods.setUint8 = setUint8;
        function checkWrite(buf) {
            if (buf.isStatic)
                pxsim.U.userError("Writing to read only buffer.");
        }
        function setByte(buf, off, v) {
            typeCheck(buf);
            if (inRange(buf, off)) {
                checkWrite(buf);
                buf.data[off] = v;
            }
        }
        BufferMethods.setByte = setByte;
        function length(buf) {
            typeCheck(buf);
            return buf.data.length;
        }
        BufferMethods.length = length;
        function fill(buf, value, offset = 0, length = -1) {
            typeCheck(buf);
            if (offset < 0 || offset > buf.data.length)
                return;
            if (length < 0)
                length = buf.data.length;
            length = Math.min(length, buf.data.length - offset);
            checkWrite(buf);
            buf.data.fill(value, offset, offset + length);
        }
        BufferMethods.fill = fill;
        function slice(buf, offset, length) {
            typeCheck(buf);
            offset = Math.min(buf.data.length, offset);
            if (length < 0)
                length = buf.data.length;
            length = Math.min(length, buf.data.length - offset);
            return new RefBuffer(buf.data.slice(offset, offset + length));
        }
        BufferMethods.slice = slice;
        function toHex(buf) {
            typeCheck(buf);
            const hex = "0123456789abcdef";
            let res = "";
            for (let i = 0; i < buf.data.length; ++i) {
                res += hex[buf.data[i] >> 4];
                res += hex[buf.data[i] & 0xf];
            }
            return res;
        }
        BufferMethods.toHex = toHex;
        function toString(buf) {
            typeCheck(buf);
            return pxsim.U.fromUTF8Array(buf.data);
        }
        BufferMethods.toString = toString;
        function memmove(dst, dstOff, src, srcOff, len) {
            if (src.buffer === dst.buffer) {
                memmove(dst, dstOff, src.slice(srcOff, srcOff + len), 0, len);
            }
            else {
                for (let i = 0; i < len; ++i)
                    dst[dstOff + i] = src[srcOff + i];
            }
        }
        const INT_MIN = -0x80000000;
        function shift(buf, offset, start, len) {
            typeCheck(buf);
            if (len < 0)
                len = buf.data.length - start;
            if (start < 0 || start + len > buf.data.length || start + len < start
                || len == 0 || offset == 0 || offset == INT_MIN)
                return;
            if (len == 0 || offset == 0 || offset == INT_MIN)
                return;
            if (offset <= -len || offset >= len) {
                fill(buf, 0);
                return;
            }
            checkWrite(buf);
            if (offset < 0) {
                offset = -offset;
                memmove(buf.data, start + offset, buf.data, start, len - offset);
                buf.data.fill(0, start, start + offset);
            }
            else {
                len = len - offset;
                memmove(buf.data, start, buf.data, start + offset, len);
                buf.data.fill(0, start + len, start + len + offset);
            }
        }
        BufferMethods.shift = shift;
        function rotate(buf, offset, start, len) {
            typeCheck(buf);
            if (len < 0)
                len = buf.data.length - start;
            if (start < 0 || start + len > buf.data.length || start + len < start
                || len == 0 || offset == 0 || offset == INT_MIN)
                return;
            checkWrite(buf);
            if (offset < 0)
                offset += len << 8; // try to make it positive
            offset %= len;
            if (offset < 0)
                offset += len;
            let data = buf.data;
            let n_first = offset;
            let first = 0;
            let next = n_first;
            let last = len;
            while (first != next) {
                let tmp = data[first + start];
                data[first++ + start] = data[next + start];
                data[next++ + start] = tmp;
                if (next == last) {
                    next = n_first;
                }
                else if (first == n_first) {
                    n_first = next;
                }
            }
        }
        BufferMethods.rotate = rotate;
        function write(buf, dstOffset, src, srcOffset = 0, length = -1) {
            typeCheck(buf);
            typeCheck(src);
            if (length < 0)
                length = src.data.length;
            if (srcOffset < 0 || dstOffset < 0 || dstOffset > buf.data.length)
                return;
            length = Math.min(src.data.length - srcOffset, buf.data.length - dstOffset);
            if (length < 0)
                return;
            checkWrite(buf);
            memmove(buf.data, dstOffset, src.data, srcOffset, length);
        }
        BufferMethods.write = write;
        function typeCheck(buf) {
            if (!(buf instanceof RefBuffer)) {
                pxsim.throwFailedCastError(buf, "Buffer");
            }
        }
        BufferMethods.typeCheck = typeCheck;
    })(BufferMethods = pxsim.BufferMethods || (pxsim.BufferMethods = {}));
})(pxsim || (pxsim = {}));
(function (pxsim) {
    var control;
    (function (control) {
        function createBufferFromUTF8(str) {
            pxsim.String_.typeCheck(str);
            return new pxsim.RefBuffer(pxsim.U.toUTF8Array(str));
        }
        control.createBufferFromUTF8 = createBufferFromUTF8;
    })(control = pxsim.control || (pxsim.control = {}));
})(pxsim || (pxsim = {}));
// Localization functions. Please port any modifications over to pxtlib/commonutil.ts
var pxsim;
(function (pxsim) {
    var localization;
    (function (localization) {
        let _localizeStrings = {};
        function setLocalizedStrings(strs) {
            _localizeStrings = strs || {};
        }
        localization.setLocalizedStrings = setLocalizedStrings;
        let sForPlural = true;
        function lf(s, ...args) {
            let lfmt = _localizeStrings[s] || s;
            if (!sForPlural && lfmt != s && /\d:s\}/.test(lfmt)) {
                lfmt = lfmt.replace(/\{\d+:s\}/g, "");
            }
            lfmt = lfmt.replace(/^\{(id|loc):[^\}]+\}/g, '');
            return fmt_va(lfmt, args);
        }
        localization.lf = lf;
        // from pxtlib/commonutil.ts
        function fmt_va(f, args) {
            if (args.length == 0)
                return f;
            return f.replace(/\{([0-9]+)(\:[^\}]+)?\}/g, function (s, n, spec) {
                let v = args[parseInt(n)];
                let r = "";
                let fmtMatch = /^:f(\d*)\.(\d+)/.exec(spec);
                if (fmtMatch) {
                    let precision = parseInt(fmtMatch[2]);
                    let len = parseInt(fmtMatch[1]) || 0;
                    let fillChar = /^0/.test(fmtMatch[1]) ? "0" : " ";
                    let num = v.toFixed(precision);
                    if (len > 0 && precision > 0)
                        len += precision + 1;
                    if (len > 0) {
                        while (num.length < len) {
                            num = fillChar + num;
                        }
                    }
                    r = num;
                }
                else if (spec == ":x") {
                    r = "0x" + v.toString(16);
                }
                else if (v === undefined)
                    r = "(undef)";
                else if (v === null)
                    r = "(null)";
                else if (v.toString)
                    r = v.toString();
                else
                    r = v + "";
                if (spec == ":a") {
                    if (/^\s*[euioah]/.test(r.toLowerCase()))
                        r = "an " + r;
                    else if (/^\s*[bcdfgjklmnpqrstvwxz]/.test(r.toLowerCase()))
                        r = "a " + r;
                }
                else if (spec == ":s") {
                    if (v == 1)
                        r = "";
                    else
                        r = "s";
                }
                else if (spec == ":q") {
                    r = htmlEscape(r);
                }
                else if (spec == ":jq") {
                    r = jsStringQuote(r);
                }
                else if (spec == ":uri") {
                    r = encodeURIComponent(r).replace(/'/g, "%27").replace(/"/g, "%22");
                }
                else if (spec == ":url") {
                    r = encodeURI(r).replace(/'/g, "%27").replace(/"/g, "%22");
                }
                else if (spec == ":%") {
                    r = (v * 100).toFixed(1).toString() + '%';
                }
                return r;
            });
        }
        localization.fmt_va = fmt_va;
        // from pxtlib/commonutil.ts
        function htmlEscape(_input) {
            if (!_input)
                return _input; // null, undefined, empty string test
            return _input.replace(/([^\w .!?\-$])/g, c => "&#" + c.charCodeAt(0) + ";");
        }
        localization.htmlEscape = htmlEscape;
        // from pxtlib/commonutil.ts
        function jsStringQuote(s) {
            return s.replace(/[^\w .!?\-$]/g, (c) => {
                let h = c.charCodeAt(0).toString(16);
                return "\\u" + "0000".substr(0, 4 - h.length) + h;
            });
        }
        localization.jsStringQuote = jsStringQuote;
    })(localization = pxsim.localization || (pxsim.localization = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    let LogLevel;
    (function (LogLevel) {
        LogLevel[LogLevel["Debug"] = 0] = "Debug";
        LogLevel[LogLevel["Info"] = 1] = "Info";
        LogLevel[LogLevel["Log"] = 1] = "Log";
        LogLevel[LogLevel["Warning"] = 2] = "Warning";
        LogLevel[LogLevel["Error"] = 3] = "Error";
    })(LogLevel = pxsim.LogLevel || (pxsim.LogLevel = {}));
    class ConsoleLogger {
        constructor() {
            this.setLogLevel(LogLevel.Info);
        }
        setLogLevel(level) {
            this.logLevel = level;
        }
        getLogLevel() {
            return this.logLevel;
        }
        info(...args) {
            if (!this.shouldLog(LogLevel.Info))
                return;
            if (console === null || console === void 0 ? void 0 : console.info) {
                console.info.call(null, ...args);
            }
        }
        log(...args) {
            if (!this.shouldLog(LogLevel.Log))
                return;
            if (console === null || console === void 0 ? void 0 : console.log) {
                console.log.call(null, ...args);
            }
        }
        debug(...args) {
            if (!this.shouldLog(LogLevel.Debug))
                return;
            if (console === null || console === void 0 ? void 0 : console.debug) {
                console.debug.call(null, ...args);
            }
        }
        error(...args) {
            if (!this.shouldLog(LogLevel.Error))
                return;
            if (console === null || console === void 0 ? void 0 : console.error) {
                console.error.call(null, ...args);
            }
        }
        warn(...args) {
            if (!this.shouldLog(LogLevel.Warning))
                return;
            if (console === null || console === void 0 ? void 0 : console.warn) {
                console.warn.call(null, ...args);
            }
        }
        shouldLog(level) {
            return level >= this.logLevel;
        }
    }
    pxsim.ConsoleLogger = ConsoleLogger;
    let logger = new pxsim.ConsoleLogger();
    function info(...args) {
        logger.info(...args);
    }
    pxsim.info = info;
    function log(...args) {
        logger.log(...args);
    }
    pxsim.log = log;
    function debug(...args) {
        logger.debug(...args);
    }
    pxsim.debug = debug;
    function error(...args) {
        logger.error(...args);
    }
    pxsim.error = error;
    function warn(...args) {
        logger.warn(...args);
    }
    pxsim.warn = warn;
    function setLogger(impl) {
        const level = logger === null || logger === void 0 ? void 0 : logger.getLogLevel();
        logger = impl;
        if (level !== undefined) {
            logger.setLogLevel(level);
        }
    }
    pxsim.setLogger = setLogger;
    function setLogLevel(level) {
        logger.setLogLevel(level);
    }
    pxsim.setLogLevel = setLogLevel;
})(pxsim || (pxsim = {}));
/// <reference path="../localtypings/pxtparts.d.ts"/>
var pxsim;
(function (pxsim) {
    const MIN_MESSAGE_WAIT_MS = 200;
    let tracePauseMs = 0;
    let MessageListenerFlags;
    (function (MessageListenerFlags) {
        MessageListenerFlags[MessageListenerFlags["MESSAGE_BUS_LISTENER_REENTRANT"] = 8] = "MESSAGE_BUS_LISTENER_REENTRANT";
        MessageListenerFlags[MessageListenerFlags["MESSAGE_BUS_LISTENER_QUEUE_IF_BUSY"] = 16] = "MESSAGE_BUS_LISTENER_QUEUE_IF_BUSY";
        MessageListenerFlags[MessageListenerFlags["MESSAGE_BUS_LISTENER_DROP_IF_BUSY"] = 32] = "MESSAGE_BUS_LISTENER_DROP_IF_BUSY";
        MessageListenerFlags[MessageListenerFlags["MESSAGE_BUS_LISTENER_IMMEDIATE"] = 192] = "MESSAGE_BUS_LISTENER_IMMEDIATE";
    })(MessageListenerFlags || (MessageListenerFlags = {}));
    let U;
    (function (U) {
        // Keep these helpers unified with pxtlib/browserutils.ts
        function containsClass(el, classes) {
            return splitClasses(classes).every(cls => containsSingleClass(el, cls));
            function containsSingleClass(el, cls) {
                if (el.classList) {
                    return el.classList.contains(cls);
                }
                else {
                    const classes = (el.className + "").split(/\s+/);
                    return !(classes.indexOf(cls) < 0);
                }
            }
        }
        U.containsClass = containsClass;
        function addClass(el, classes) {
            splitClasses(classes).forEach(cls => addSingleClass(el, cls));
            function addSingleClass(el, cls) {
                if (el.classList) {
                    el.classList.add(cls);
                }
                else {
                    const classes = (el.className + "").split(/\s+/);
                    if (classes.indexOf(cls) < 0) {
                        el.className.baseVal += " " + cls;
                    }
                }
            }
        }
        U.addClass = addClass;
        function removeClass(el, classes) {
            splitClasses(classes).forEach(cls => removeSingleClass(el, cls));
            function removeSingleClass(el, cls) {
                if (el.classList) {
                    el.classList.remove(cls);
                }
                else {
                    el.className.baseVal = (el.className + "")
                        .split(/\s+/)
                        .filter(c => c != cls)
                        .join(" ");
                }
            }
        }
        U.removeClass = removeClass;
        function splitClasses(classes) {
            return classes.split(/\s+/).filter(s => !!s);
        }
        function remove(element) {
            element.parentElement.removeChild(element);
        }
        U.remove = remove;
        function removeChildren(element) {
            while (element.firstChild)
                element.removeChild(element.firstChild);
        }
        U.removeChildren = removeChildren;
        function clear(element) {
            removeChildren(element);
        }
        U.clear = clear;
        function assert(cond, msg = "Assertion failed") {
            if (!cond) {
                debugger;
                throw new Error(msg);
            }
        }
        U.assert = assert;
        function repeatMap(n, fn) {
            n = n || 0;
            let r = [];
            for (let i = 0; i < n; ++i)
                r.push(fn(i));
            return r;
        }
        U.repeatMap = repeatMap;
        function userError(msg) {
            let e = new Error(msg);
            e.isUserError = true;
            throw e;
        }
        U.userError = userError;
        function now() {
            return Date.now();
        }
        U.now = now;
        let perf;
        // current time in microseconds
        function perfNowUs() {
            if (!perf)
                perf = typeof performance != "undefined" ?
                    performance.now.bind(performance) ||
                        performance.moznow.bind(performance) ||
                        performance.msNow.bind(performance) ||
                        performance.webkitNow.bind(performance) ||
                        performance.oNow.bind(performance) :
                    Date.now;
            return perf() * 1000;
        }
        U.perfNowUs = perfNowUs;
        const _nextTickResolvedPromise = Promise.resolve();
        function nextTick(f) {
            // .then should run as a microtask / at end of loop
            _nextTickResolvedPromise.then(f);
        }
        U.nextTick = nextTick;
        async function delay(duration, value) {
            // eslint-disable-next-line
            const output = await value;
            await new Promise(resolve => setTimeout(() => resolve(), duration));
            return output;
        }
        U.delay = delay;
        // Returns a function, that, as long as it continues to be invoked, will only
        // trigger every N milliseconds. If `immediate` is passed, trigger the
        // function on the leading edge, instead of the trailing.
        function throttle(func, wait, immediate) {
            let timeout;
            return function () {
                let context = this;
                let args = arguments;
                let later = function () {
                    timeout = null;
                    if (!immediate)
                        func.apply(context, args);
                };
                let callNow = immediate && !timeout;
                if (!timeout)
                    timeout = setTimeout(later, wait);
                if (callNow)
                    func.apply(context, args);
            };
        }
        U.throttle = throttle;
        function promiseMapAll(values, mapper) {
            return Promise.all(values.map(v => mapper(v)));
        }
        U.promiseMapAll = promiseMapAll;
        function promiseMapAllSeries(values, mapper) {
            return promisePoolAsync(1, values, mapper);
        }
        U.promiseMapAllSeries = promiseMapAllSeries;
        async function promisePoolAsync(maxConcurrent, inputValues, handler) {
            let curr = 0;
            const promises = [];
            const output = [];
            for (let i = 0; i < maxConcurrent; i++) {
                const thread = (async () => {
                    while (curr < inputValues.length) {
                        const id = curr++;
                        const input = inputValues[id];
                        output[id] = await handler(input);
                    }
                })();
                promises.push(thread);
            }
            try {
                await Promise.all(promises);
            }
            catch (e) {
                // do not spawn any more promises after pool failed.
                curr = inputValues.length;
                throw e;
            }
            return output;
        }
        U.promisePoolAsync = promisePoolAsync;
        async function promiseTimeout(ms, promise, msg) {
            let timeoutId;
            let res;
            const timeoutPromise = new Promise((resolve, reject) => {
                res = resolve;
                timeoutId = setTimeout(() => {
                    res = undefined;
                    clearTimeout(timeoutId);
                    reject(msg || `Promise timed out after ${ms}ms`);
                }, ms);
            });
            return Promise.race([promise, timeoutPromise])
                .then(output => {
                // clear any dangling timeout
                if (res) {
                    clearTimeout(timeoutId);
                    res();
                }
                return output;
            });
        }
        U.promiseTimeout = promiseTimeout;
        // this will take lower 8 bits from each character
        function stringToUint8Array(input) {
            let len = input.length;
            let res = new Uint8Array(len);
            for (let i = 0; i < len; ++i)
                res[i] = input.charCodeAt(i) & 0xff;
            return res;
        }
        U.stringToUint8Array = stringToUint8Array;
        function uint8ArrayToString(input) {
            let len = input.length;
            let res = "";
            for (let i = 0; i < len; ++i)
                res += String.fromCharCode(input[i]);
            return res;
        }
        U.uint8ArrayToString = uint8ArrayToString;
        function fromUTF8(binstr) {
            if (!binstr)
                return "";
            // escape function is deprecated
            let escaped = "";
            for (let i = 0; i < binstr.length; ++i) {
                let k = binstr.charCodeAt(i) & 0xff;
                if (k == 37 || k > 0x7f) {
                    escaped += "%" + k.toString(16);
                }
                else {
                    escaped += binstr.charAt(i);
                }
            }
            // decodeURIComponent does the actual UTF8 decoding
            return decodeURIComponent(escaped);
        }
        U.fromUTF8 = fromUTF8;
        function toUTF8(str, cesu8) {
            let res = "";
            if (!str)
                return res;
            for (let i = 0; i < str.length; ++i) {
                let code = str.charCodeAt(i);
                if (code <= 0x7f)
                    res += str.charAt(i);
                else if (code <= 0x7ff) {
                    res += String.fromCharCode(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
                }
                else {
                    if (!cesu8 && 0xd800 <= code && code <= 0xdbff) {
                        let next = str.charCodeAt(++i);
                        if (!isNaN(next))
                            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                    }
                    if (code <= 0xffff)
                        res += String.fromCharCode(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                    else
                        res += String.fromCharCode(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                }
            }
            return res;
        }
        U.toUTF8 = toUTF8;
        function toUTF8Array(s) {
            return (new TextEncoder()).encode(s);
        }
        U.toUTF8Array = toUTF8Array;
        function fromUTF8Array(s) {
            return (new TextDecoder()).decode(s);
        }
        U.fromUTF8Array = fromUTF8Array;
        function isPxtElectron() {
            return typeof window != "undefined" && !!window.pxtElectron;
        }
        U.isPxtElectron = isPxtElectron;
        function isIpcRenderer() {
            return typeof window != "undefined" && !!window.ipcRenderer;
        }
        U.isIpcRenderer = isIpcRenderer;
        function isElectron() {
            return isPxtElectron() || isIpcRenderer();
        }
        U.isElectron = isElectron;
        function testLocalhost(url) {
            return /^http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9.-]+\.local):\d+\/?/.test(url) && !/nolocalhost=1/.test(url);
        }
        U.testLocalhost = testLocalhost;
        function isLocalHost() {
            try {
                return typeof window !== "undefined" && testLocalhost(window.location.href);
            }
            catch (e) {
                return false;
            }
        }
        U.isLocalHost = isLocalHost;
        function isLocalHostDev() {
            return isLocalHost() && !isElectron();
        }
        U.isLocalHostDev = isLocalHostDev;
        function unique(arr, f) {
            let v = [];
            let r = {};
            arr.forEach(e => {
                let k = f(e);
                if (!r.hasOwnProperty(k)) {
                    r[k] = null;
                    v.push(e);
                }
            });
            return v;
        }
        U.unique = unique;
        function sanitizeCssName(name) {
            let sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '_');
            if (!/^[a-zA-Z_]/.test(sanitized)) {
                sanitized = 'cls_' + sanitized;
            }
            return sanitized;
        }
        U.sanitizeCssName = sanitizeCssName;
    })(U = pxsim.U || (pxsim.U = {}));
    class BreakLoopException {
    }
    pxsim.BreakLoopException = BreakLoopException;
    let pxtcore;
    (function (pxtcore) {
        function beginTry(lbl) {
            pxsim.runtime.currFrame.tryFrame = {
                parent: pxsim.runtime.currTryFrame(),
                handlerPC: lbl,
                handlerFrame: pxsim.runtime.currFrame
            };
        }
        pxtcore.beginTry = beginTry;
        function endTry() {
            const s = pxsim.runtime.currFrame;
            s.tryFrame = s.tryFrame.parent;
        }
        pxtcore.endTry = endTry;
        function throwValue(v) {
            let tf = pxsim.runtime.currTryFrame();
            if (!tf)
                U.userError("unhandled exception: " + v);
            const s = tf.handlerFrame;
            pxsim.runtime.currFrame = s;
            s.pc = tf.handlerPC;
            s.tryFrame = tf.parent;
            s.thrownValue = v;
            s.hasThrownValue = true;
            throw new BreakLoopException();
        }
        pxtcore.throwValue = throwValue;
        function getThrownValue() {
            const s = pxsim.runtime.currFrame;
            U.assert(s.hasThrownValue);
            s.hasThrownValue = false;
            return s.thrownValue;
        }
        pxtcore.getThrownValue = getThrownValue;
        function endFinally() {
            const s = pxsim.runtime.currFrame;
            if (s.hasThrownValue) {
                s.hasThrownValue = false;
                throwValue(s.thrownValue);
            }
        }
        pxtcore.endFinally = endFinally;
    })(pxtcore = pxsim.pxtcore || (pxsim.pxtcore = {}));
    function getResume() { return pxsim.runtime.getResume(); }
    pxsim.getResume = getResume;
    const SERIAL_BUFFER_LENGTH = 16;
    class BaseBoard {
        constructor() {
            this.messageListeners = [];
            this.serialOutBuffer = '';
            this.messages = [];
            this.lastSerialTime = 0;
            this.debouncedPostAll = () => {
                const nowtime = Date.now();
                if (nowtime - this.lastSerialTime > MIN_MESSAGE_WAIT_MS) {
                    clearTimeout(this.serialTimeout);
                    if (this.messages.length) {
                        Runtime.postMessage({
                            type: 'bulkserial',
                            data: this.messages,
                            id: pxsim.runtime.id,
                            sim: true
                        });
                        this.messages = [];
                        this.lastSerialTime = nowtime;
                    }
                }
                else {
                    this.serialTimeout = setTimeout(this.debouncedPostAll, 50);
                }
            };
            // use a stable board id
            this.id = pxsim.Embed.frameid || ("b" + Math.round(Math.random() * 2147483647));
            this.bus = new pxsim.EventBus(pxsim.runtime, this);
        }
        updateView() { }
        receiveMessage(msg) {
            if (!pxsim.runtime || pxsim.runtime.dead)
                return;
            this.dispatchMessage(msg);
        }
        dispatchMessage(msg) {
            for (const listener of this.messageListeners)
                listener(msg);
        }
        addMessageListener(listener) {
            this.messageListeners.push(listener);
        }
        get storedState() {
            if (!this.runOptions)
                return {};
            if (!this.runOptions.storedState)
                this.runOptions.storedState = {};
            return this.runOptions.storedState;
        }
        initAsync(msg) {
            this.runOptions = msg;
            return Promise.resolve();
        }
        setStoredState(k, value) {
            if (value == null)
                delete this.storedState[k];
            else
                this.storedState[k] = value;
            Runtime.postMessage({
                type: "simulator",
                command: "setstate",
                stateKey: k,
                stateValue: value
            });
        }
        onDebuggerResume() { }
        screenshotAsync(width) {
            return Promise.resolve(undefined);
        }
        kill() { }
        writeSerial(s) {
            this.serialOutBuffer += s;
            if (/\n/.test(this.serialOutBuffer) || this.serialOutBuffer.length > SERIAL_BUFFER_LENGTH) {
                this.messages.push({
                    time: Date.now(),
                    data: this.serialOutBuffer
                });
                this.debouncedPostAll();
                this.serialOutBuffer = '';
            }
        }
    }
    pxsim.BaseBoard = BaseBoard;
    class CoreBoard extends BaseBoard {
        constructor() {
            super();
            // updates
            this.updateSubscribers = [];
            this.updateView = () => {
                this.updateSubscribers.forEach(sub => sub());
            };
            this.builtinParts = {};
            this.builtinVisuals = {};
            this.builtinPartVisuals = {};
        }
        kill() {
            super.kill();
            pxsim.codal.music.__stopSoundExpressions();
            pxsim.AudioContextManager.stopAll();
            pxsim.AudioContextManager.SpatialAudioPlayer.disposeAll();
            pxsim.AudioContextManager.setListenerPosition(0, 0, 0);
        }
    }
    pxsim.CoreBoard = CoreBoard;
    class BareBoard extends BaseBoard {
    }
    function initBareRuntime() {
        pxsim.runtime.board = new BareBoard();
        let myRT = pxsim;
        myRT.basic = {
            pause: pxsim.thread.pause,
            showNumber: (n) => {
                let cb = getResume();
                pxsim.log("SHOW NUMBER:", n);
                U.nextTick(cb);
            }
        };
        myRT.serial = {
            writeString: (s) => pxsim.runtime.board.writeSerial(s),
        };
        myRT.pins = {
            createBuffer: pxsim.BufferMethods.createBuffer,
        };
        myRT.control = {
            inBackground: pxsim.thread.runInBackground,
            createBuffer: pxsim.BufferMethods.createBuffer,
            dmesg: (s) => pxsim.log("DMESG: " + s),
            deviceDalVersion: () => "sim",
            __log: (pri, s) => pxsim.log("LOG: " + s.trim()),
        };
    }
    pxsim.initBareRuntime = initBareRuntime;
    let LogType;
    (function (LogType) {
        LogType[LogType["UserSet"] = 0] = "UserSet";
        LogType[LogType["BackAdd"] = 1] = "BackAdd";
        LogType[LogType["BackRemove"] = 2] = "BackRemove";
    })(LogType || (LogType = {}));
    class EventHandler {
        constructor(handler, flags) {
            this.handler = handler;
            this.flags = flags;
            this.busy = 0;
        }
        async runAsync(eventValue, runtime, valueToArgs) {
            // The default behavior can technically be configured in codal, but we always set it to queue if busy
            const flags = this.flags || MessageListenerFlags.MESSAGE_BUS_LISTENER_QUEUE_IF_BUSY;
            if (flags === MessageListenerFlags.MESSAGE_BUS_LISTENER_IMMEDIATE) {
                U.userError("MESSAGE_BUS_LISTENER_IMMEDIATE is not supported!");
                return;
            }
            if (flags === MessageListenerFlags.MESSAGE_BUS_LISTENER_QUEUE_IF_BUSY) {
                return this.runFiberAsync(eventValue, runtime, valueToArgs);
            }
            else if (flags === MessageListenerFlags.MESSAGE_BUS_LISTENER_DROP_IF_BUSY && this.busy) {
                return;
            }
            void this.runFiberAsync(eventValue, runtime, valueToArgs);
        }
        async runFiberAsync(eventValue, runtime, valueToArgs) {
            this.busy++;
            await runtime.runFiberAsync(this.handler, ...(valueToArgs ? valueToArgs(eventValue) : [eventValue]));
            this.busy--;
        }
    }
    class EventQueue {
        constructor(runtime, valueToArgs) {
            this.runtime = runtime;
            this.valueToArgs = valueToArgs;
            this.max = 5;
            this.events = [];
            this.awaiters = [];
            this._handlers = [];
            this._addRemoveLog = [];
        }
        push(e, notifyOne) {
            if (this.awaiters.length > 0) {
                if (notifyOne) {
                    const aw = this.awaiters.shift();
                    if (aw)
                        aw();
                }
                else {
                    const aws = this.awaiters.slice();
                    this.awaiters = [];
                    aws.forEach(aw => aw());
                }
            }
            if (this.handlers.length == 0 || this.events.length > this.max)
                return Promise.resolve();
            this.events.push(e);
            // start processing, if not already processing
            if (!this.lock)
                return this.poke();
            else
                return Promise.resolve();
        }
        async poke() {
            this.lock = true;
            let events = this.events;
            // all events will be processed by concurrent promisified code below, so start afresh
            this.events = [];
            // in order semantics for events and handlers
            for (const value of events) {
                for (const handler of this.handlers) {
                    await handler.runAsync(value, this.runtime, this.valueToArgs);
                }
            }
            // if some events arrived while processing above then keep processing
            if (this.events.length > 0) {
                return this.poke();
            }
            else {
                this.lock = false;
                // process the log (synchronous)
                for (const logger of this._addRemoveLog) {
                    if (logger.log === LogType.BackAdd) {
                        this.addHandler(logger.act, logger.flags);
                    }
                    else if (logger.log === LogType.BackRemove) {
                        this.removeHandler(logger.act);
                    }
                    else {
                        this.setHandler(logger.act, logger.flags);
                    }
                }
                this._addRemoveLog = [];
            }
        }
        get handlers() {
            return this._handlers;
        }
        setHandler(a, flags = 0) {
            if (!this.lock) {
                this._handlers = [new EventHandler(a, flags)];
            }
            else {
                this._addRemoveLog.push({ act: a, log: LogType.UserSet, flags });
            }
        }
        addHandler(a, flags = 0) {
            if (!this.lock) {
                // only add if new, just like CODAL
                if (!this._handlers.some(h => h.handler === a)) {
                    this._handlers.push(new EventHandler(a, flags));
                }
            }
            else {
                this._addRemoveLog.push({ act: a, log: LogType.BackAdd, flags });
            }
        }
        removeHandler(a) {
            if (!this.lock) {
                let index = this._handlers.findIndex(h => h.handler === a);
                if (index != -1) {
                    this._handlers.splice(index, 1);
                }
            }
            else {
                this._addRemoveLog.push({ act: a, log: LogType.BackRemove, flags: 0 });
            }
        }
        addAwaiter(awaiter) {
            this.awaiters.push(awaiter);
        }
    }
    pxsim.EventQueue = EventQueue;
    // overriden at loadtime by specific implementation
    pxsim.initCurrentRuntime = undefined;
    pxsim.handleCustomMessage = undefined;
    // binds this pointer (in s.arg0) to method implementation (in s.fn)
    function bind(s) {
        const thisPtr = s.arg0;
        const f = s.fn;
        return (s2) => {
            let numArgs = 0;
            while (s2.hasOwnProperty("arg" + numArgs))
                numArgs++;
            const sa = s2;
            for (let i = numArgs; i > 0; i--)
                sa["arg" + i] = sa["arg" + (i - 1)];
            s2.arg0 = thisPtr;
            return f(s2);
        };
    }
    function _leave(s, v) {
        s.parent.retval = v;
        return s.parent;
    }
    // wraps simulator code as STS code - useful for default event handlers
    function syntheticRefAction(f) {
        return pxtcore.mkAction(0, s => _leave(s, f(s)));
    }
    pxsim.syntheticRefAction = syntheticRefAction;
    class TimeoutScheduled {
        constructor(id, fn, totalRuntime, timestampCall) {
            this.id = id;
            this.fn = fn;
            this.totalRuntime = totalRuntime;
            this.timestampCall = timestampCall;
        }
    }
    pxsim.TimeoutScheduled = TimeoutScheduled;
    class PausedTimeout {
        constructor(fn, timeRemaining) {
            this.fn = fn;
            this.timeRemaining = timeRemaining;
        }
    }
    pxsim.PausedTimeout = PausedTimeout;
    function mkVTable(src) {
        return {
            name: src.name,
            numFields: src.numFields,
            classNo: src.classNo,
            methods: src.methods,
            iface: src.iface,
            lastSubtypeNo: src.lastSubtypeNo,
            toStringMethod: src.toStringMethod,
            maxBgInstances: src.maxBgInstances,
        };
    }
    pxsim.mkVTable = mkVTable;
    let mapVTable = null;
    function mkMapVTable() {
        if (!mapVTable)
            mapVTable = mkVTable({ name: "_Map", numFields: 0, classNo: 0, lastSubtypeNo: 0, methods: null });
        return mapVTable;
    }
    pxsim.mkMapVTable = mkMapVTable;
    function functionName(fn) {
        const fi = fn.info;
        if (fi)
            return `${fi.functionName} (${fi.fileName}:${fi.line + 1}:${fi.column + 1})`;
        return "()";
    }
    pxsim.functionName = functionName;
    class Runtime {
        constructor(msg) {
            this.numGlobals = 1000;
            this.dead = false;
            this.running = false;
            this.idleTimer = undefined;
            this.recording = false;
            this.recordingTimer = 0;
            this.recordingLastImageData = undefined;
            this.recordingWidth = undefined;
            this.startTime = 0;
            this.startTimeUs = 0;
            this.pausedTime = 0;
            this.lastPauseTimestamp = 0;
            this.globals = {};
            this.environmentGlobals = {};
            this.otherFrames = [];
            this.loopLock = null;
            this.loopLockWaitList = [];
            this.heapSnapshots = [];
            this.timeoutsScheduled = [];
            this.timeoutsPausedOnBreakpoint = [];
            this.pausedOnBreakpoint = false;
            this.traceDisabled = false;
            this.perfOffset = 0;
            this.perfElapsed = 0;
            this.perfStack = 0;
            this.refCountingDebug = false;
            this.refObjId = 1;
            this.numDisplayUpdates = 0;
            U.assert(!!pxsim.initCurrentRuntime);
            this.id = msg.id;
            this.refCountingDebug = !!msg.refCountingDebug;
            let threadId = 0;
            let breakpoints = null;
            let currResume;
            let dbgHeap;
            let dbgResume;
            let breakFrame = null; // for step-over
            let lastYield = Date.now();
            let userGlobals;
            let __this = this; // ex
            this.traceDisabled = !!msg.traceDisabled;
            const yieldDelay = msg.yieldDelay !== undefined ? msg.yieldDelay : 5;
            // this is passed to generated code
            const evalIface = {
                runtime: this,
                oops,
                doNothing,
                pxsim,
                globals: this.globals,
                setupYield,
                maybeYield,
                setupDebugger,
                isBreakFrame,
                breakpoint,
                trace,
                checkStack,
                leave: _leave,
                checkResumeConsumed,
                setupResume,
                setupLambda,
                checkSubtype,
                failedCast,
                buildResume,
                mkVTable,
                bind,
                leaveAccessor,
            };
            function oops(msg) {
                throw new Error("sim error: " + msg);
            }
            function doNothing(s) {
                s.pc = -1;
                return _leave(s, s.parent.retval);
            }
            function flushLoopLock() {
                while (__this.loopLockWaitList.length > 0 && !__this.loopLock) {
                    let f = __this.loopLockWaitList.shift();
                    f();
                }
            }
            // Date.now() - 100ns on Chrome mac, 60ns on Safari iPhone XS
            // yield-- - 7ns on Chrome
            let yieldReset = () => { };
            function setupYield(reset) {
                yieldReset = reset;
            }
            function loopForSchedule(s) {
                const lock = new Object();
                const pc = s.pc;
                __this.loopLock = lock;
                __this.otherFrames.push(s);
                return () => {
                    if (__this.dead)
                        return;
                    U.assert(s.pc == pc);
                    U.assert(__this.loopLock === lock);
                    __this.loopLock = null;
                    loop(s);
                    flushLoopLock();
                };
            }
            function maybeYield(s, pc, r0) {
                // If code is running on a breakpoint, it's because we are evaluating getters;
                // no need to yield in that case.
                if (__this.pausedOnBreakpoint)
                    return false;
                __this.cleanScheduledExpired();
                yieldReset();
                let now = Date.now();
                if (now - lastYield >= 20) {
                    lastYield = now;
                    s.pc = pc;
                    s.r0 = r0;
                    setTimeout(loopForSchedule(s), yieldDelay);
                    return true;
                }
                return false;
            }
            function setupDebugger(numBreakpoints, userCodeGlobals) {
                breakpoints = new Uint8Array(numBreakpoints);
                // start running and let user put a breakpoint on start
                breakpoints[0] = msg.breakOnStart ? 1 : 0;
                userGlobals = userCodeGlobals;
                return breakpoints;
            }
            function isBreakFrame(s) {
                if (!breakFrame)
                    return true; // nothing specified
                for (let p = breakFrame; p; p = p.parent) {
                    if (p == s)
                        return true;
                }
                return false;
            }
            function breakpoint(s, retPC, brkId, r0) {
                let lock = {};
                __this.loopLock = lock;
                U.assert(!dbgResume);
                U.assert(!dbgHeap);
                s.pc = retPC;
                s.r0 = r0;
                const { msg, heap } = pxsim.getBreakpointMsg(s, brkId, userGlobals);
                dbgHeap = heap;
                pxsim.injectEnvironmentGlobals(msg, heap);
                Runtime.postMessage(msg);
                breakpoints[0] = 0;
                breakFrame = null;
                __this.pauseScheduled();
                dbgResume = (m) => {
                    dbgResume = null;
                    dbgHeap = null;
                    if (__this.dead)
                        return null;
                    __this.resumeAllPausedScheduled();
                    __this.board.onDebuggerResume();
                    pxsim.runtime = __this;
                    U.assert(s.pc == retPC);
                    breakpoints[0] = 0;
                    breakFrame = null;
                    switch (m.subtype) {
                        case "resume":
                            break;
                        case "stepover":
                            breakpoints[0] = 1;
                            breakFrame = s;
                            break;
                        case "stepinto":
                            breakpoints[0] = 1;
                            break;
                        case "stepout":
                            breakpoints[0] = 1;
                            breakFrame = s.parent || s;
                            break;
                    }
                    U.assert(__this.loopLock == lock);
                    __this.loopLock = null;
                    __this.otherFrames.push(s);
                    loop(s);
                    flushLoopLock();
                };
                return null;
            }
            function trace(brkId, s, retPc, info) {
                setupResume(s, retPc);
                if (info.functionName === "<main>" || info.fileName === "main.ts") {
                    if (!pxsim.runtime.traceDisabled) {
                        const { msg } = pxsim.getBreakpointMsg(s, brkId, userGlobals);
                        msg.subtype = "trace";
                        Runtime.postMessage(msg);
                    }
                    pxsim.thread.pause(tracePauseMs || 1);
                }
                else {
                    pxsim.thread.pause(0);
                }
                checkResumeConsumed();
            }
            function handleDebuggerMsg(msg) {
                switch (msg.subtype) {
                    case "config":
                        let cfg = msg;
                        if (cfg.setBreakpoints && breakpoints) {
                            breakpoints.fill(0);
                            for (let n of cfg.setBreakpoints)
                                breakpoints[n] = 1;
                        }
                        break;
                    case "traceConfig":
                        let trc = msg;
                        tracePauseMs = trc.interval;
                        break;
                    case "pause":
                        breakpoints[0] = 1;
                        breakFrame = null;
                        break;
                    case "resume":
                    case "stepover":
                    case "stepinto":
                    case "stepout":
                        if (dbgResume)
                            dbgResume(msg);
                        break;
                    case "variables":
                        const vmsg = msg;
                        let vars = undefined;
                        if (dbgHeap) {
                            const v = dbgHeap[vmsg.variablesReference];
                            if (v !== undefined)
                                vars = pxsim.dumpHeap(v, dbgHeap, vmsg.fields, undefined, vmsg.includeAll);
                        }
                        Runtime.postMessage({
                            type: "debugger",
                            subtype: "variables",
                            req_seq: msg.seq,
                            variables: vars
                        });
                        break;
                }
            }
            function removeFrame(p) {
                const frames = __this.otherFrames;
                for (let i = frames.length - 1; i >= 0; --i) {
                    if (frames[i] === p) {
                        frames.splice(i, 1);
                        return;
                    }
                }
                U.userError("frame cannot be removed!");
            }
            function loop(p) {
                if (__this.dead) {
                    pxsim.log("Runtime terminated");
                    return;
                }
                U.assert(!__this.loopLock);
                __this.perfStartRuntime();
                removeFrame(p);
                try {
                    pxsim.runtime = __this;
                    while (!!p) {
                        __this.currFrame = p;
                        __this.currFrame.overwrittenPC = false;
                        p = p.fn(p);
                        //if (yieldSteps-- < 0 && maybeYield(p, p.pc, 0)) break;
                        __this.maybeUpdateDisplay();
                        if (__this.currFrame.overwrittenPC)
                            p = __this.currFrame;
                    }
                    __this.perfStopRuntime();
                }
                catch (e) {
                    if (e instanceof BreakLoopException) {
                        U.nextTick(loopForSchedule(__this.currFrame));
                        return;
                    }
                    __this.perfStopRuntime();
                    if (__this.errorHandler)
                        __this.errorHandler(e);
                    else {
                        pxsim.error("Simulator crashed, no error handler", e.stack);
                        const { msg, heap } = pxsim.getBreakpointMsg(p, p.lastBrkId, userGlobals);
                        pxsim.injectEnvironmentGlobals(msg, heap);
                        msg.exceptionMessage = e.message;
                        msg.exceptionStack = e.stack;
                        Runtime.postMessage(msg);
                        if (__this.postError)
                            __this.postError(e);
                    }
                }
            }
            function checkStack(d) {
                if (d > 100)
                    U.userError("Stack overflow");
            }
            function actionCall(s) {
                s.depth = s.parent.depth + 1;
                checkStack(s.depth);
                s.pc = 0;
                return s;
            }
            function setupTop(cb) {
                let s = setupTopCore(cb);
                setupResume(s, 0);
                return s;
            }
            function setupTopCore(cb) {
                let frame = {
                    parent: null,
                    pc: 0,
                    depth: 0,
                    threadId: ++threadId,
                    fn: () => {
                        if (cb)
                            cb(frame.retval);
                        return null;
                    }
                };
                return frame;
            }
            function topCall(fn, cb) {
                U.assert(!!__this.board);
                U.assert(!__this.running);
                __this.setRunning(true);
                let topFrame = setupTopCore(cb);
                let frame = {
                    parent: topFrame,
                    fn: fn,
                    depth: 0,
                    pc: 0
                };
                __this.otherFrames = [frame];
                loop(actionCall(frame));
            }
            function checkResumeConsumed() {
                if (currResume)
                    oops("getResume() not called");
            }
            function setupResume(s, retPC) {
                currResume = buildResume(s, retPC);
            }
            function leaveAccessor(s, v) {
                if (s.stage2Call) {
                    const s2 = {
                        pc: 0,
                        fn: null,
                        depth: s.depth,
                        parent: s.parent,
                    };
                    let num = 1;
                    while (s.hasOwnProperty("arg" + num)) {
                        s2["arg" + (num - 1)] = s["arg" + num];
                        num++;
                    }
                    setupLambda(s2, v);
                    return s2;
                }
                s.parent.retval = v;
                return s.parent;
            }
            function setupLambda(s, a, numShift) {
                if (numShift) {
                    const sa = s;
                    for (let i = 1; i < numShift; ++i)
                        sa["arg" + (i - 1)] = sa["arg" + i];
                    delete sa["arg" + (numShift - 1)];
                }
                if (a instanceof pxsim.RefAction) {
                    s.fn = a.func;
                    s.caps = a.fields;
                }
                else if (typeof a == "function") {
                    s.fn = a;
                }
                else {
                    oops("calling non-function");
                }
            }
            function checkSubtype(v, vt) {
                if (!v)
                    return false;
                const vt2 = v.vtable;
                if (vt === vt2)
                    return true;
                return vt2 && vt.classNo <= vt2.classNo && vt2.classNo <= vt.lastSubtypeNo;
            }
            function failedCast(v, expectedType) {
                // TODO generate the right panic codes
                if (pxsim.control && pxsim.control.dmesgValue) {
                    pxsim.control.dmesgValue(v);
                }
                throwFailedCastError(v, expectedType === null || expectedType === void 0 ? void 0 : expectedType.name);
            }
            function buildResume(s, retPC) {
                if (currResume)
                    oops("already has resume");
                s.pc = retPC;
                let start = Date.now();
                __this.otherFrames.push(s);
                let fn = (v) => {
                    if (__this.dead)
                        return;
                    if (__this.loopLock) {
                        __this.loopLockWaitList.push(() => fn(v));
                        return;
                    }
                    pxsim.runtime = __this;
                    let now = Date.now();
                    if (now - start > 3)
                        lastYield = now;
                    U.assert(s.pc == retPC);
                    if (v instanceof pxsim.FnWrapper) {
                        let w = v;
                        let frame = {
                            parent: s,
                            fn: w.func,
                            lambdaArgs: w.args,
                            pc: 0,
                            caps: w.caps,
                            depth: s.depth + 1,
                        };
                        // If the function we call never pauses, this would cause the stack
                        // to grow unbounded.
                        let lock = {};
                        __this.loopLock = lock;
                        removeFrame(s);
                        __this.otherFrames.push(frame);
                        return U.nextTick(() => {
                            U.assert(__this.loopLock === lock);
                            __this.loopLock = null;
                            loop(actionCall(frame));
                            flushLoopLock();
                        });
                    }
                    s.retval = v;
                    return loop(s);
                };
                return fn;
            }
            // eslint-disable-next-line
            const entryPoint = msg.code && eval(msg.code)(evalIface);
            this.run = (cb) => topCall(entryPoint, cb);
            this.getResume = () => {
                if (!currResume)
                    oops("noresume");
                let r = currResume;
                currResume = null;
                return r;
            };
            this.setupTop = setupTop;
            this.handleDebuggerMsg = handleDebuggerMsg;
            this.entry = entryPoint;
            this.overwriteResume = (retPC) => {
                currResume = null;
                if (retPC >= 0)
                    this.currFrame.pc = retPC;
                this.currFrame.overwrittenPC = true;
            };
            pxsim.runtime = this;
            pxsim.initCurrentRuntime(msg);
        }
        registerLiveObject(object) {
            const id = this.refObjId++;
            return id;
        }
        runningTime() {
            return U.now() - this.startTime - this.pausedTime;
        }
        runningTimeUs() {
            return 0xffffffff & ((U.perfNowUs() - this.startTimeUs) >> 0);
        }
        runFiberAsync(a, arg0, arg1, arg2) {
            return new Promise((resolve, reject) => U.nextTick(() => {
                pxsim.runtime = this;
                this.setupTop(resolve);
                pxtcore.runAction(a, [arg0, arg1, arg2]);
            }));
        }
        currTryFrame() {
            for (let p = this.currFrame; p; p = p.parent)
                if (p.tryFrame)
                    return p.tryFrame;
            return null;
        }
        traceObjects() {
            const visited = {};
            while (this.heapSnapshots.length > 2)
                this.heapSnapshots.shift();
            const stt = {
                count: 0,
                size: 0,
                name: "TOTAL"
            };
            const statsByType = {
                "TOTAL": stt
            };
            this.heapSnapshots.push({
                visited,
                statsByType
            });
            function scan(name, v, par = null) {
                if (!(v instanceof pxsim.RefObject))
                    return;
                const obj = v;
                if (obj.gcIsStatic())
                    return;
                const ex = visited[obj.id];
                if (ex) {
                    if (par)
                        ex.pointers.push([par, name]);
                    return;
                }
                const here = { obj, path: null, pointers: [[par, name]] };
                visited[obj.id] = here;
                obj.scan((subpath, v) => {
                    if (v instanceof pxsim.RefObject && !visited[v.id])
                        scan(subpath, v, here);
                });
            }
            for (let k of Object.keys(this.globals)) {
                scan(k.replace(/___\d+$/, ""), this.globals[k]);
            }
            const frames = this.otherFrames.slice();
            if (this.currFrame && frames.indexOf(this.currFrame) < 0)
                frames.unshift(this.currFrame);
            for (const thread of this.getThreads()) {
                const thrPath = "Thread-" + this.rootFrame(thread).threadId;
                for (let s = thread; s; s = s.parent) {
                    const path = thrPath + "." + functionName(s.fn);
                    for (let k of Object.keys(s)) {
                        if (/^(r0|arg\d+|.*___\d+)/.test(k)) {
                            const v = s[k];
                            if (v instanceof pxsim.RefObject) {
                                k = k.replace(/___.*/, "");
                                scan(path + "." + k, v);
                            }
                        }
                    }
                    if (s.caps) {
                        for (let c of s.caps)
                            scan(path + ".cap", c);
                    }
                }
            }
            const allObjects = Object.keys(visited).map(k => visited[k]);
            allObjects.sort((a, b) => b.obj.gcSize() - a.obj.gcSize());
            const setPath = (inf) => {
                if (inf.path != null)
                    return;
                let short = "";
                inf.path = "(cycle)";
                for (let [par, name] of inf.pointers) {
                    if (par == null) {
                        inf.path = name;
                        return;
                    }
                    setPath(par);
                    const newPath = par.path + "." + name;
                    if (!short || short.length > newPath.length)
                        short = newPath;
                }
                inf.path = short;
            };
            allObjects.forEach(setPath);
            const allStats = [stt];
            for (const inf of allObjects) {
                const sz = inf.obj.gcSize();
                const key = inf.obj.gcKey();
                if (!statsByType.hasOwnProperty(key)) {
                    allStats.push(statsByType[key] = {
                        count: 0,
                        size: 0,
                        name: key
                    });
                }
                const st = statsByType[key];
                st.size += sz;
                st.count++;
                stt.size += sz;
                stt.count++;
            }
            allStats.sort((a, b) => a.size - b.size);
            let objTable = "";
            const fmt = (n) => ("        " + n.toString()).slice(-7);
            for (const st of allStats) {
                objTable += fmt(st.size * 4) + fmt(st.count) + " " + st.name + "\n";
            }
            const objInfo = (inf) => fmt(inf.obj.gcSize() * 4) + " " + inf.obj.gcKey() + " " + inf.path;
            const large = allObjects.slice(0, 20).map(objInfo).join("\n");
            let leaks = "";
            if (this.heapSnapshots.length >= 3) {
                const v0 = this.heapSnapshots[this.heapSnapshots.length - 3].visited;
                const v1 = this.heapSnapshots[this.heapSnapshots.length - 2].visited;
                const isBgInstance = (obj) => {
                    if (!(obj instanceof pxsim.RefRecord))
                        return false;
                    if (obj.vtable && obj.vtable.maxBgInstances) {
                        if (statsByType[obj.gcKey()].count <= obj.vtable.maxBgInstances)
                            return true;
                    }
                    return false;
                };
                const leakObjs = allObjects
                    .filter(inf => !v0[inf.obj.id] && v1[inf.obj.id])
                    .filter(inf => !isBgInstance(inf.obj));
                leaks = leakObjs
                    .map(objInfo).join("\n");
            }
            return ("Threads:\n" + this.threadInfo() +
                "\n\nSummary:\n" + objTable +
                "\n\nLarge Objects:\n" + large +
                "\n\nNew Objects:\n" + leaks);
        }
        getThreads() {
            const frames = this.otherFrames.slice();
            if (this.currFrame && frames.indexOf(this.currFrame) < 0)
                frames.unshift(this.currFrame);
            return frames;
        }
        rootFrame(f) {
            let p = f;
            while (p.parent)
                p = p.parent;
            return p;
        }
        threadInfo() {
            const frames = this.getThreads();
            let info = "";
            for (let f of frames) {
                info += `Thread ${this.rootFrame(f).threadId}:\n`;
                for (let s of pxsim.getBreakpointMsg(f, f.lastBrkId).msg.stackframes) {
                    let fi = s.funcInfo;
                    info += `   at ${fi.functionName} (${fi.fileName}:${fi.line + 1}:${fi.column + 1})\n`;
                }
                info += "\n";
            }
            return info;
        }
        static postMessage(data) {
            if (!data)
                return;
            // TODO: origins
            if (typeof window !== 'undefined' && window.parent && window.parent.postMessage) {
                window.parent.postMessage(data, "*");
            }
            if (Runtime.messagePosted)
                Runtime.messagePosted(data);
        }
        static async postScreenshotAsync(opts) {
            const b = pxsim.runtime && pxsim.runtime.board;
            if (!b)
                return undefined;
            const img = await b.screenshotAsync();
            Runtime.postMessage({
                type: "screenshot",
                data: img,
                delay: opts && opts.delay
            });
        }
        static requestToggleRecording() {
            const r = pxsim.runtime;
            if (!r)
                return;
            Runtime.postMessage({
                type: "recorder",
                action: r.recording ? "stop" : "start"
            });
        }
        restart() {
            this.kill();
            setTimeout(() => pxsim.Runtime.postMessage({
                type: "simulator",
                command: "restart"
            }), 500);
        }
        kill() {
            this.dead = true;
            // TODO fix this
            this.stopRecording();
            this.stopIdle();
            this.setRunning(false);
        }
        updateDisplay() {
            this.board.updateView();
            this.postFrame();
        }
        startRecording(width) {
            if (this.recording || !this.running)
                return;
            this.recording = true;
            this.recordingTimer = setInterval(() => this.postFrame(), 66);
            this.recordingLastImageData = undefined;
            this.recordingWidth = width;
        }
        stopRecording() {
            if (!this.recording)
                return;
            if (this.recordingTimer)
                clearInterval(this.recordingTimer);
            this.recording = false;
            this.recordingTimer = 0;
            this.recordingLastImageData = undefined;
            this.recordingWidth = undefined;
        }
        postFrame() {
            if (!this.recording || !this.running)
                return;
            let time = pxsim.U.now();
            this.board.screenshotAsync(this.recordingWidth)
                .then(imageData => {
                // check for duplicate images
                if (this.recordingLastImageData && isImageDataEqual(this.recordingLastImageData, imageData)) {
                    return;
                }
                this.recordingLastImageData = imageData;
                Runtime.postMessage({
                    type: "screenshot",
                    data: imageData,
                    time
                });
            });
        }
        queueDisplayUpdate() {
            this.numDisplayUpdates++;
        }
        maybeUpdateDisplay() {
            if (this.numDisplayUpdates) {
                this.numDisplayUpdates = 0;
                this.updateDisplay();
            }
        }
        setRunning(r) {
            if (this.running != r) {
                this.running = r;
                if (this.running) {
                    this.startTime = U.now();
                    this.startTimeUs = U.perfNowUs();
                    Runtime.postMessage({
                        type: 'status',
                        frameid: pxsim.Embed.frameid,
                        runtimeid: this.id,
                        state: 'running'
                    });
                }
                else {
                    this.stopRecording();
                    this.stopIdle();
                    Runtime.postMessage({
                        type: 'status',
                        frameid: pxsim.Embed.frameid,
                        runtimeid: this.id,
                        state: 'killed'
                    });
                }
                if (this.stateChanged)
                    this.stateChanged();
            }
        }
        dumpLivePointers() {
            return;
        }
        setupPerfCounters(names) {
            if (!names || !names.length)
                return;
            this.perfCounters = names.map(s => new PerfCounter(s));
        }
        perfStartRuntime() {
            if (this.perfOffset !== 0) {
                this.perfStack++;
            }
            else {
                this.perfOffset = U.perfNowUs() - this.perfElapsed;
            }
        }
        perfStopRuntime() {
            if (this.perfStack) {
                this.perfStack--;
            }
            else {
                this.perfElapsed = this.perfNow();
                this.perfOffset = 0;
            }
        }
        perfNow() {
            if (this.perfOffset === 0)
                U.userError("bad time now");
            return (U.perfNowUs() - this.perfOffset) | 0;
        }
        startPerfCounter(n) {
            if (!this.perfCounters)
                return;
            const c = this.perfCounters[n];
            if (c.start)
                U.userError("startPerf");
            c.start = this.perfNow();
        }
        stopPerfCounter(n) {
            if (!this.perfCounters)
                return;
            const c = this.perfCounters[n];
            if (!c.start)
                U.userError("stopPerf");
            const curr = this.perfNow() - c.start;
            c.start = 0;
            // skip outliers
            // if (c.numstops > 30 && curr > 1.2 * c.value / c.numstops)
            //    return
            c.value += curr;
            c.numstops++;
            let p = c.lastFewPtr++;
            if (p >= c.lastFew.length) {
                p = 0;
                c.lastFewPtr = 1;
            }
            c.lastFew[p] = curr;
        }
        startIdle() {
            // schedules handlers to run every 20ms
            if (this.idleTimer === undefined) {
                this.idleTimer = setInterval(() => {
                    if (!this.running || this.pausedOnBreakpoint)
                        return;
                    const bus = this.board.bus;
                    if (bus)
                        bus.queueIdle();
                }, 20);
            }
        }
        stopIdle() {
            if (this.idleTimer !== undefined) {
                clearInterval(this.idleTimer);
                this.idleTimer = undefined;
            }
        }
        // Wrapper for the setTimeout
        schedule(fn, timeout) {
            if (timeout <= 0)
                timeout = 0;
            if (this.pausedOnBreakpoint) {
                this.timeoutsPausedOnBreakpoint.push(new PausedTimeout(fn, timeout));
                return -1;
            }
            const timestamp = U.now();
            const to = new TimeoutScheduled(-1, fn, timeout, timestamp);
            // We call the timeout function and add its id to the timeouts scheduled.
            const removeAndExecute = () => {
                const idx = this.timeoutsScheduled.indexOf(to);
                if (idx >= 0)
                    this.timeoutsScheduled.splice(idx, 1);
                fn();
            };
            to.id = setTimeout(removeAndExecute, timeout);
            this.timeoutsScheduled.push(to);
            return to.id;
        }
        // On breakpoint, pause all timeouts
        pauseScheduled() {
            this.pausedOnBreakpoint = true;
            this.timeoutsScheduled.forEach(ts => {
                clearTimeout(ts.id);
                let elapsed = U.now() - ts.timestampCall;
                let timeRemaining = ts.totalRuntime - elapsed;
                // Time reamining needs to be at least 1. Setting to 0 causes fibers
                // to never resume after breaking
                if (timeRemaining <= 0)
                    timeRemaining = 1;
                this.timeoutsPausedOnBreakpoint.push(new PausedTimeout(ts.fn, timeRemaining));
            });
            this.lastPauseTimestamp = U.now();
            this.timeoutsScheduled = [];
        }
        // When resuming after a breakpoint, restart all paused timeouts with their remaining time.
        resumeAllPausedScheduled() {
            // Takes the list of all fibers paused on a breakpoint and resumes them.
            this.pausedOnBreakpoint = false;
            this.timeoutsPausedOnBreakpoint.forEach(pt => {
                this.schedule(pt.fn, pt.timeRemaining);
            });
            if (this.lastPauseTimestamp) {
                this.pausedTime += U.now() - this.lastPauseTimestamp;
                this.lastPauseTimestamp = 0;
            }
            this.timeoutsPausedOnBreakpoint = [];
        }
        // Removes from the timeouts scheduled list all the ones that had been fulfilled.
        cleanScheduledExpired() {
            let now = U.now();
            this.timeoutsScheduled = this.timeoutsScheduled.filter(ts => {
                let elapsed = now - ts.timestampCall;
                return ts.totalRuntime > elapsed;
            });
        }
        registerUserInteraction() {
            this.lastInteractionTime = Date.now();
            if (this.thumbnailRecordingIntervalRef || this.lastThumbnailTime && this.lastInteractionTime - this.lastThumbnailTime < 1000)
                return;
            this.thumbnailFrames = [];
            this.thumbnailRecordingIntervalRef = setInterval(async () => {
                const imageData = await this.board.screenshotAsync();
                if (this.thumbnailFrames.length && isImageDataEqual(imageData, this.thumbnailFrames[this.thumbnailFrames.length - 1])) {
                    return;
                }
                this.thumbnailFrames.push(imageData);
                if (Date.now() - this.lastInteractionTime > 10000 || this.thumbnailFrames.length > 30) {
                    clearInterval(this.thumbnailRecordingIntervalRef);
                    this.thumbnailRecordingIntervalRef = undefined;
                    this.lastThumbnailTime = Date.now();
                    Runtime.postMessage({
                        type: "thumbnail",
                        frames: this.thumbnailFrames
                    });
                }
            }, 66);
        }
    }
    pxsim.Runtime = Runtime;
    function throwUserException(message) {
        throw new Error(message);
    }
    pxsim.throwUserException = throwUserException;
    function throwTypeError(message) {
        throwUserException(pxsim.localization.lf("TypeError: {0}", message));
    }
    pxsim.throwTypeError = throwTypeError;
    function throwFailedCastError(value, expectedType) {
        const typename = getType(value);
        if (expectedType) {
            if (value === null || value === undefined) {
                throwTypeError(pxsim.localization.lf("Expected type {0} but received type {1}. Did you forget to assign a variable?", expectedType, typename));
            }
            else {
                throwTypeError(pxsim.localization.lf("Expected type {0} but received type {1}", expectedType, typename));
            }
        }
        else {
            throwTypeError(pxsim.localization.lf("Cannot read properties of {0}", typename));
        }
    }
    pxsim.throwFailedCastError = throwFailedCastError;
    function throwFailedPropertyAccessError(value, propertyName) {
        const typename = getType(value);
        if (propertyName) {
            throwTypeError(pxsim.localization.lf("Cannot read properties of {0} (reading '{1}')", typename, propertyName));
        }
        else {
            throwTypeError(pxsim.localization.lf("Cannot read properties of {0}", typename));
        }
    }
    pxsim.throwFailedPropertyAccessError = throwFailedPropertyAccessError;
    function throwNullUndefinedAsObjectError() {
        throwTypeError(pxsim.localization.lf("Cannot convert undefined or null to object"));
    }
    pxsim.throwNullUndefinedAsObjectError = throwNullUndefinedAsObjectError;
    function getType(value) {
        let typename;
        const vtable = value === null || value === void 0 ? void 0 : value.vtable;
        if (vtable) {
            typename = vtable.name;
        }
        else if (value === null) {
            typename = "null";
        }
        else if (value === undefined) {
            typename = "undefined";
        }
        else if (value instanceof pxsim.RefCollection) {
            typename = "Array";
        }
        else if (value instanceof pxsim.RefBuffer) {
            typename = "Buffer";
        }
        else if (value instanceof pxsim.RefAction) {
            typename = "function";
        }
        else {
            typename = typeof value;
        }
        return typename;
    }
    function setParentMuteState(state) {
        Runtime.postMessage({
            type: "setmutebuttonstate",
            state
        });
    }
    pxsim.setParentMuteState = setParentMuteState;
    class PerfCounter {
        constructor(name) {
            this.name = name;
            this.start = 0;
            this.numstops = 0;
            this.value = 0;
            this.lastFew = new Uint32Array(32);
            this.lastFewPtr = 0;
        }
    }
    pxsim.PerfCounter = PerfCounter;
    function isImageDataEqual(d0, d1) {
        if (d0.data.byteLength !== d1.data.byteLength)
            return false;
        const n = d0.data.byteLength;
        let i = 0;
        for (i = 0; i < n; ++i)
            if (d0.data[i] != d1.data[i])
                break;
        return i === n;
    }
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    let SimulatorState;
    (function (SimulatorState) {
        SimulatorState[SimulatorState["Unloaded"] = 0] = "Unloaded";
        SimulatorState[SimulatorState["Stopped"] = 1] = "Stopped";
        SimulatorState[SimulatorState["Pending"] = 2] = "Pending";
        SimulatorState[SimulatorState["Starting"] = 3] = "Starting";
        SimulatorState[SimulatorState["Running"] = 4] = "Running";
        SimulatorState[SimulatorState["Paused"] = 5] = "Paused";
        SimulatorState[SimulatorState["Suspended"] = 6] = "Suspended";
    })(SimulatorState = pxsim.SimulatorState || (pxsim.SimulatorState = {}));
    let SimulatorDebuggerCommand;
    (function (SimulatorDebuggerCommand) {
        SimulatorDebuggerCommand[SimulatorDebuggerCommand["StepInto"] = 0] = "StepInto";
        SimulatorDebuggerCommand[SimulatorDebuggerCommand["StepOver"] = 1] = "StepOver";
        SimulatorDebuggerCommand[SimulatorDebuggerCommand["StepOut"] = 2] = "StepOut";
        SimulatorDebuggerCommand[SimulatorDebuggerCommand["Resume"] = 3] = "Resume";
        SimulatorDebuggerCommand[SimulatorDebuggerCommand["Pause"] = 4] = "Pause";
    })(SimulatorDebuggerCommand = pxsim.SimulatorDebuggerCommand || (pxsim.SimulatorDebuggerCommand = {}));
    const FRAME_DATA_MESSAGE_CHANNEL = "messagechannel";
    const FRAME_ASPECT_RATIO = "aspectratio";
    const MESSAGE_SOURCE = "pxtdriver";
    const PERMANENT = "permanent";
    class SimulatorDriver {
        constructor(container, options = {}) {
            this.container = container;
            this.options = options;
            this.themes = ["blue", "red", "green", "yellow"];
            this.runId = '';
            this.nextFrameId = 0;
            this.frameCounter = 0;
            this.singleSimulator = false;
            this.traceInterval = 0;
            this.breakpointsSet = false;
            this._runOptions = {};
            this.state = SimulatorState.Unloaded;
            this._allowedOrigins = [];
            this.frameCleanupTimeout = undefined;
            this.debuggerSeq = 1;
            this.debuggerResolvers = {};
            this._allowedOrigins.push(window.location.origin);
            if (options.parentOrigin) {
                this._allowedOrigins.push(options.parentOrigin);
            }
            this._allowedOrigins.push(this.getSimUrl().origin);
            // Legacy support for message simulators
            const messageSimulators = (options === null || options === void 0 ? void 0 : options.messageSimulators) || {};
            Object.keys(messageSimulators)
                .map(channel => messageSimulators[channel])
                .forEach(messageSimulator => {
                this._allowedOrigins.push(new URL(messageSimulator.url).origin);
                if (messageSimulator.localHostUrl)
                    this._allowedOrigins.push(new URL(messageSimulator.localHostUrl).origin);
            });
            // Preprocess simulator extensions
            const simXDevMode = pxsim.U.isLocalHost() && /[?&]simxdev(?:[=&#]|$)/i.test(window.location.href);
            Object.entries((options === null || options === void 0 ? void 0 : options.simulatorExtensions) || {}).forEach(([key, simx]) => {
                // Verify essential `simx` config was provided
                if (!simx ||
                    !simx.index ||
                    !simx.aspectRatio ||
                    simx.permanent === undefined) {
                    return;
                }
                // Compute the effective URL
                if (simXDevMode && simx.devUrl) {
                    // Use the dev URL if the dev flag is set (and we're on localhost)
                    simx.url = new URL(simx.index, simx.devUrl).toString();
                }
                else {
                    const simUrl = this.getSimUrl();
                    // Construct the path. The "-" element delineates the extension key from the resource name.
                    const simxPath = ["simx", key, "-", simx.index].join("/");
                    // Create the fully-qualified URL, preserving the origin by removing all leading slashes
                    simx.url = new URL(simxPath.replace(/^\/+/, ""), simUrl.origin).toString();
                }
                // Add the origin to the allowed origins
                this._allowedOrigins.push(new URL(simx.url).origin);
            });
            this._allowedOrigins = pxsim.U.unique(this._allowedOrigins, f => f);
        }
        isDebug() {
            return this._runOptions && !!this._runOptions.debug;
        }
        isTracing() {
            return this._runOptions && !!this._runOptions.trace;
        }
        hasParts() {
            return this._runOptions && this._runOptions.parts && !!this._runOptions.parts.length;
        }
        setDirty() {
            // We suspend the simulator here to stop it from running without
            // interfering with the user's stopped state. We're not doing this check
            // in the driver because the driver should be able to switch from any state
            // to the suspend state, but in this codepath we only want to switch to the
            // suspended state if we're running
            if (this.state == pxsim.SimulatorState.Running)
                this.suspend();
        }
        setPending() {
            this.setState(SimulatorState.Pending);
        }
        focus() {
            const frame = this.simFrames()[0];
            if (frame)
                frame.focus();
        }
        registerDependentEditor(w) {
            if (!w)
                return;
            if (!this._dependentEditors)
                this._dependentEditors = [];
            this._dependentEditors.push(w);
        }
        dependentEditors() {
            if (this._dependentEditors) {
                this._dependentEditors = this._dependentEditors.filter(w => !!w.parent);
                if (!this._dependentEditors.length)
                    this._dependentEditors = undefined;
            }
            return this._dependentEditors;
        }
        setStarting() {
            this.setState(SimulatorState.Starting);
        }
        setHwDebugger(hw) {
            if (hw) {
                // TODO set some visual on the simulator frame
                // in future the simulator frame could reflect changes in the hardware
                this.hwdbg = hw;
                this.setState(SimulatorState.Running);
                this.container.style.opacity = "0.3";
            }
            else {
                delete this.container.style.opacity;
                this.hwdbg = null;
                this.setState(SimulatorState.Running);
                this.stop();
            }
        }
        handleHwDebuggerMsg(msg) {
            if (!this.hwdbg)
                return;
            this.handleMessage(msg);
        }
        setThemes(themes) {
            pxsim.U.assert(themes && themes.length > 0);
            this.themes = themes;
        }
        startRecording(width) {
            const frame = this.simFrames()[0];
            if (!frame)
                return undefined;
            this.postMessage({
                type: 'recorder',
                action: 'start',
                source: MESSAGE_SOURCE,
                width
            });
        }
        stopRecording() {
            this.postMessage({ type: 'recorder', source: MESSAGE_SOURCE, action: 'stop' });
        }
        setFrameState(frame) {
            const icon = frame.nextElementSibling;
            const loader = icon.nextElementSibling;
            // apply state
            switch (this.state) {
                case SimulatorState.Pending:
                case SimulatorState.Starting:
                    icon.style.display = '';
                    icon.className = '';
                    loader.style.display = '';
                    break;
                case SimulatorState.Stopped:
                case SimulatorState.Suspended:
                    pxsim.U.addClass(frame, (this.state == SimulatorState.Stopped || (this._runOptions && this._runOptions.autoRun))
                        ? this.stoppedClass : this.invalidatedClass);
                    if (!this._runOptions || !this._runOptions.autoRun) {
                        icon.style.display = '';
                        icon.className = 'videoplay xicon icon';
                    }
                    else
                        icon.style.display = 'none';
                    loader.style.display = 'none';
                    this.scheduleFrameCleanup();
                    break;
                default:
                    pxsim.U.removeClass(frame, this.stoppedClass);
                    pxsim.U.removeClass(frame, this.invalidatedClass);
                    icon.style.display = 'none';
                    loader.style.display = 'none';
                    break;
            }
        }
        setState(state) {
            if (this.state != state) {
                this.state = state;
                this.freeze(this.state == SimulatorState.Paused); // don't allow interaction when pause
                this.simFrames().forEach(frame => this.setFrameState(frame));
                if (this.options.onStateChanged)
                    this.options.onStateChanged(this.state);
            }
        }
        freeze(value) {
            const cls = "pause-overlay";
            if (!value) {
                pxsim.util.toArray(this.container.querySelectorAll(`div.simframe div.${cls}`))
                    .forEach(overlay => overlay.parentElement.removeChild(overlay));
            }
            else {
                pxsim.util.toArray(this.container.querySelectorAll("div.simframe"))
                    .forEach(frame => {
                    if (frame.querySelector(`div.${cls}`))
                        return;
                    const div = document.createElement("div");
                    div.className = cls;
                    div.onclick = (ev) => {
                        ev.preventDefault();
                        return false;
                    };
                    frame.appendChild(div);
                });
            }
        }
        simFrames(skipLoaned = false) {
            let frames = pxsim.util.toArray(this.container.getElementsByTagName("iframe"));
            const loanedFrame = this.loanedIFrame();
            if (loanedFrame && !skipLoaned)
                frames.unshift(loanedFrame);
            return frames;
        }
        getSimUrl() {
            var _a, _b;
            const simUrl = this.options.simUrl || ((_a = window.pxtConfig) === null || _a === void 0 ? void 0 : _a.simUrl) || ((_b = pxt.webConfig) === null || _b === void 0 ? void 0 : _b.simUrl) || `${location.origin}/sim/simulator.html`;
            try {
                return new URL(simUrl);
            }
            catch (_c) {
                // Failed to parse set url; try based off origin in case path defined as relative (e.g. /simulator.html)
                return new URL(simUrl, location.origin);
            }
        }
        setSingleSimulator() {
            this.singleSimulator = true;
        }
        postMessage(msg, source, frameID) {
            var _a;
            if (this.hwdbg) {
                this.hwdbg.postMessage(msg);
                return;
            }
            const depEditors = this.dependentEditors();
            let frames = this.simFrames();
            if (frameID)
                frames = frames.filter(f => f.id === frameID);
            let isDeferrableBroadcastMessage = false;
            const broadcastmsg = msg;
            if (source && (broadcastmsg === null || broadcastmsg === void 0 ? void 0 : broadcastmsg.broadcast)) {
                const mkcdFrames = frames.filter(frame => !frame.dataset[FRAME_DATA_MESSAGE_CHANNEL]);
                const messageChannel = msg.type === "messagepacket" && msg.channel;
                // include index of the source iframe
                broadcastmsg.srcFrameIndex = this.simFrames().findIndex((item) => item.contentWindow === source);
                const sourceFrame = broadcastmsg.srcFrameIndex >= 0 ? this.simFrames()[broadcastmsg.srcFrameIndex] : undefined;
                // jacdac messages from a board sim other than first should be dropped
                if (broadcastmsg.srcFrameIndex > 0 && mkcdFrames.find(f => f === sourceFrame) && messageChannel === "jacdac")
                    return;
                // if the editor is hosted in a multi-editor setting
                // don't start extra frames
                const single = !!((_a = this._currentRuntime) === null || _a === void 0 ? void 0 : _a.single);
                const parentWindow = window.parent && window.parent !== window.window
                    ? window.parent : window.opener;
                if (parentWindow) {
                    // if message comes from parent already, don't echo
                    if (source !== parentWindow) {
                        // posting sim messages to parent frame; no origin restriction.
                        parentWindow.postMessage(msg, "*");
                    }
                }
                if (!this.options.nestedEditorSim && !(broadcastmsg === null || broadcastmsg === void 0 ? void 0 : broadcastmsg.toParentIFrameOnly)) {
                    // send message to other editors
                    if (depEditors) {
                        depEditors.forEach(w => {
                            if (source !== w)
                                // dependant editors should be in the same origin
                                w.postMessage(msg, window.location.origin);
                        });
                        // start second simulator
                    }
                    else if (!single) {
                        const messageSimulator = messageChannel &&
                            this.options.messageSimulators &&
                            this.options.messageSimulators[messageChannel];
                        const simulatorExtension = messageChannel &&
                            this.options.simulatorExtensions &&
                            this.options.simulatorExtensions[messageChannel];
                        const startSimulatorExtension = (url, permanent, aspectRatio) => {
                            var _a;
                            aspectRatio = aspectRatio || ((_a = this._runOptions) === null || _a === void 0 ? void 0 : _a.aspectRatio) || 1.22;
                            let wrapper = this.createFrame(url);
                            this.container.appendChild(wrapper);
                            const messageFrame = wrapper.firstElementChild;
                            messageFrame.dataset[FRAME_DATA_MESSAGE_CHANNEL] = messageChannel;
                            messageFrame.dataset[FRAME_ASPECT_RATIO] = aspectRatio + "";
                            pxsim.U.addClass(wrapper, "simmsg");
                            pxsim.U.addClass(wrapper, "simmsg" + pxsim.U.sanitizeCssName(messageChannel));
                            if (permanent)
                                messageFrame.dataset[PERMANENT] = "true";
                            this.startFrame(messageFrame);
                            frames = this.simFrames(); // refresh
                        };
                        // should we start a simulator extension for this message?
                        if (simulatorExtension) {
                            // find a frame already running that simulator
                            let messageFrame = frames.find(frame => frame.dataset[FRAME_DATA_MESSAGE_CHANNEL] === messageChannel);
                            // not found, spin a new one
                            if (!messageFrame) {
                                const url = new URL(simulatorExtension.url);
                                // The extension's parent window is this editor, so the origin it
                                // should trust is the editor's own. options.parentOrigin is the
                                // editor's *embedder* origin (controller mode) - the extension's
                                // grandparent - so an extension that validates messages against
                                // it rejects everything the editor sends when the editor is
                                // embedded cross-origin.
                                // searchParams.set() encodes, so don't encode the values here.
                                url.searchParams.set("parentOrigin", window.location.origin);
                                if (this.options.userLanguage)
                                    url.searchParams.set("language", this.options.userLanguage);
                                startSimulatorExtension(url.toString(), simulatorExtension.permanent, simulatorExtension.aspectRatio);
                            }
                            // not running the current run, restart
                            else if (messageFrame.dataset['runid'] != this.runId) {
                                this.startFrame(messageFrame);
                            }
                        }
                        // (legacy: messageSimulator) should we start a message simulator for this message?
                        else if (messageSimulator) {
                            // find a frame already running that simulator
                            let messageFrame = frames.find(frame => frame.dataset[FRAME_DATA_MESSAGE_CHANNEL] === messageChannel);
                            // not found, spin a new one
                            if (!messageFrame) {
                                const useLocalHost = pxsim.U.isLocalHost() && /localhostmessagesims=1/i.test(window.location.href);
                                const url = ((useLocalHost && messageSimulator.localHostUrl) || messageSimulator.url)
                                    .replace("$PARENT_ORIGIN$", encodeURIComponent(this.options.parentOrigin || ""))
                                    .replace("$LANGUAGE$", encodeURIComponent(this.options.userLanguage));
                                startSimulatorExtension(url, messageSimulator.permanent, messageSimulator.aspectRatio);
                            }
                            // not running the curren run, restart
                            else if (messageFrame.dataset['runid'] != this.runId) {
                                this.startFrame(messageFrame);
                            }
                        }
                        else {
                            isDeferrableBroadcastMessage = true;
                            // start secondary frame if needed
                            if (!messageChannel &&
                                (mkcdFrames.length == 0 || mkcdFrames.length == 1 && !this.singleSimulator)) {
                                // messageChannel is set to false whenever msg.type !== "messagepacket"
                                // for example, in the case of msg.type === "radiopacket". However, in the case
                                // where we have msg.type === "messagepacket" and msg.channel is not matched by an
                                // extension, we don't want a second simulator to be created. 
                                this.container.appendChild(this.createFrame());
                                frames = this.simFrames();
                                // there might be an old frame
                            }
                            else if (mkcdFrames.length == 2 && mkcdFrames[1].dataset['runid'] != this.runId) {
                                this.startFrame(mkcdFrames[1]);
                            }
                        }
                    }
                }
            }
            // now that we have iframe starts,
            // dispatch message to other frames
            for (let i = 0; i < frames.length; ++i) {
                const frame = frames[i];
                // same frame as source
                if (source && frame.contentWindow == source)
                    continue;
                // if jacdac message, don't send to other (board) simulator frames
                if (i > 0 && !frame.dataset[FRAME_DATA_MESSAGE_CHANNEL] &&
                    msg.type === "messagepacket" && msg.channel === "jacdac")
                    continue;
                // frame not in DOM
                if (!frame.contentWindow)
                    continue;
                // finally, send the message
                if (isDeferrableBroadcastMessage) {
                    this.postDeferrableMessage(frame, msg);
                }
                else {
                    this.postMessageCore(frame, msg);
                }
                // don't start more than 1 recorder
                if (msg.type == 'recorder'
                    && msg.action == "start")
                    break;
            }
        }
        postDeferrableMessage(frame, msg) {
            const frameStarted = !frame.dataset["loading"];
            if (frameStarted) {
                this.postMessageCore(frame, msg);
            }
            else {
                if (!this.deferredMessages) {
                    this.deferredMessages = [];
                }
                this.deferredMessages.push([frame, msg]);
            }
        }
        postMessageCore(frame, msg) {
            const origin = pxsim.U.isLocalHostDev() ? "*" : frame.dataset["origin"];
            frame.contentWindow.postMessage(msg, origin);
        }
        setRunOptionQueryParams(url) {
            var _a, _b;
            const urlObject = new URL(url);
            if ((_a = this._runOptions) === null || _a === void 0 ? void 0 : _a.hideSimButtons) {
                urlObject.searchParams.set("hideSimButtons", "1");
            }
            if ((_b = this._runOptions) === null || _b === void 0 ? void 0 : _b.queryParameters) {
                const parameters = this._runOptions.queryParameters.split("&");
                for (const param of parameters) {
                    const [a, b] = param.split(/[:=]/);
                    if (a && b) {
                        urlObject.searchParams.set(a, b);
                    }
                }
            }
            return urlObject.toString();
        }
        createFrame(url) {
            var _a;
            const wrapper = document.createElement("div");
            wrapper.className = `simframe ui embed`;
            wrapper.setAttribute('tabindex', '0');
            const frame = document.createElement('iframe');
            frame.id = 'sim-frame-' + this.nextId();
            frame.title = pxsim.localization.lf("Simulator");
            frame.allowFullscreen = true;
            frame.setAttribute('allow', 'autoplay;microphone');
            frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            frame.className = 'no-select';
            let furl = this.setRunOptionQueryParams(url || this.getSimUrl().toString());
            furl += '#' + frame.id;
            frame.src = furl;
            frame.frameBorder = "0";
            frame.dataset['runid'] = this.runId;
            frame.dataset['origin'] = new URL(furl).origin || "*";
            frame.dataset['loading'] = "true";
            if ((_a = this._runOptions) === null || _a === void 0 ? void 0 : _a.autofocus)
                frame.setAttribute("autofocus", "true");
            wrapper.appendChild(frame);
            const i = document.createElement("i");
            i.className = "videoplay xicon icon";
            i.style.display = "none";
            i.onclick = (ev) => {
                ev.preventDefault();
                if (this.state != SimulatorState.Running
                    && this.state != SimulatorState.Starting) {
                    // we need to request to restart the simulator
                    if (this.options.restart)
                        this.options.restart();
                    else
                        this.start();
                }
                frame.focus();
                return false;
            };
            wrapper.appendChild(i);
            const l = document.createElement("div");
            l.className = "ui active loader";
            i.style.display = "none";
            wrapper.appendChild(l);
            if (this._runOptions)
                this.applyAspectRatioToFrame(frame);
            return wrapper;
        }
        preload(aspectRatio, clearRuntime) {
            this.addEventListeners();
            if (clearRuntime) {
                this._currentRuntime = undefined;
                this.container.textContent = "";
            }
            if (!this.simFrames().length) {
                this.container.appendChild(this.createFrame());
                this.applyAspectRatio(aspectRatio);
                this.setStarting();
            }
        }
        stop(unload = false, starting = false) {
            if (this.state !== SimulatorState.Stopped && this.state !== SimulatorState.Unloaded) {
                this.clearDebugger();
                this.stopSound();
                this.postMessage({ type: 'stop', source: MESSAGE_SOURCE });
                this.setState(starting ? SimulatorState.Starting : SimulatorState.Stopped);
            }
            if (unload)
                this.unload();
        }
        suspend() {
            this.stopSound();
            this.postMessage({ type: 'stop', source: MESSAGE_SOURCE });
            this.setState(SimulatorState.Suspended);
        }
        unload() {
            this.cancelFrameCleanup();
            pxsim.U.removeChildren(this.container);
            this.setState(SimulatorState.Unloaded);
            this._runOptions = undefined; // forget about program
            this._currentRuntime = undefined;
            this.runId = undefined;
            this.deferredMessages = undefined;
        }
        mute(mute) {
            if (this._currentRuntime)
                this._currentRuntime.mute = mute;
            this.postMessage({ type: 'mute', source: MESSAGE_SOURCE, mute: mute });
        }
        stopSound() {
            this.postMessage({ type: 'stopsound', source: MESSAGE_SOURCE });
        }
        isLoanedSimulator(el) {
            return !!this.loanedSimulator && this.loanedIFrame() == el;
        }
        // returns a simulator iframe that can be hosted anywhere in the page
        // while a loaned simulator is active, all other iframes are suspended
        loanSimulator() {
            if (this.loanedSimulator)
                return this.loanedSimulator;
            // reuse first simulator or create new one
            this.loanedSimulator = this.container.firstElementChild || this.createFrame();
            if (this.loanedSimulator.parentNode)
                this.container.removeChild(this.loanedSimulator);
            return this.loanedSimulator;
        }
        unloanSimulator() {
            if (this.loanedSimulator) {
                if (this.loanedSimulator.parentNode)
                    this.loanedSimulator.parentNode.removeChild(this.loanedSimulator);
                this.container.insertBefore(this.loanedSimulator, this.container.firstElementChild);
                delete this.loanedSimulator;
            }
        }
        loanedIFrame() {
            return this.loanedSimulator
                && this.loanedSimulator.parentNode
                && this.loanedSimulator.querySelector("iframe");
        }
        cancelFrameCleanup() {
            if (this.frameCleanupTimeout) {
                clearTimeout(this.frameCleanupTimeout);
                this.frameCleanupTimeout = undefined;
            }
        }
        scheduleFrameCleanup() {
            this.cancelFrameCleanup();
            this.frameCleanupTimeout = setTimeout(() => {
                this.frameCleanupTimeout = undefined;
                this.cleanupFrames();
            }, 5000);
        }
        applyAspectRatio(ratio) {
            if (!ratio && !this._runOptions)
                return;
            const frames = this.simFrames();
            frames.forEach(frame => this.applyAspectRatioToFrame(frame, ratio));
        }
        applyAspectRatioToFrame(frame, ratio) {
            var _a, _b, _c, _d;
            let r = ratio;
            // no ratio? try stored ratio
            if (r === undefined) {
                const rt = parseFloat(frame.dataset[FRAME_ASPECT_RATIO]);
                if (!isNaN(rt))
                    r = rt;
            }
            // no ratio?, try messagesims
            if (r === undefined) {
                const messageChannel = frame.dataset[FRAME_DATA_MESSAGE_CHANNEL];
                if (messageChannel) {
                    const messageSimulatorAspectRatio = (_c = (_b = (_a = this.options) === null || _a === void 0 ? void 0 : _a.messageSimulators) === null || _b === void 0 ? void 0 : _b[messageChannel]) === null || _c === void 0 ? void 0 : _c.aspectRatio;
                    if (messageSimulatorAspectRatio) {
                        r = messageSimulatorAspectRatio;
                    }
                }
            }
            // try default from options
            if (r === undefined)
                r = ((_d = this._runOptions) === null || _d === void 0 ? void 0 : _d.aspectRatio) || 1.22;
            // apply to css
            frame.parentElement.style.paddingBottom =
                (100 / r) + "%";
        }
        cleanupFrames() {
            // drop unused extras frames after 5 seconds
            const frames = this.simFrames(true);
            frames.shift(); // drop first frame
            frames.filter(frame => !frame.dataset[PERMANENT])
                .forEach(frame => {
                if (this.state == SimulatorState.Stopped
                    || frame.dataset['runid'] != this.runId) {
                    if (this.options.removeElement)
                        this.options.removeElement(frame.parentElement);
                    else
                        frame.parentElement.remove();
                }
            });
        }
        hide(completeHandler) {
            this.suspend();
            if (!this.options.removeElement)
                return;
            const frames = this.simFrames();
            frames.forEach(frame => {
                this.options.removeElement(frame.parentElement, completeHandler);
            });
            // Execute the complete handler if there are no frames in sim view
            if (frames.length == 0 && completeHandler) {
                completeHandler();
            }
        }
        unhide() {
            if (!this.options.unhideElement)
                return;
            const frames = this.simFrames();
            frames.forEach(frame => {
                this.options.unhideElement(frame.parentElement);
            });
        }
        setRunOptions(opts = {}) {
            this._runOptions = opts;
        }
        run(js, opts = {}) {
            this.setRunOptions(opts);
            this.runId = this.nextId();
            // store information
            this._currentRuntime = {
                type: "run",
                source: MESSAGE_SOURCE,
                boardDefinition: opts.boardDefinition,
                parts: opts.parts,
                builtinParts: opts.builtinParts,
                fnArgs: opts.fnArgs,
                code: js,
                partDefinitions: opts.partDefinitions,
                mute: opts.mute,
                highContrast: opts.highContrast,
                light: opts.light,
                cdnUrl: opts.cdnUrl,
                localizedStrings: opts.localizedStrings,
                refCountingDebug: opts.refCountingDebug,
                version: opts.version,
                clickTrigger: opts.clickTrigger,
                breakOnStart: opts.breakOnStart,
                storedState: opts.storedState,
                ipc: opts.ipc,
                single: opts.single,
                dependencies: opts.dependencies,
                activePlayer: opts.activePlayer,
                theme: opts.theme,
            };
            this.stopSound();
            this.start();
        }
        restart() {
            this.stop();
            this.cleanupFrames();
            this.start();
        }
        areBreakpointsSet() {
            return this.breakpointsSet;
        }
        start() {
            this.clearDebugger();
            this.addEventListeners();
            this.applyAspectRatio();
            this.scheduleFrameCleanup();
            if (!this._currentRuntime)
                return; // nothing to do
            this.singleSimulator = false;
            this.breakpointsSet = false;
            // first frame
            let frame = this.simFrames()[0];
            if (!frame) {
                let wrapper = this.createFrame();
                this.container.appendChild(wrapper);
                frame = wrapper.firstElementChild;
            }
            this.startFrame(frame);
            this.debuggingFrame = frame.id;
            this.setState(SimulatorState.Running);
            this.setTraceInterval(this.traceInterval);
        }
        // ensure _currentRuntime is ready
        startFrame(frame) {
            var _a, _b, _c;
            if (!this._currentRuntime || !frame.contentWindow)
                return false;
            const msg = JSON.parse(JSON.stringify(this._currentRuntime));
            msg.frameCounter = ++this.frameCounter;
            const mpRole = ((_a = this._runOptions) === null || _a === void 0 ? void 0 : _a.mpRole) || ((_c = (_b = /[\&\?]mp=(server|client)/i.exec(window.location.href)) === null || _b === void 0 ? void 0 : _b[1]) === null || _c === void 0 ? void 0 : _c.toLowerCase());
            msg.options = {
                theme: this.themes[this.nextFrameId++ % this.themes.length],
                mpRole
            };
            msg.id = `${msg.options.theme}-${this.nextId()}`;
            frame.dataset['runid'] = this.runId;
            frame.dataset['runtimeid'] = msg.id;
            if (frame.id !== this.debuggingFrame) {
                msg.traceDisabled = true;
                msg.breakOnStart = false;
            }
            this.postMessageCore(frame, msg);
            if (this.traceInterval)
                this.setTraceInterval(this.traceInterval);
            this.applyAspectRatioToFrame(frame);
            this.setFrameState(frame);
            return true;
        }
        handleDeferredMessages(frame) {
            var _a, _b, _c;
            if (frame.dataset["loading"]) {
                delete frame.dataset["loading"];
                (_b = (_a = this.deferredMessages) === null || _a === void 0 ? void 0 : _a.filter(defMsg => defMsg[0] === frame)) === null || _b === void 0 ? void 0 : _b.forEach(defMsg => {
                    const [_, msg] = defMsg;
                    this.postMessageCore(frame, msg);
                });
                this.deferredMessages = (_c = this.deferredMessages) === null || _c === void 0 ? void 0 : _c.filter(defMsg => defMsg[0] !== frame);
            }
        }
        handleMessage(msg, source) {
            var _a, _b, _c;
            switch (msg.type || '') {
                case 'ready': {
                    const frameid = msg.frameid;
                    const frame = document.getElementById(frameid);
                    if (frame) {
                        if ((_a = this._runOptions) === null || _a === void 0 ? void 0 : _a.autofocus)
                            frame.focus();
                        this.startFrame(frame);
                        if (this.options.revealElement)
                            this.options.revealElement(frame);
                        this.handleDeferredMessages(frame);
                    }
                    if (this.options.onSimulatorReady)
                        this.options.onSimulatorReady();
                    break;
                }
                case 'status': {
                    const frameid = msg.frameid;
                    const frame = document.getElementById(frameid);
                    if (frame) {
                        const stmsg = msg;
                        if (stmsg.runtimeid == frame.dataset['runtimeid']) {
                            switch (stmsg.state) {
                                case "running":
                                    this.setState(SimulatorState.Running);
                                    this.handleDeferredMessages(frame);
                                    break;
                                case "killed":
                                    this.setState(SimulatorState.Stopped);
                                    break;
                            }
                        }
                    }
                    break;
                }
                case 'simulator':
                    this.handleSimulatorCommand(msg);
                    break; //handled elsewhere
                case 'serial':
                case 'pxteditor':
                case 'screenshot':
                case 'custom':
                case 'recorder':
                case 'addextensions':
                    break; //handled elsewhere
                case 'aspectratio': {
                    const asmsg = msg;
                    const frameid = asmsg.frameid;
                    const frame = document.getElementById(frameid);
                    if (frame) {
                        frame.dataset[FRAME_ASPECT_RATIO] = asmsg.value + "";
                        this.applyAspectRatioToFrame(frame);
                    }
                    break;
                }
                case 'debugger':
                    this.handleDebuggerMessage(msg);
                    break;
                case 'toplevelcodefinished':
                    if (this.options.onTopLevelCodeEnd)
                        this.options.onTopLevelCodeEnd();
                    break;
                case 'setmutebuttonstate':
                    (_c = (_b = this.options).onMuteButtonStateChange) === null || _c === void 0 ? void 0 : _c.call(_b, msg.state);
                    break;
                default:
                    this.postMessage(msg, source);
                    break;
            }
        }
        addEventListeners() {
            if (!this.listener) {
                this.listener = (ev) => {
                    if (this.hwdbg)
                        return;
                    if (pxsim.U.isLocalHost()) {
                        // no-op
                    }
                    else {
                        if (this._allowedOrigins.indexOf(ev.origin) < 0)
                            return;
                    }
                    this.handleMessage(ev.data, ev.source);
                };
                window.addEventListener('message', this.listener, false);
            }
        }
        removeEventListeners() {
            if (this.listener) {
                window.removeEventListener('message', this.listener, false);
                this.listener = undefined;
            }
        }
        resume(c) {
            let msg;
            switch (c) {
                case SimulatorDebuggerCommand.Resume:
                    msg = 'resume';
                    this.setState(SimulatorState.Running);
                    break;
                case SimulatorDebuggerCommand.StepInto:
                    msg = 'stepinto';
                    this.setState(SimulatorState.Running);
                    break;
                case SimulatorDebuggerCommand.StepOut:
                    msg = 'stepout';
                    this.setState(SimulatorState.Running);
                    break;
                case SimulatorDebuggerCommand.StepOver:
                    msg = 'stepover';
                    this.setState(SimulatorState.Running);
                    break;
                case SimulatorDebuggerCommand.Pause:
                    msg = 'pause';
                    break;
                default:
                    pxsim.debug('unknown command');
                    return;
            }
            this.postMessage({ type: 'debugger', subtype: msg, source: MESSAGE_SOURCE });
        }
        setBreakpoints(breakPoints) {
            this.breakpointsSet = true;
            this.postDebuggerMessage("config", { setBreakpoints: breakPoints }, undefined, this.debuggingFrame);
        }
        setTraceInterval(intervalMs) {
            this.traceInterval = intervalMs;
            // Send to all frames so that they all run at the same speed, even though only the debugging sim
            // will actually send events
            this.postDebuggerMessage("traceConfig", { interval: intervalMs });
        }
        variablesAsync(id, fields, includeAll = false) {
            return this.postDebuggerMessageAsync("variables", { variablesReference: id, fields: fields, includeAll }, this.debuggingFrame)
                .then(msg => msg, e => undefined);
        }
        handleSimulatorCommand(msg) {
            if (this.options.onSimulatorCommand)
                this.options.onSimulatorCommand(msg);
        }
        clearDebugger() {
            const e = new Error("Debugging cancelled");
            Object.keys(this.debuggerResolvers)
                .forEach(k => {
                const { reject } = this.debuggerResolvers[k];
                reject(e);
            });
            this.debuggerResolvers = {};
            this.debuggerSeq++;
        }
        handleDebuggerMessage(msg) {
            if (msg.subtype !== "trace") {
                pxsim.log("DBG-MSG", msg.subtype, msg);
            }
            // resolve any request
            if (msg.seq) {
                const { resolve } = this.debuggerResolvers[msg.seq];
                if (resolve)
                    resolve(msg);
            }
            switch (msg.subtype) {
                case "warning":
                    if (this.options.onDebuggerWarning)
                        this.options.onDebuggerWarning(msg);
                    break;
                case "breakpoint": {
                    const brk = msg;
                    if (this.state == SimulatorState.Running) {
                        if (brk.exceptionMessage) {
                            this.suspend();
                        }
                        else {
                            this.setState(SimulatorState.Paused);
                            const frames = this.simFrames(true);
                            if (frames.length > 1) {
                                // Make sure all frames pause
                                this.resume(SimulatorDebuggerCommand.Pause);
                            }
                        }
                        if (this.options.onDebuggerBreakpoint)
                            this.options.onDebuggerBreakpoint(brk);
                        let stackTrace = brk.exceptionMessage + "\n";
                        for (let s of brk.stackframes) {
                            let fi = s.funcInfo;
                            stackTrace += `   at ${fi.functionName} (${fi.fileName}:${fi.line + 1}:${fi.column + 1})\n`;
                        }
                        if (brk.exceptionMessage)
                            pxsim.error(stackTrace);
                    }
                    else {
                        pxsim.error("debugger: trying to pause from " + this.state);
                    }
                    break;
                }
                case "trace": {
                    const brk = msg;
                    if (this.state == SimulatorState.Running && this.options.onTraceMessage) {
                        this.options.onTraceMessage(brk);
                    }
                    break;
                }
                default:
                    const seq = msg.req_seq;
                    if (seq) {
                        const { resolve } = this.debuggerResolvers[seq];
                        if (resolve) {
                            delete this.debuggerResolvers[seq];
                            resolve(msg);
                        }
                    }
                    break;
            }
        }
        postDebuggerMessageAsync(subtype, data = {}, frameID) {
            return new Promise((resolve, reject) => {
                const seq = this.debuggerSeq++;
                this.debuggerResolvers[seq.toString()] = { resolve, reject };
                this.postDebuggerMessage(subtype, data, seq, frameID);
            });
        }
        postDebuggerMessage(subtype, data = {}, seq, frameID) {
            const msg = JSON.parse(JSON.stringify(data));
            msg.type = "debugger";
            msg.subtype = subtype;
            msg.source = MESSAGE_SOURCE;
            if (seq)
                msg.seq = seq;
            this.postMessage(msg, undefined, frameID);
        }
        nextId() {
            return this.nextFrameId++ + (Math.random() + '' + Math.random()).replace(/[^\d]/, '');
        }
        get stoppedClass() {
            return (this.options && this.options.stoppedClass) || "grayscale";
        }
        get invalidatedClass() {
            return (this.options && this.options.invalidatedClass) || "sepia";
        }
    }
    pxsim.SimulatorDriver = SimulatorDriver;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    ;
    ;
    function mkRange(a, b) {
        let res = [];
        for (; a < b; a++)
            res.push(a);
        return res;
    }
    pxsim.mkRange = mkRange;
    class EventBus {
        constructor(runtime, board, valueToArgs) {
            this.runtime = runtime;
            this.board = board;
            this.valueToArgs = valueToArgs;
            this.queues = {};
            this.backgroundHandlerFlag = false;
            this.nextNotifyEvent = 1024;
            this.schedulerID = 15; // DEVICE_ID_SCHEDULER
            this.idleEventID = 2; // DEVICE_SCHEDULER_EVT_IDLE
            this.board.addMessageListener(this.handleMessage.bind(this));
        }
        handleMessage(msg) {
            if (msg.type === "eventbus") {
                const ev = msg;
                this.queue(ev.id, ev.eventid, ev.value);
            }
        }
        setBackgroundHandlerFlag() {
            this.backgroundHandlerFlag = true;
        }
        setNotify(notifyID, notifyOneID) {
            this.notifyID = notifyID;
            this.notifyOneID = notifyOneID;
        }
        setIdle(schedulerID, idleEventID) {
            this.schedulerID = schedulerID;
            this.idleEventID = idleEventID;
        }
        start(id, evid, background, create = false) {
            let key = (background ? "back" : "fore") + ":" + id + ":" + evid;
            if (!this.queues[key] && create)
                this.queues[key] = new pxsim.EventQueue(this.runtime, this.valueToArgs);
            return this.queues[key];
        }
        listen(id, evid, handler, flags = 0) {
            // special handle for idle, start the idle timeout
            if (id == this.schedulerID && evid == this.idleEventID)
                this.runtime.startIdle();
            let q = this.start(id, evid, this.backgroundHandlerFlag, true);
            if (this.backgroundHandlerFlag) {
                q.addHandler(handler, flags);
            }
            else {
                q.setHandler(handler, flags);
            }
            this.backgroundHandlerFlag = false;
        }
        removeBackgroundHandler(handler) {
            Object.keys(this.queues).forEach((k) => {
                if (k.startsWith("back:"))
                    this.queues[k].removeHandler(handler);
            });
        }
        // this handles ANY (0) semantics for id and evid
        getQueues(id, evid, bg) {
            let ret = [this.start(0, 0, bg)];
            if (id == 0 && evid == 0)
                return ret;
            if (evid)
                ret.push(this.start(0, evid, bg));
            if (id)
                ret.push(this.start(id, 0, bg));
            if (id && evid)
                ret.push(this.start(id, evid, bg));
            return ret;
        }
        queue(id, evid, value = null) {
            if (pxsim.runtime.pausedOnBreakpoint)
                return;
            // special handling for notify one
            const notifyOne = this.notifyID && this.notifyOneID && id == this.notifyOneID;
            if (notifyOne)
                id = this.notifyID;
            let queues = this.getQueues(id, evid, true).concat(this.getQueues(id, evid, false));
            this.lastEventValue = evid;
            this.lastEventTimestampUs = pxsim.U.perfNowUs();
            pxsim.U.promiseMapAllSeries(queues, q => {
                if (q)
                    return q.push(value, notifyOne);
                else
                    return Promise.resolve();
            });
        }
        queueIdle() {
            if (this.schedulerID && this.idleEventID)
                this.queue(this.schedulerID, this.idleEventID);
        }
        // only for foreground handlers
        wait(id, evid, cb) {
            let q = this.start(id, evid, false, true);
            q.addAwaiter(cb);
        }
        getLastEventValue() {
            return this.lastEventValue;
        }
        getLastEventTime() {
            return 0xffffffff & (this.lastEventTimestampUs - pxsim.runtime.startTimeUs);
        }
    }
    pxsim.EventBus = EventBus;
    class AnimationQueue {
        constructor(runtime) {
            this.runtime = runtime;
            this.queue = [];
            this.process = () => {
                let top = this.queue[0];
                if (!top)
                    return;
                if (this.runtime.dead)
                    return;
                runtime = this.runtime;
                let res = top.frame();
                runtime.queueDisplayUpdate();
                runtime.maybeUpdateDisplay();
                if (res === false) {
                    this.queue.shift();
                    // if there is already something in the queue, start processing
                    if (this.queue[0]) {
                        this.queue[0].setTimeoutHandle = setTimeout(this.process, this.queue[0].interval);
                    }
                    // this may push additional stuff
                    top.whenDone(false);
                }
                else {
                    top.setTimeoutHandle = setTimeout(this.process, top.interval);
                }
            };
        }
        cancelAll() {
            let q = this.queue;
            this.queue = [];
            for (let a of q) {
                a.whenDone(true);
                if (a.setTimeoutHandle) {
                    clearTimeout(a.setTimeoutHandle);
                }
            }
        }
        cancelCurrent() {
            let top = this.queue[0];
            if (top) {
                this.queue.shift();
                top.whenDone(true);
                if (top.setTimeoutHandle) {
                    clearTimeout(top.setTimeoutHandle);
                }
            }
        }
        enqueue(anim) {
            if (!anim.whenDone)
                anim.whenDone = () => { };
            this.queue.push(anim);
            // we start processing when the queue goes from 0 to 1
            if (this.queue.length == 1)
                this.process();
        }
        executeAsync(anim) {
            pxsim.U.assert(!anim.whenDone);
            return new Promise((resolve, reject) => {
                anim.whenDone = resolve;
                this.enqueue(anim);
            });
        }
    }
    pxsim.AnimationQueue = AnimationQueue;
    function isTouchEnabled() {
        return typeof window !== "undefined" &&
            ('ontouchstart' in window // works on most browsers
                || (navigator && navigator.maxTouchPoints > 0)); // works on IE10/11 and Surface);
    }
    pxsim.isTouchEnabled = isTouchEnabled;
    function hasPointerEvents() {
        return typeof window != "undefined" && !!window.PointerEvent;
    }
    pxsim.hasPointerEvents = hasPointerEvents;
    pxsim.pointerEvents = hasPointerEvents() ? {
        up: "pointerup",
        down: ["pointerdown"],
        move: "pointermove",
        enter: "pointerenter",
        leave: "pointerleave"
    } : isTouchEnabled() ?
        {
            up: "mouseup",
            down: ["mousedown", "touchstart"],
            move: "touchmove",
            enter: "touchenter",
            leave: "touchend"
        } :
        {
            up: "mouseup",
            down: ["mousedown"],
            move: "mousemove",
            enter: "mouseenter",
            leave: "mouseleave"
        };
})(pxsim || (pxsim = {}));
(function (pxsim) {
    var visuals;
    (function (visuals) {
        function translateEl(el, xy) {
            //TODO append translation instead of replacing the full transform
            pxsim.svg.hydrate(el, { transform: `translate(${xy[0]} ${xy[1]})` });
        }
        visuals.translateEl = translateEl;
        function composeSVG(opts) {
            let [a, b] = [opts.el1, opts.el2];
            pxsim.U.assert(a.x == 0 && a.y == 0 && b.x == 0 && b.y == 0, "el1 and el2 x,y offsets not supported");
            let setXY = (e, x, y) => pxsim.svg.hydrate(e, { x: x, y: y });
            let setWH = (e, w, h) => {
                if (w)
                    pxsim.svg.hydrate(e, { width: w });
                if (h)
                    pxsim.svg.hydrate(e, { height: h });
            };
            let setWHpx = (e, w, h) => pxsim.svg.hydrate(e, { width: `${w}px`, height: `${h}px` });
            let scaleUnit = opts.scaleUnit2;
            let aScalar = opts.scaleUnit2 / opts.scaleUnit1;
            let bScalar = 1.0;
            let aw = a.w * aScalar;
            let ah = a.h * aScalar;
            setWHpx(a.el, aw, ah);
            let bw = b.w * bScalar;
            let bh = b.h * bScalar;
            setWHpx(b.el, bw, bh);
            let [mt, mr, mb, ml] = opts.margin;
            let mm = opts.middleMargin;
            let innerW = Math.max(aw, bw);
            let ax = mr + (innerW - aw) / 2.0;
            let ay = mt;
            setXY(a.el, ax, ay);
            let bx = mr + (innerW - bw) / 2.0;
            let by = ay + ah + mm;
            setXY(b.el, bx, by);
            let edges = [ay, ay + ah, by, by + bh];
            let w = mr + innerW + ml;
            let h = mt + ah + mm + bh + mb;
            let host = pxsim.svg.elt("svg", {
                "version": "1.0",
                "viewBox": `0 0 ${w} ${h}`,
                "class": `sim-bb`,
            });
            setWH(host, opts.maxWidth, opts.maxHeight);
            setXY(host, 0, 0);
            let under = pxsim.svg.child(host, "g");
            host.appendChild(a.el);
            host.appendChild(b.el);
            let over = pxsim.svg.child(host, "g");
            let toHostCoord1 = (xy) => {
                let [x, y] = xy;
                return [x * aScalar + ax, y * aScalar + ay];
            };
            let toHostCoord2 = (xy) => {
                let [x, y] = xy;
                return [x * bScalar + bx, y * bScalar + by];
            };
            return {
                under: under,
                over: over,
                host: host,
                edges: edges,
                scaleUnit: scaleUnit,
                toHostCoord1: toHostCoord1,
                toHostCoord2: toHostCoord2,
            };
        }
        visuals.composeSVG = composeSVG;
        function mkScaleFn(originUnit, targetUnit) {
            return (n) => n * (targetUnit / originUnit);
        }
        visuals.mkScaleFn = mkScaleFn;
        function mkImageSVG(opts) {
            let scaleFn = mkScaleFn(opts.imageUnitDist, opts.targetUnitDist);
            let w = scaleFn(opts.width);
            let h = scaleFn(opts.height);
            let img = pxsim.svg.elt("image", {
                width: w,
                height: h
            });
            let href = img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `${opts.image}`);
            return { el: img, w: w, h: h, x: 0, y: 0 };
        }
        visuals.mkImageSVG = mkImageSVG;
        function findDistSqrd(a, b) {
            let x = a[0] - b[0];
            let y = a[1] - b[1];
            return x * x + y * y;
        }
        visuals.findDistSqrd = findDistSqrd;
        function findClosestCoordIdx(a, bs) {
            let dists = bs.map(b => findDistSqrd(a, b));
            let minIdx = dists.reduce((prevIdx, currDist, currIdx, arr) => {
                return currDist < arr[prevIdx] ? currIdx : prevIdx;
            }, 0);
            return minIdx;
        }
        visuals.findClosestCoordIdx = findClosestCoordIdx;
        function mkTxt(cx, cy, size, rot, txt, txtXOffFactor, txtYOffFactor) {
            let el = pxsim.svg.elt("text");
            //HACK: these constants (txtXOffFactor, txtYOffFactor) tweak the way this algorithm knows how to center the text
            txtXOffFactor = txtXOffFactor || -0.33333;
            txtYOffFactor = txtYOffFactor || 0.3;
            const xOff = txtXOffFactor * size * txt.length;
            const yOff = txtYOffFactor * size;
            pxsim.svg.hydrate(el, {
                style: `font-size:${size}px;`,
                transform: `translate(${cx} ${cy}) rotate(${rot}) translate(${xOff} ${yOff})`
            });
            pxsim.U.addClass(el, "noselect");
            el.textContent = txt;
            return el;
        }
        visuals.mkTxt = mkTxt;
        visuals.GPIO_WIRE_COLORS = ["pink", "orange", "yellow", "green", "purple"];
        visuals.WIRE_COLOR_MAP = {
            black: "#514f4d",
            white: "#fcfdfc",
            gray: "#acabab",
            purple: "#a772a1",
            blue: "#01a6e8",
            green: "#3cce73",
            yellow: "#ece600",
            orange: "#fdb262",
            red: "#f44f43",
            brown: "#c89764",
            pink: "#ff80fa"
        };
        function mapWireColor(clr) {
            return visuals.WIRE_COLOR_MAP[clr] || clr;
        }
        visuals.mapWireColor = mapWireColor;
        ;
        visuals.PIN_DIST = 15;
        //expects rgb from 0,255, gives h in [0,360], s in [0, 100], l in [0, 100]
        function rgbToHsl(rgb) {
            let [r, g, b] = rgb;
            let [r$, g$, b$] = [r / 255, g / 255, b / 255];
            let cMin = Math.min(r$, g$, b$);
            let cMax = Math.max(r$, g$, b$);
            let cDelta = cMax - cMin;
            let h, s, l;
            let maxAndMin = cMax + cMin;
            //lum
            l = (maxAndMin / 2) * 100;
            if (cDelta === 0)
                s = h = 0;
            else {
                //hue
                if (cMax === r$)
                    h = 60 * (((g$ - b$) / cDelta) % 6);
                else if (cMax === g$)
                    h = 60 * (((b$ - r$) / cDelta) + 2);
                else if (cMax === b$)
                    h = 60 * (((r$ - g$) / cDelta) + 4);
                //sat
                if (l > 50)
                    s = 100 * (cDelta / (2 - maxAndMin));
                else
                    s = 100 * (cDelta / maxAndMin);
            }
            return [Math.floor(h), Math.floor(s), Math.floor(l)];
        }
        visuals.rgbToHsl = rgbToHsl;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var svg;
    (function (svg_1) {
        function parseString(xml) {
            return new DOMParser().parseFromString(xml, "image/svg+xml").getElementsByTagName("svg").item(0);
        }
        svg_1.parseString = parseString;
        function toDataUri(xml) {
            return 'data:image/svg+xml,' + encodeURI(xml);
        }
        svg_1.toDataUri = toDataUri;
        let pt;
        function cursorPoint(pt, svg, evt) {
            // clientX and clientY are not defined in iOS safari
            pt.x = evt.clientX != null ? evt.clientX : evt.pageX;
            pt.y = evt.clientY != null ? evt.clientY : evt.pageY;
            return pt.matrixTransform(svg.getScreenCTM().inverse());
        }
        svg_1.cursorPoint = cursorPoint;
        function rotateElement(el, originX, originY, degrees) {
            el.setAttribute('transform', `translate(${originX},${originY}) rotate(${degrees + 90}) translate(${-originX},${-originY})`);
        }
        svg_1.rotateElement = rotateElement;
        function hydrate(el, props) {
            for (let k in props) {
                if (k == "title") {
                    svg.title(el, props[k]);
                }
                else
                    el.setAttributeNS(null, k, props[k]);
            }
        }
        svg_1.hydrate = hydrate;
        function elt(name, props) {
            let el = document.createElementNS("http://www.w3.org/2000/svg", name);
            if (props)
                svg.hydrate(el, props);
            return el;
        }
        svg_1.elt = elt;
        function child(parent, name, props) {
            let el = svg.elt(name, props);
            parent.appendChild(el);
            return el;
        }
        svg_1.child = child;
        function mkPath(cls, data, title) {
            let p = { class: cls, d: data };
            if (title)
                p["title"] = title;
            let el = svg.elt("path");
            svg.hydrate(el, p);
            return el;
        }
        svg_1.mkPath = mkPath;
        function path(parent, cls, data, title) {
            let el = mkPath(cls, data, title);
            parent.appendChild(el);
            return el;
        }
        svg_1.path = path;
        function fill(el, c) {
            el.style.fill = c;
        }
        svg_1.fill = fill;
        function filter(el, c) {
            el.style.filter = c;
        }
        svg_1.filter = filter;
        function fills(els, c) {
            els.forEach(el => el.style.fill = c);
        }
        svg_1.fills = fills;
        function isTouchEnabled() {
            return typeof window !== "undefined" &&
                ('ontouchstart' in window // works on most browsers
                    || navigator.maxTouchPoints > 0); // works on IE10/11 and Surface);
        }
        svg_1.isTouchEnabled = isTouchEnabled;
        function onClick(el, click) {
            let captured = false;
            pxsim.pointerEvents.down.forEach(evid => el.addEventListener(evid, (ev) => {
                captured = true;
                return true;
            }, false));
            el.addEventListener(pxsim.pointerEvents.up, (ev) => {
                if (captured) {
                    captured = false;
                    click(ev);
                    ev.preventDefault();
                    return false;
                }
                return true;
            }, false);
        }
        svg_1.onClick = onClick;
        function buttonEvents(el, move, start, stop, keydown) {
            let captured = false;
            pxsim.pointerEvents.down.forEach(evid => el.addEventListener(evid, (ev) => {
                captured = true;
                if (start)
                    start(ev);
                return true;
            }, false));
            el.addEventListener(pxsim.pointerEvents.move, (ev) => {
                if (captured) {
                    if (move)
                        move(ev);
                    ev.preventDefault();
                    return false;
                }
                return true;
            }, false);
            el.addEventListener(pxsim.pointerEvents.up, (ev) => {
                captured = false;
                if (stop)
                    stop(ev);
            }, false);
            el.addEventListener(pxsim.pointerEvents.leave, (ev) => {
                captured = false;
                if (stop)
                    stop(ev);
            }, false);
            el.addEventListener('keydown', (ev) => {
                captured = false;
                if (keydown)
                    keydown(ev);
            });
        }
        svg_1.buttonEvents = buttonEvents;
        function mkLinearGradient(id, horizontal = false) {
            let gradient = svg.elt("linearGradient");
            svg.hydrate(gradient, { id: id, x1: "0%", y1: "0%", x2: horizontal ? "100%" : "0%", y2: horizontal ? "0%" : "100%" });
            let stop1 = svg.child(gradient, "stop", { offset: "0%" });
            let stop2 = svg.child(gradient, "stop", { offset: "100%" });
            let stop3 = svg.child(gradient, "stop", { offset: "100%" });
            let stop4 = svg.child(gradient, "stop", { offset: "100%" });
            return gradient;
        }
        svg_1.mkLinearGradient = mkLinearGradient;
        function linearGradient(defs, id, horizontal = false) {
            let lg = mkLinearGradient(id, horizontal);
            defs.appendChild(lg);
            return lg;
        }
        svg_1.linearGradient = linearGradient;
        function setGradientColors(lg, start, end) {
            if (!lg)
                return;
            lg.childNodes[0].style.stopColor = start;
            lg.childNodes[1].style.stopColor = start;
            lg.childNodes[2].style.stopColor = end;
            lg.childNodes[3].style.stopColor = end;
        }
        svg_1.setGradientColors = setGradientColors;
        function setGradientValue(lg, percent) {
            if (lg.childNodes[1].getAttribute("offset") != percent) {
                lg.childNodes[1].setAttribute("offset", percent);
                lg.childNodes[2].setAttribute("offset", percent);
            }
        }
        svg_1.setGradientValue = setGradientValue;
        function animate(el, cls) {
            pxsim.U.addClass(el, cls);
            let p = el.parentElement;
            if (p) {
                p.removeChild(el);
                p.appendChild(el);
            }
        }
        svg_1.animate = animate;
        function mkTitle(txt) {
            let t = svg.elt("title");
            t.textContent = txt;
            return t;
        }
        svg_1.mkTitle = mkTitle;
        function title(el, txt) {
            let t = mkTitle(txt);
            el.appendChild(t);
            return t;
        }
        svg_1.title = title;
        function toHtmlColor(c) {
            const b = c & 0xFF;
            const g = (c >> 8) & 0xFF;
            const r = (c >> 16) & 0xFF;
            const a = (c >> 24) & 0xFF / 255;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        svg_1.toHtmlColor = toHtmlColor;
    })(svg = pxsim.svg || (pxsim.svg = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        class AudioSource {
            constructor(context, destination) {
                this.vca = context.createGain();
                this.vca.gain.value = 1;
                this.vca.connect(destination);
                AudioSource.activeSources.push(this);
            }
            static stopAll() {
                const activeSources = AudioSource.activeSources;
                AudioSource.activeSources = [];
                for (const source of activeSources) {
                    source.dispose();
                }
            }
            dispose() {
                if (this.isDisposed())
                    return;
                this.vca.disconnect();
                this.vca = undefined;
                const index = AudioSource.activeSources.indexOf(this);
                if (index !== -1) {
                    AudioSource.activeSources.splice(index, 1);
                }
            }
            isDisposed() {
                return !this.vca;
            }
        }
        AudioSource.activeSources = [];
        AudioContextManager.AudioSource = AudioSource;
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
/// <reference path="./audioSource.ts" />
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        class AudioBufferSource extends AudioContextManager.AudioSource {
            constructor(context, destination) {
                super(context, destination);
                this.bufferSource = context.createBufferSource();
                this.bufferSource.connect(this.vca);
            }
            async playBufferAsync(buffer, playbackRate, gain) {
                return new Promise((resolve, reject) => {
                    this.vca.gain.value = gain;
                    this.bufferSource.onended = () => resolve();
                    this.bufferSource.buffer = buffer;
                    this.bufferSource.playbackRate.value = playbackRate;
                    this.bufferSource.start();
                });
            }
            dispose() {
                super.dispose();
                this.bufferSource.disconnect();
                this.bufferSource.stop();
                this.bufferSource = undefined;
            }
        }
        AudioContextManager.AudioBufferSource = AudioBufferSource;
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
/// <reference path="./audioSource.ts" />
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        const MAX_SCHEDULED_BUFFER_NODES = 3;
        class AudioBufferStreamSource extends AudioContextManager.AudioSource {
            constructor(context, destination) {
                super(context, destination);
                this.context = context;
            }
            playStreamAsync(pull, sampleRate, volume = 0.3, isCancelled) {
                return new Promise(resolve => {
                    let nodes = [];
                    let nextTime = this.context.currentTime;
                    let allScheduled = false;
                    this.vca.gain.setValueAtTime(volume, nextTime);
                    const checkCancel = () => {
                        if (!this.vca || (isCancelled === null || isCancelled === void 0 ? void 0 : isCancelled())) {
                            if (resolve)
                                resolve();
                            resolve = undefined;
                            return true;
                        }
                        return false;
                    };
                    // Every time we pull a buffer, schedule a node in the future to play it.
                    // Scheduling the nodes ahead of time sounds much smoother than trying to
                    // do it when the previous node completes (which sounds SUPER choppy in
                    // FireFox).
                    const playNext = () => {
                        while (!allScheduled && nodes.length < MAX_SCHEDULED_BUFFER_NODES && !checkCancel()) {
                            const data = pull();
                            if (!data || !data.length) {
                                allScheduled = true;
                                break;
                            }
                            play(data);
                        }
                        if ((allScheduled && nodes.length === 0)) {
                            if (resolve)
                                resolve();
                            resolve = undefined;
                        }
                    };
                    const play = (data) => {
                        if (checkCancel())
                            return;
                        const buff = this.context.createBuffer(1, data.length, sampleRate);
                        if (buff.copyToChannel) {
                            buff.copyToChannel(data, 0);
                        }
                        else {
                            const channelBuffer = buff.getChannelData(0);
                            for (let i = 0; i < data.length; i++) {
                                channelBuffer[i] = data[i];
                            }
                        }
                        // Audio buffer source nodes are supposedly very cheap, so no need to reuse them
                        const newNode = this.context.createBufferSource();
                        nodes.push(newNode);
                        newNode.connect(this.vca);
                        newNode.buffer = buff;
                        newNode.addEventListener("ended", () => {
                            nodes.shift().disconnect();
                            playNext();
                        });
                        newNode.start(nextTime);
                        nextTime += buff.duration;
                    };
                    playNext();
                });
            }
        }
        AudioContextManager.AudioBufferStreamSource = AudioBufferStreamSource;
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        let _context;
        let _mute = false; //mute audio
        // for playing WAV
        let audio;
        let stopAllListeners = [];
        // All other nodes get connected to this node which is connected to the actual
        // destination. Used for muting
        let destination;
        function isAudioElementActive() {
            return AudioContextManager.AudioToneSource.isActive();
        }
        AudioContextManager.isAudioElementActive = isAudioElementActive;
        function context() {
            if (!_context) {
                _context = freshContext();
                if (_context) {
                    destination = _context.createGain();
                    destination.connect(_context.destination);
                    destination.gain.setValueAtTime(1, 0);
                }
            }
            return _context;
        }
        function freshContext() {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            if (window.AudioContext) {
                try {
                    // this call my crash.
                    // SyntaxError: audio resources unavailable for AudioContext construction
                    return new window.AudioContext();
                }
                catch (e) { }
            }
            return undefined;
        }
        function mute(mute) {
            _mute = mute;
            const ctx = context();
            if (mute) {
                destination.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
            }
            else {
                destination.gain.setTargetAtTime(1, ctx.currentTime, 0.015);
            }
            if (!mute && ctx && ctx.state === "suspended")
                ctx.resume();
        }
        AudioContextManager.mute = mute;
        function isMuted() {
            return _mute;
        }
        AudioContextManager.isMuted = isMuted;
        function stopTone() {
            AudioContextManager.AudioToneSource.setCurrentToneGain(0, context().currentTime);
            if (audio) {
                audio.pause();
            }
        }
        function stopAll() {
            muteAllChannels();
        }
        AudioContextManager.stopAll = stopAll;
        function stop() {
            stopTone();
        }
        AudioContextManager.stop = stop;
        function onStopAll(handler) {
            stopAllListeners.push(handler);
        }
        AudioContextManager.onStopAll = onStopAll;
        function frequency() {
            return AudioContextManager.AudioToneSource.getFrequency();
        }
        AudioContextManager.frequency = frequency;
        let instrStopId = 1;
        function muteAllChannels() {
            AudioContextManager.soundEventCallback === null || AudioContextManager.soundEventCallback === void 0 ? void 0 : AudioContextManager.soundEventCallback("muteallchannels");
            instrStopId++;
            stopTone();
            AudioContextManager.AudioSource.stopAll();
            for (const handler of stopAllListeners) {
                handler();
            }
        }
        AudioContextManager.muteAllChannels = muteAllChannels;
        function queuePlayInstructions(when, b) {
            const prevStop = instrStopId;
            pxsim.U.delay(when)
                .then(() => {
                if (prevStop != instrStopId)
                    return Promise.resolve();
                return playInstructionsAsync(b.data);
            });
        }
        AudioContextManager.queuePlayInstructions = queuePlayInstructions;
        function tone(frequency, gain) {
            if (frequency < 0)
                return;
            let source;
            try {
                source = AudioContextManager.AudioToneSource.getInstance(context(), destination);
                source.setFrequency(frequency);
                source.setGain(gain, context().currentTime);
                source.start();
            }
            catch (e) {
                if (source) {
                    source.dispose();
                }
            }
        }
        AudioContextManager.tone = tone;
        function setCurrentToneGain(gain) {
            AudioContextManager.AudioToneSource.setCurrentToneGain(gain, context().currentTime);
        }
        AudioContextManager.setCurrentToneGain = setCurrentToneGain;
        function uint8ArrayToString(input) {
            let len = input.length;
            let res = "";
            for (let i = 0; i < len; ++i)
                res += String.fromCharCode(input[i]);
            return res;
        }
        function playBufferAsync(buf) {
            if (!buf)
                return Promise.resolve();
            return new Promise(resolve => {
                function res() {
                    if (resolve)
                        resolve();
                    resolve = undefined;
                }
                const url = "data:audio/wav;base64," + window.btoa(uint8ArrayToString(buf.data));
                audio = new Audio(url);
                if (_mute)
                    audio.volume = 0;
                audio.onended = () => res();
                audio.onpause = () => res();
                audio.onerror = () => res();
                audio.play();
            });
        }
        AudioContextManager.playBufferAsync = playBufferAsync;
        async function playPCMBufferStreamAsync(pull, sampleRate, volume = 0.3, isCancelled) {
            const source = new AudioContextManager.AudioBufferStreamSource(context(), destination);
            await source.playStreamAsync(pull, sampleRate, volume, isCancelled);
            if (!source.isDisposed()) {
                source.dispose();
            }
        }
        AudioContextManager.playPCMBufferStreamAsync = playPCMBufferStreamAsync;
        function frequencyFromMidiNoteNumber(note) {
            return 440 * Math.pow(2, (note - 69) / 12);
        }
        async function playInstructionsAsync(instructions, isCancelled, onPull) {
            AudioContextManager.soundEventCallback === null || AudioContextManager.soundEventCallback === void 0 ? void 0 : AudioContextManager.soundEventCallback("playinstructions", instructions);
            const channel = new AudioContextManager.PlayInstructionsSource(context(), destination);
            let finished = false;
            if (onPull) {
                initOscilloscope(onPull, channel.analyser, () => finished || (isCancelled === null || isCancelled === void 0 ? void 0 : isCancelled()) || channel.isDisposed());
            }
            await channel.playInstructionsAsync(instructions, isCancelled);
            channel.dispose();
            finished = true;
        }
        AudioContextManager.playInstructionsAsync = playInstructionsAsync;
        function initOscilloscope(onPull, analyser, isCancelled) {
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);
            const fftArray = new Uint8Array(bufferLength);
            const handleAnimationFrame = () => {
                if (isCancelled())
                    return;
                analyser.getFloatTimeDomainData(dataArray);
                analyser.getByteFrequencyData(fftArray);
                onPull({ data: dataArray, fft: fftArray });
                requestAnimationFrame(handleAnimationFrame);
            };
            requestAnimationFrame(handleAnimationFrame);
        }
        function sendMidiMessage(buf) {
            const data = buf.data;
            if (!data.length) // garbage.
                return;
            // no midi access or no midi element,
            // limited interpretation of midi commands
            const cmd = data[0] >> 4;
            const channel = data[0] & 0xf;
            const noteNumber = data[1] || 0;
            const noteFrequency = frequencyFromMidiNoteNumber(noteNumber);
            const velocity = data[2] || 0;
            //pxsim.log(`midi: cmd ${cmd} channel (-1) ${channel} note ${noteNumber} f ${noteFrequency} v ${velocity}`)
            // play drums regardless
            if (cmd == 8 || ((cmd == 9) && (velocity == 0))) { // with MIDI, note on with velocity zero is the same as note off
                // note off
                stopTone();
            }
            else if (cmd == 9) {
                // note on -- todo handle velocity
                tone(noteFrequency, 1);
                if (channel == 9) // drums don't call noteOff
                    setTimeout(() => stopTone(), 500);
            }
        }
        AudioContextManager.sendMidiMessage = sendMidiMessage;
        function startSamplePlayback(sample, format, sampleRange, sampleRate, gain) {
            let playbackRate = 1;
            // chrome errors out if the sample rate is outside [3000, 768000]
            if (sampleRate < 3000) {
                playbackRate = sampleRate / 3000;
                sampleRate = 3000;
            }
            else if (sampleRate > 768000) {
                playbackRate = sampleRate / 768000;
                sampleRate = 768000;
            }
            const size = pxsim.BufferMethods.fmtInfo(format).size;
            const buf = context().createBuffer(1, sample.data.length / size, sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < buf.length; i++) {
                data[i] = (pxsim.BufferMethods.getNumber(sample, format, i * size) / sampleRange) * 2 - 1;
            }
            const source = new AudioContextManager.AudioBufferSource(context(), destination);
            return {
                cancel: () => source.dispose(),
                promise: source.playBufferAsync(buf, playbackRate, gain)
            };
        }
        AudioContextManager.startSamplePlayback = startSamplePlayback;
        function createAudioSourceNode(uri, clippingThreshold, volume) {
            const source = new AudioContextManager.AudioElementSource(context(), destination, uri, clippingThreshold, volume);
            return source.getAudioElement();
        }
        AudioContextManager.createAudioSourceNode = createAudioSourceNode;
        function createSpatialAudioPlayer() {
            return new AudioContextManager.SpatialAudioPlayer(context(), destination).id;
        }
        AudioContextManager.createSpatialAudioPlayer = createSpatialAudioPlayer;
        function setSpatialAudioPlayerPosition(id, x, y, z) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                player.setPosition(x, y, z);
            }
        }
        AudioContextManager.setSpatialAudioPlayerPosition = setSpatialAudioPlayerPosition;
        function setSpatialAudioPlayerOrientation(id, x, y, z) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                player.setOrientation(x, y, z);
            }
        }
        AudioContextManager.setSpatialAudioPlayerOrientation = setSpatialAudioPlayerOrientation;
        function setSpatialAudioPlayerCone(id, innerAngle, outerAngle, outerGain) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                player.setCone(innerAngle, outerAngle, outerGain);
            }
        }
        AudioContextManager.setSpatialAudioPlayerCone = setSpatialAudioPlayerCone;
        function setSpatialAudioRollOff(id, refDistance, maxDistance, rollOffFactor) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                player.setRollOff(refDistance, maxDistance, rollOffFactor);
            }
        }
        AudioContextManager.setSpatialAudioRollOff = setSpatialAudioRollOff;
        function setSpatialAudioDistanceModel(id, model) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                player.setDistanceModel(model);
            }
        }
        AudioContextManager.setSpatialAudioDistanceModel = setSpatialAudioDistanceModel;
        function disposeSpatialAudioPlayer(id) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                player.dispose();
            }
        }
        AudioContextManager.disposeSpatialAudioPlayer = disposeSpatialAudioPlayer;
        function queuePlayInstructionsAtSpatialAudioPlayer(id, when, b) {
            const player = AudioContextManager.SpatialAudioPlayer.getPlayerById(id);
            if (player) {
                const prevStop = instrStopId;
                pxsim.U.delay(when)
                    .then(() => {
                    if (prevStop != instrStopId)
                        return Promise.resolve();
                    return player.playInstructionsAsync(b.data);
                });
            }
        }
        AudioContextManager.queuePlayInstructionsAtSpatialAudioPlayer = queuePlayInstructionsAtSpatialAudioPlayer;
        function setListenerPosition(x, y, z) {
            const ctx = context();
            if (ctx) {
                // Firefox does not support AudioParam-based positionX/Y/Z on AudioListener.
                // Fall back to the deprecated setPosition() method.
                if (ctx.listener.positionX) {
                    ctx.listener.positionX.setTargetAtTime(x, 0, 0.02);
                    ctx.listener.positionY.setTargetAtTime(y, 0, 0.02);
                    ctx.listener.positionZ.setTargetAtTime(z, 0, 0.02);
                }
                else {
                    ctx.listener.setPosition(x, y, z);
                }
            }
        }
        AudioContextManager.setListenerPosition = setListenerPosition;
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
/// <reference path="./audioSource.ts" />
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        class AudioElementSource extends AudioContextManager.AudioSource {
            constructor(context, destination, uri, clippingThreshold, volume) {
                super(context, destination);
                this.audioElement = new Audio(uri);
                this.source = context.createMediaElementSource(this.audioElement);
                this.distortion = context.createWaveShaper();
                this.distortion.curve = makeDistortionCurve(clippingThreshold);
                this.distortion.oversample = "4x";
                this.source.connect(this.distortion);
                this.distortion.connect(this.vca);
                // scaling the volume to be a multiplier of 0.1
                // 0.1 is what sounded the best when testing audio recordings against other music blocks
                this.vca.gain.value = volume * 0.1;
            }
            getAudioElement() {
                return this.audioElement;
            }
            dispose() {
                super.dispose();
                this.source.disconnect();
                this.distortion.disconnect();
                this.audioElement.pause();
                this.audioElement = undefined;
                this.source = undefined;
                this.distortion = undefined;
            }
        }
        AudioContextManager.AudioElementSource = AudioElementSource;
        function makeDistortionCurve(clippingThreshold) {
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            clippingThreshold = Math.max(0.01, Math.min(1, clippingThreshold));
            const slope = 1 / clippingThreshold;
            for (let i = 0; i < n_samples; i++) {
                const x = (i * 2) / n_samples - 1;
                const scaled = x * slope;
                curve[i] = Math.max(-1, Math.min(1, scaled));
            }
            return curve;
        }
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
/// <reference path="./audioSource.ts" />
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        class AudioToneSource extends AudioContextManager.AudioSource {
            constructor(context, destination) {
                super(context, destination);
                this.started = false;
                this.vca.gain.value = 0;
                this.oscillator = context.createOscillator();
                this.oscillator.type = "triangle";
                this.oscillator.frequency.value = 0;
                this.oscillator.connect(this.vca);
                this.frequency = 0;
            }
            static getInstance(context, destination) {
                if (!AudioToneSource.instance) {
                    AudioToneSource.instance = new AudioToneSource(context, destination);
                }
                return AudioToneSource.instance;
            }
            static setCurrentToneGain(gain, currentTime) {
                if (AudioToneSource.instance) {
                    AudioToneSource.instance.setGain(gain, currentTime);
                }
            }
            static isActive() {
                return !!AudioToneSource.instance;
            }
            static getFrequency() {
                var _a;
                return ((_a = AudioToneSource.instance) === null || _a === void 0 ? void 0 : _a.frequency) || 0;
            }
            static dispose() {
                if (AudioToneSource.instance) {
                    AudioToneSource.instance.dispose();
                }
            }
            setFrequency(frequency) {
                this.frequency = frequency;
                this.oscillator.frequency.value = frequency;
            }
            setGain(gain, currentTime) {
                this.vca.gain.setTargetAtTime(gain, currentTime, 0.015);
            }
            start() {
                if (!this.started) {
                    this.oscillator.start();
                    this.started = true;
                }
            }
            dispose() {
                super.dispose();
                this.oscillator.stop();
                this.oscillator.disconnect();
                this.oscillator = undefined;
                AudioToneSource.instance = undefined;
            }
        }
        AudioContextManager.AudioToneSource = AudioToneSource;
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
/// <reference path="./audioSource.ts" />
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        let nextSoundId = 0;
        class AudioWorkletSource extends AudioContextManager.AudioSource {
            constructor(context, destination, isPrivate = false) {
                super(context, destination);
                this.isPrivate = isPrivate;
                AudioWorkletSource.allWorkletSources.push(this);
                this.analyser = context.createAnalyser();
                this.analyser.fftSize = 2048;
                this.node = new AudioWorkletNode(context, "pxt-mixer-audio-worklet-processor");
                this.node.connect(this.analyser);
                this.analyser.connect(this.vca);
                this.node.port.onmessage = e => {
                    if (e.data.type === "done") {
                        const entry = this.activeSounds.find(s => s.id === e.data.id);
                        if (entry) {
                            entry.resolve();
                            this.activeSounds = this.activeSounds.filter(s => s !== entry);
                        }
                    }
                };
                this.activeSounds = [];
            }
            static initializeWorklet(context) {
                if (!AudioWorkletSource.workletInit) {
                    AudioWorkletSource.workletInit = context.audioWorklet.addModule(pxsim.getWorkletUri());
                    // AudioWorkletSource.workletInit = context.audioWorklet.addModule("/static/audioWorklet/audioWorkletProcessor.js");
                }
                return AudioWorkletSource.workletInit;
            }
            static getAvailableSource() {
                for (const source of AudioWorkletSource.allWorkletSources) {
                    if (source.activeSounds.length < 30 && !source.isPrivate) {
                        return source;
                    }
                }
                return undefined;
            }
            playInstructionsAsync(instructions, isCancelled) {
                return new Promise((resolve) => {
                    const msg = {
                        type: "play",
                        instructions: instructions,
                        id: nextSoundId++
                    };
                    const sound = {
                        id: msg.id,
                        resolve,
                        isCancelled
                    };
                    this.activeSounds.push(sound);
                    this.node.port.postMessage(msg);
                    if (isCancelled) {
                        this.updateActiveSounds();
                    }
                });
            }
            dispose() {
                if (this.isDisposed())
                    return;
                super.dispose();
                AudioWorkletSource.allWorkletSources = AudioWorkletSource.allWorkletSources.filter(s => s !== this);
                this.node.disconnect();
                this.node.port.close();
                this.node = undefined;
                this.analyser.disconnect();
                this.analyser = undefined;
                for (const sound of this.activeSounds) {
                    sound.resolve();
                }
            }
            updateActiveSounds() {
                var _a;
                if (this.isDisposed())
                    return;
                if (this.animRef) {
                    cancelAnimationFrame(this.animRef);
                    this.animRef = undefined;
                }
                for (const sound of this.activeSounds) {
                    if ((_a = sound.isCancelled) === null || _a === void 0 ? void 0 : _a.call(sound)) {
                        sound.resolve();
                        this.activeSounds = this.activeSounds.filter(s => s !== sound);
                        this.node.port.postMessage({
                            type: "cancel",
                            id: sound.id
                        });
                    }
                }
                if (this.activeSounds.length) {
                    this.animRef = requestAnimationFrame(() => {
                        this.updateActiveSounds();
                    });
                }
            }
        }
        AudioWorkletSource.allWorkletSources = [];
        AudioContextManager.AudioWorkletSource = AudioWorkletSource;
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var music;
    (function (music) {
        class Metronome {
            constructor() {
                this.tickListeners = [];
                this.onTick = () => {
                    for (const listener of this.tickListeners) {
                        listener();
                    }
                };
            }
            initAsync() {
                if (this.metronomeLoadPromise)
                    return this.metronomeLoadPromise;
                if (this.metronomeWorker)
                    return this.metronomeWorker;
                this.metronomeLoadPromise = new Promise(resolve => {
                    this.metronomeWorker = new Worker("data:application/javascript," + encodeURIComponent(metronomeWorkerJS));
                    const readyHandler = (ev) => {
                        if (ev.data === "ready") {
                            resolve(this.metronomeWorker);
                            this.metronomeWorker.removeEventListener("message", readyHandler);
                            this.metronomeWorker.addEventListener("message", this.onTick);
                        }
                    };
                    this.metronomeWorker.addEventListener("message", readyHandler);
                });
                return this.metronomeLoadPromise;
            }
            stop() {
                this.postMessage({
                    type: "stop"
                });
            }
            setInterval(interval) {
                this.currentInterval = interval;
                this.postMessage({
                    type: "set-interval",
                    interval
                });
            }
            start(interval) {
                this.currentInterval = interval;
                this.postMessage({
                    type: "start",
                    interval
                });
            }
            addTickListener(listener) {
                this.tickListeners.push(listener);
            }
            removeTickListener(listener) {
                this.tickListeners = this.tickListeners.filter(l => l !== listener);
            }
            interval() {
                return this.currentInterval;
            }
            dispose() {
                if (this.metronomeWorker) {
                    this.metronomeWorker.terminate();
                    this.metronomeWorker = undefined;
                    this.metronomeLoadPromise = undefined;
                    this.tickListeners = [];
                    this.interval = undefined;
                }
                else if (this.metronomeLoadPromise) {
                    this.metronomeLoadPromise.then(() => this.dispose());
                    return;
                }
            }
            postMessage(message) {
                if (!this.metronomeWorker) {
                    throw new Error("initAsync not called on metronome");
                }
                this.metronomeWorker.postMessage(message);
            }
        }
        music.Metronome = Metronome;
        const metronomeWorkerJS = `
/**
 * Adpated from https://github.com/cwilso/metronome/
 */

let timerRef;
let interval;

addEventListener("message", ev => {
    const message = ev.data;

    if (message.type === "start") {
        updateInterval(message.interval, true);
    }
    else if (message.type === "stop") {
        clearInterval(timerRef);
        timerRef = undefined;
    }
    else if (message.type === "set-interval") {
        updateInterval(message.interval, false);
    }
})

postMessage("ready");

function updateInterval(interval, startIfStopped) {
    if (timerRef) {
        clearInterval(timerRef);
        startIfStopped = true;
    }
    interval = interval;

    if (startIfStopped) {
        timerRef = setInterval(() => postMessage("tick"), interval);
    }
}
`;
    })(music = pxsim.music || (pxsim.music = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var codal;
    (function (codal) {
        var music;
        (function (music) {
            var MusicalIntervals;
            (function (MusicalIntervals) {
                // #if CONFIG_ENABLED(JUST_SCALE)
                // const float MusicalIntervals.chromaticInterval[] = [1.000000, 1.059463, 1.122462, 1.189207, 1.259921, 1.334840, 1.414214, 1.498307, 1.587401, 1.681793, 1.781797, 1.887749];
                // #else
                // const float MusicalIntervals.chromaticInterval[] = [1.000000, 1.0417, 1.1250, 1.2000, 1.2500, 1.3333, 1.4063, 1.5000, 1.6000, 1.6667, 1.8000, 1.8750];
                // #endif
                MusicalIntervals.chromaticInterval = [1.000000, 1.0417, 1.1250, 1.2000, 1.2500, 1.3333, 1.4063, 1.5000, 1.6000, 1.6667, 1.8000, 1.8750];
                MusicalIntervals.majorScaleInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[2], MusicalIntervals.chromaticInterval[4], MusicalIntervals.chromaticInterval[5], MusicalIntervals.chromaticInterval[7], MusicalIntervals.chromaticInterval[9], MusicalIntervals.chromaticInterval[11]];
                MusicalIntervals.minorScaleInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[2], MusicalIntervals.chromaticInterval[3], MusicalIntervals.chromaticInterval[5], MusicalIntervals.chromaticInterval[7], MusicalIntervals.chromaticInterval[8], MusicalIntervals.chromaticInterval[10]];
                MusicalIntervals.pentatonicScaleInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[2], MusicalIntervals.chromaticInterval[4], MusicalIntervals.chromaticInterval[7], MusicalIntervals.chromaticInterval[9]];
                MusicalIntervals.majorTriadInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[4], MusicalIntervals.chromaticInterval[7]];
                MusicalIntervals.minorTriadInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[3], MusicalIntervals.chromaticInterval[7]];
                MusicalIntervals.diminishedInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[3], MusicalIntervals.chromaticInterval[6], MusicalIntervals.chromaticInterval[9]];
                MusicalIntervals.wholeToneInterval = [MusicalIntervals.chromaticInterval[0], MusicalIntervals.chromaticInterval[2], MusicalIntervals.chromaticInterval[4], MusicalIntervals.chromaticInterval[6], MusicalIntervals.chromaticInterval[8], MusicalIntervals.chromaticInterval[10]];
            })(MusicalIntervals = music.MusicalIntervals || (music.MusicalIntervals = {}));
        })(music = codal.music || (codal.music = {}));
    })(codal = pxsim.codal || (pxsim.codal = {}));
})(pxsim || (pxsim = {}));
(function (pxsim) {
    var codal;
    (function (codal) {
        var music;
        (function (music) {
            var MusicalProgressions;
            (function (MusicalProgressions) {
                MusicalProgressions.chromatic = { interval: music.MusicalIntervals.chromaticInterval, length: 12 };
                MusicalProgressions.majorScale = { interval: music.MusicalIntervals.majorScaleInterval, length: 7 };
                MusicalProgressions.minorScale = { interval: music.MusicalIntervals.minorScaleInterval, length: 7 };
                MusicalProgressions.pentatonicScale = { interval: music.MusicalIntervals.pentatonicScaleInterval, length: 5 };
                MusicalProgressions.majorTriad = { interval: music.MusicalIntervals.majorTriadInterval, length: 3 };
                MusicalProgressions.minorTriad = { interval: music.MusicalIntervals.minorTriadInterval, length: 3 };
                MusicalProgressions.diminished = { interval: music.MusicalIntervals.diminishedInterval, length: 4 };
                MusicalProgressions.wholeTone = { interval: music.MusicalIntervals.wholeToneInterval, length: 6 };
                /**
                 * Determine the frequency of a given note in a given progressions
                 *
                 * @param root The root frequency of the progression
                 * @param progression The Progression to use
                 * @param offset The offset (interval) of the note to generate
                 * @return The frequency of the note requested in Hz.
                 */
                function calculateFrequencyFromProgression(root, progression, offset) {
                    let octave = Math.floor(offset / progression.length);
                    let index = offset % progression.length;
                    return root * Math.pow(2, octave) * progression.interval[index];
                }
                MusicalProgressions.calculateFrequencyFromProgression = calculateFrequencyFromProgression;
            })(MusicalProgressions = music.MusicalProgressions || (music.MusicalProgressions = {}));
        })(music = codal.music || (codal.music = {}));
    })(codal = pxsim.codal || (pxsim.codal = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        const waveForms = [null, "triangle", "sawtooth", "sine"];
        let noiseBuffer;
        let rectNoiseBuffer;
        let cycleNoiseBuffer = [];
        let squareBuffer = [];
        function getNoiseBuffer(context) {
            if (!noiseBuffer) {
                const bufferSize = 100000;
                noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                let x = 0xf01ba80;
                for (let i = 0; i < bufferSize; i++) {
                    x ^= x << 13;
                    x ^= x >> 17;
                    x ^= x << 5;
                    output[i] = ((x & 1023) / 512.0) - 1.0;
                }
            }
            return noiseBuffer;
        }
        function getRectNoiseBuffer(context) {
            // Create a square wave filtered by a pseudorandom bit sequence.
            // This uses four samples per cycle to create square-ish waves.
            // The Web Audio API's frequency scaling may be using linear
            // interpolation which would turn a two-sample wave into a triangle.
            if (!rectNoiseBuffer) {
                const bufferSize = 131072; // must be a multiple of 4
                rectNoiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
                const output = rectNoiseBuffer.getChannelData(0);
                let x = 0xf01ba80;
                for (let i = 0; i < bufferSize; i += 4) {
                    // see https://en.wikipedia.org/wiki/Xorshift
                    x ^= x << 13;
                    x ^= x >> 17;
                    x ^= x << 5;
                    if (x & 0x8000) {
                        output[i] = 1.0;
                        output[i + 1] = 1.0;
                        output[i + 2] = -1.0;
                        output[i + 3] = -1.0;
                    }
                    else {
                        output[i] = 0.0;
                        output[i + 1] = 0.0;
                        output[i + 2] = 0.0;
                        output[i + 3] = 0.0;
                    }
                }
            }
            return rectNoiseBuffer;
        }
        function getCycleNoiseBuffer(context, bits) {
            if (!cycleNoiseBuffer[bits]) {
                // Buffer size needs to be a multiple of 4x the largest cycle length,
                // 4*64 in this case.
                const bufferSize = 1024;
                const buf = context.createBuffer(1, bufferSize, context.sampleRate);
                const output = buf.getChannelData(0);
                // See pxt-common-packages's libs/mixer/melody.cpp for details.
                // "bits" must be in the range 4..6.
                const cycle_bits = [0x2df0eb47, 0xc8165a93];
                const mask_456 = [0xf, 0x1f, 0x3f];
                for (let i = 0; i < bufferSize; i += 4) {
                    let cycle = i / 4;
                    let is_on;
                    let cycle_mask = mask_456[bits - 4];
                    cycle &= cycle_mask;
                    is_on = (cycle_bits[cycle >> 5] & (1 << (cycle & 0x1f))) != 0;
                    if (is_on) {
                        output[i] = 1.0;
                        output[i + 1] = 1.0;
                        output[i + 2] = -1.0;
                        output[i + 3] = -1.0;
                    }
                    else {
                        output[i] = 0.0;
                        output[i + 1] = 0.0;
                        output[i + 2] = 0.0;
                        output[i + 3] = 0.0;
                    }
                }
                cycleNoiseBuffer[bits] = buf;
            }
            return cycleNoiseBuffer[bits];
        }
        function getSquareBuffer(context, param) {
            if (!squareBuffer[param]) {
                const bufferSize = 1024;
                const buf = context.createBuffer(1, bufferSize, context.sampleRate);
                const output = buf.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = i < (param / 100 * bufferSize) ? 1 : -1;
                }
                squareBuffer[param] = buf;
            }
            return squareBuffer[param];
        }
        /*
        #define SW_TRIANGLE 1
        #define SW_SAWTOOTH 2
        #define SW_SINE 3
        #define SW_TUNEDNOISE 4
        #define SW_NOISE 5
        #define SW_SQUARE_10 11
        #define SW_SQUARE_50 15
        #define SW_SQUARE_CYCLE_16 16
        #define SW_SQUARE_CYCLE_32 17
        #define SW_SQUARE_CYCLE_64 18
        */
        /*
         struct SoundInstruction {
             uint8_t soundWave;
             uint8_t flags;
             uint16_t frequency;
             uint16_t duration;
             uint16_t startVolume;
             uint16_t endVolume;
         };
         */
        function getGenerator(context, waveFormIdx, hz) {
            let form = waveForms[waveFormIdx];
            if (form) {
                let src = context.createOscillator();
                src.type = form;
                src.frequency.value = hz;
                return src;
            }
            let buffer;
            if (waveFormIdx == 4)
                buffer = getRectNoiseBuffer(context);
            else if (waveFormIdx == 5)
                buffer = getNoiseBuffer(context);
            else if (11 <= waveFormIdx && waveFormIdx <= 15)
                buffer = getSquareBuffer(context, (waveFormIdx - 10) * 10);
            else if (16 <= waveFormIdx && waveFormIdx <= 18)
                buffer = getCycleNoiseBuffer(context, (waveFormIdx - 16) + 4);
            else
                return null;
            let node = context.createBufferSource();
            node.buffer = buffer;
            node.loop = true;
            const isFilteredNoise = waveFormIdx == 4 || (16 <= waveFormIdx && waveFormIdx <= 18);
            if (isFilteredNoise)
                node.playbackRate.value = hz / (context.sampleRate / 4);
            else if (waveFormIdx != 5)
                node.playbackRate.value = hz / (context.sampleRate / 1024);
            return node;
        }
        class PlayInstructionsSource extends AudioContextManager.AudioSource {
            constructor(context, destination) {
                super(context, destination);
                this.context = context;
                this.destination = destination;
                this.analyser = context.createAnalyser();
                this.analyser.fftSize = 2048;
                this.analyser.connect(this.vca);
                this.gain = context.createGain();
                this.gain.connect(this.analyser);
            }
            playInstructionsAsync(instructions, isCancelled, onPull) {
                return new Promise(async (resolve) => {
                    AudioContextManager.soundEventCallback === null || AudioContextManager.soundEventCallback === void 0 ? void 0 : AudioContextManager.soundEventCallback("playinstructions", instructions);
                    let resolved = false;
                    const oscillators = {};
                    const gains = {};
                    let startTime = this.context.currentTime;
                    let currentTime = startTime;
                    let currentWave = 0;
                    let totalDuration = 0;
                    /** Square waves are perceved as much louder than other sounds, so scale it down a bit to make it less jarring **/
                    const scaleVol = (n, isSqWave) => (n / 1024) / 4 * (isSqWave ? .5 : 1);
                    const disconnectNodes = () => {
                        if (resolved)
                            return;
                        resolved = true;
                        for (const wave of Object.keys(oscillators)) {
                            oscillators[wave].stop();
                            oscillators[wave].disconnect();
                            gains[wave].disconnect();
                        }
                        resolve();
                    };
                    for (let i = 0; i < instructions.length; i += 12) {
                        const wave = instructions[i];
                        const startFrequency = readUint16(instructions, i + 2);
                        const duration = readUint16(instructions, i + 4) / 1000;
                        const startVolume = readUint16(instructions, i + 6);
                        const endVolume = readUint16(instructions, i + 8);
                        const endFrequency = readUint16(instructions, i + 10);
                        totalDuration += duration;
                        if (wave === 0) {
                            currentTime += duration;
                            continue;
                        }
                        const isSquareWave = 11 <= wave && wave <= 15;
                        if (!oscillators[wave]) {
                            oscillators[wave] = getGenerator(this.context, wave, startFrequency);
                            gains[wave] = this.context.createGain();
                            gains[wave].gain.value = 0;
                            gains[wave].connect(this.gain);
                            oscillators[wave].connect(gains[wave]);
                            oscillators[wave].start();
                        }
                        if (currentWave && wave !== currentWave) {
                            gains[currentWave].gain.setTargetAtTime(0, currentTime, 0.015);
                        }
                        const osc = oscillators[wave];
                        const gain = gains[wave];
                        if (osc instanceof OscillatorNode) {
                            osc.frequency.setValueAtTime(startFrequency, currentTime);
                            osc.frequency.linearRampToValueAtTime(endFrequency, currentTime + duration);
                        }
                        else {
                            const isFilteredNoise = wave == 4 || (16 <= wave && wave <= 18);
                            if (isFilteredNoise)
                                osc.playbackRate.linearRampToValueAtTime(endFrequency / (this.context.sampleRate / 4), currentTime + duration);
                            else if (wave != 5)
                                osc.playbackRate.linearRampToValueAtTime(endFrequency / (this.context.sampleRate / 1024), currentTime + duration);
                        }
                        gain.gain.setValueAtTime(scaleVol(startVolume, isSquareWave), currentTime);
                        gain.gain.linearRampToValueAtTime(scaleVol(endVolume, isSquareWave), currentTime + duration);
                        currentWave = wave;
                        currentTime += duration;
                    }
                    this.gain.gain.setTargetAtTime(0, currentTime, 0.015);
                    if (isCancelled || onPull) {
                        const handleAnimationFrame = () => {
                            const time = this.context.currentTime;
                            if (time > startTime + totalDuration) {
                                return;
                            }
                            if ((isCancelled && isCancelled()) || this.isDisposed()) {
                                disconnectNodes();
                                return;
                            }
                            const { frequency, volume } = findFrequencyAndVolumeAtTime((time - startTime) * 1000, instructions);
                            if (onPull)
                                onPull(frequency, volume / 1024);
                            requestAnimationFrame(handleAnimationFrame);
                        };
                        requestAnimationFrame(handleAnimationFrame);
                    }
                    await pxsim.U.delay(totalDuration * 1000);
                    disconnectNodes();
                });
            }
            dispose() {
                if (this.isDisposed())
                    return;
                super.dispose();
                this.analyser.disconnect();
                this.gain.disconnect();
                this.analyser = undefined;
                this.gain = undefined;
            }
        }
        AudioContextManager.PlayInstructionsSource = PlayInstructionsSource;
        function readUint16(buf, offset) {
            const temp = new Uint8Array(2);
            temp[0] = buf[offset];
            temp[1] = buf[offset + 1];
            return new Uint16Array(temp.buffer)[0];
        }
        function findFrequencyAndVolumeAtTime(millis, instructions) {
            let currentTime = 0;
            for (let i = 0; i < instructions.length; i += 12) {
                const startFrequency = readUint16(instructions, i + 2);
                const duration = readUint16(instructions, i + 4);
                const startVolume = readUint16(instructions, i + 6);
                const endVolume = readUint16(instructions, i + 8);
                const endFrequency = readUint16(instructions, i + 10);
                if (currentTime + duration < millis) {
                    currentTime += duration;
                    continue;
                }
                const offset = (millis - currentTime) / duration;
                return {
                    frequency: startFrequency + (endFrequency - startFrequency) * offset,
                    volume: startVolume + (endVolume - startVolume) * offset,
                };
            }
            return {
                frequency: -1,
                volume: -1
            };
        }
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
/// <reference path="../../localtypings/pxtmusic.d.ts" />
var pxsim;
(function (pxsim) {
    var music;
    (function (music) {
        const frequencies = [31, 33, 35, 37, 39, 41, 44, 46, 49, 52, 55, 58, 62, 65, 69, 73,
            78, 82, 87, 92, 98, 104, 110, 117, 123, 131, 139, 147, 156, 165, 175, 185, 196, 208,
            220, 233, 247, 262, 277, 294, 311, 330, 349, 370, 392, 415, 440, 466, 494, 523, 554,
            587, 622, 659, 698, 740, 784, 831, 880, 932, 988, 1047, 1109, 1175, 1245, 1319, 1397,
            1480, 1568, 1661, 1760, 1865, 1976, 2093, 2217, 2349, 2489, 2637, 2794, 2960, 3136,
            3322, 3520, 3729, 3951, 4186, 4435, 4699, 4978, 5274, 5588, 5920, 6272, 6645, 7040,
            7459, 7902];
        class Sequencer {
            constructor() {
                this._currentTick = 0;
                this._state = "stop";
                this.listeners = {};
                this.globalVolume = 1024;
                this.trackVolumes = [];
                this.drumTrackVolumes = [];
                this.currentCancelToken = { cancelled: false };
                this.onTick = () => {
                    var _a;
                    const currentToken = this.currentCancelToken;
                    for (let i = 0; i < this.currentlyPlaying.tracks.length; i++) {
                        const track = this.currentlyPlaying.tracks[i];
                        for (const noteEvent of track.notes) {
                            if (noteEvent.startTick === this._currentTick) {
                                for (const note of noteEvent.notes) {
                                    const velocity = (_a = noteEvent.velocity) !== null && _a !== void 0 ? _a : 128;
                                    if (this.spatialAudioPlayer) {
                                        if (track.drums) {
                                            playDrumAtSpatialAudioPlayerAsync(this.spatialAudioPlayer, track.drums[note.note], this.getDrumTrackVolume(i, note.note, velocity));
                                        }
                                        else {
                                            playNoteAtSpatialAudioPlayerAsync(this.spatialAudioPlayer, note.note, track.instrument, tickToMs(this.currentlyPlaying.beatsPerMinute, this.currentlyPlaying.ticksPerBeat, noteEvent.endTick - noteEvent.startTick), this.getMelodicTrackVolume(i, velocity));
                                        }
                                    }
                                    else {
                                        if (track.drums) {
                                            playDrumAsync(track.drums[note.note], () => currentToken.cancelled, this.getDrumTrackVolume(i, note.note, velocity));
                                        }
                                        else {
                                            playNoteAsync(note.note, track.instrument, tickToMs(this.currentlyPlaying.beatsPerMinute, this.currentlyPlaying.ticksPerBeat, noteEvent.endTick - noteEvent.startTick), () => currentToken.cancelled, this.getMelodicTrackVolume(i, velocity));
                                        }
                                    }
                                }
                            }
                            else if (noteEvent.startTick > this._currentTick) {
                                break;
                            }
                        }
                    }
                    this.fireEvent("tick");
                    this._currentTick++;
                    if (this._currentTick >= this.maxTick()) {
                        if (this._state === "loop") {
                            this._currentTick = 0;
                            this.fireEvent("looped");
                        }
                        else {
                            this.stop(true);
                        }
                    }
                };
            }
            async initAsync() {
                if (this.metronome) {
                    await this.metronome.initAsync();
                    return;
                }
                this.metronome = new music.Metronome();
                await this.metronome.initAsync();
                this.metronome.addTickListener(this.onTick);
            }
            dispose() {
                if (this.metronome)
                    this.metronome.dispose();
                this.metronome = undefined;
                this.stop();
                this.currentlyPlaying = undefined;
                this.listeners = {};
            }
            state() {
                return this._state;
            }
            currentTick() {
                return this._currentTick;
            }
            currentTime() {
                return tickToMs(this.currentlyPlaying.beatsPerMinute, this.currentlyPlaying.ticksPerBeat, this.currentTick());
            }
            maxTick() {
                if (!this.currentlyPlaying)
                    return 0;
                return this.currentlyPlaying.measures * this.currentlyPlaying.beatsPerMeasure * this.currentlyPlaying.ticksPerBeat;
            }
            duration() {
                return tickToMs(this.currentlyPlaying.beatsPerMinute, this.currentlyPlaying.ticksPerBeat, this.maxTick());
            }
            start(song, loop) {
                this.startFrom(song, loop, 0);
            }
            startFrom(song, loop, tick) {
                if (this._state !== "stop")
                    this.stop();
                if (loop !== undefined) {
                    this.shouldLoop = loop;
                }
                this._currentTick = tick !== null && tick !== void 0 ? tick : 0;
                this.currentlyPlaying = song;
                this.metronome.start(tickToMs(song.beatsPerMinute, song.ticksPerBeat, 1));
                this._state = this.shouldLoop ? "loop" : "play";
                this.fireStateChange();
            }
            stop(sustainCurrentSounds = false) {
                if (this._state === "stop")
                    return;
                this._state = "stop";
                if (this.metronome)
                    this.metronome.stop();
                this.fireStateChange();
                if (!sustainCurrentSounds)
                    this.currentCancelToken.cancelled = true;
                this.currentCancelToken = { cancelled: false };
            }
            updateSong(song) {
                this.currentlyPlaying = song;
                if (this._state !== "stop") {
                    this.metronome.setInterval(tickToMs(song.beatsPerMinute, song.ticksPerBeat, 1));
                }
            }
            setLooping(looping) {
                if (looping && this._state === "play") {
                    this._state = "loop";
                    this.fireStateChange();
                }
                else if (!looping && this._state === "loop") {
                    this._state = "play";
                    this.fireStateChange();
                }
                this.shouldLoop = looping;
            }
            addEventListener(event, listener) {
                if (!this.listeners[event])
                    this.listeners[event] = [];
                this.listeners[event].push(listener);
            }
            removeEventListener(event, listener) {
                if (!this.listeners[event])
                    return;
                this.listeners[event] = this.listeners[event].filter(l => l !== listener);
            }
            setVolume(volume) {
                this.globalVolume = Math.min(Math.max(volume, 0), 1024);
            }
            setTrackVolume(trackIndex, volume) {
                volume = Math.min(Math.max(volume, 0), 1024);
                while (this.trackVolumes.length < trackIndex) {
                    this.trackVolumes.push(1024);
                }
                this.trackVolumes[trackIndex] = volume;
            }
            setDrumTrackVolume(trackIndex, drumIndex, volume) {
                volume = Math.min(Math.max(volume, 0), 1024);
                while (this.drumTrackVolumes.length < trackIndex) {
                    this.drumTrackVolumes.push([]);
                }
                while (this.drumTrackVolumes[trackIndex].length < drumIndex) {
                    this.drumTrackVolumes[trackIndex].push(1024);
                }
                this.drumTrackVolumes[trackIndex][drumIndex] = volume;
            }
            setSpatialAudioPlayer(player) {
                this.spatialAudioPlayer = player;
            }
            getMelodicTrackVolume(trackIndex, velocity) {
                let trackVolume = 1024;
                if (trackIndex < this.trackVolumes.length) {
                    trackVolume = this.trackVolumes[trackIndex];
                }
                return this.globalVolume * (trackVolume / 1024) * (velocity / 128);
            }
            getDrumTrackVolume(trackIndex, drumIndex, velocity) {
                const trackVolume = this.getMelodicTrackVolume(trackIndex, velocity);
                let drumVolume = 1024;
                if (trackIndex < this.drumTrackVolumes.length && drumIndex < this.drumTrackVolumes[trackIndex].length) {
                    drumVolume = this.drumTrackVolumes[trackIndex][drumIndex];
                }
                return trackVolume * (drumVolume / 1024);
            }
            fireStateChange() {
                this.fireEvent(this._state);
                this.fireEvent("state-change");
            }
            fireEvent(event) {
                if (this.listeners[event]) {
                    for (const listener of this.listeners[event]) {
                        listener();
                    }
                }
            }
        }
        music.Sequencer = Sequencer;
        async function playNoteAsync(note, instrument, time, isCancelled, volume = 100) {
            await pxsim.AudioContextManager.playInstructionsAsync(pxsim.music.renderInstrument(instrument, frequencies[note], time, volume), isCancelled);
        }
        music.playNoteAsync = playNoteAsync;
        async function playDrumAsync(drum, isCancelled, volume = 100) {
            await pxsim.AudioContextManager.playInstructionsAsync(pxsim.music.renderDrumInstrument(drum, volume), isCancelled);
        }
        music.playDrumAsync = playDrumAsync;
        async function playNoteAtSpatialAudioPlayerAsync(player, note, instrument, time, volume = 100) {
            await player.playInstructionsAsync(pxsim.music.renderInstrument(instrument, frequencies[note], time, volume));
        }
        async function playDrumAtSpatialAudioPlayerAsync(player, drum, volume = 100) {
            await player.playInstructionsAsync(pxsim.music.renderDrumInstrument(drum, volume));
        }
        function tickToMs(beatsPerMinute, ticksPerBeat, ticks) {
            return ((60000 / beatsPerMinute) / ticksPerBeat) * ticks;
        }
        music.tickToMs = tickToMs;
    })(music = pxsim.music || (pxsim.music = {}));
})(pxsim || (pxsim = {}));
/// <reference path="../../localtypings/pxtmusic.d.ts" />
var pxsim;
(function (pxsim) {
    var music;
    (function (music) {
        const BUFFER_SIZE = 12;
        function renderInstrument(instrument, noteFrequency, gateLength, volume) {
            var _a, _b, _c, _d, _e;
            const totalDuration = gateLength + instrument.ampEnvelope.release;
            const ampLFOInterval = ((_a = instrument.ampLFO) === null || _a === void 0 ? void 0 : _a.amplitude) ? Math.max(500 / instrument.ampLFO.frequency, 50) : 50;
            const pitchLFOInterval = ((_b = instrument.pitchLFO) === null || _b === void 0 ? void 0 : _b.amplitude) ? Math.max(500 / instrument.pitchLFO.frequency, 50) : 50;
            let timePoints = [0];
            let nextAETime = instrument.ampEnvelope.attack;
            let nextPETime = ((_c = instrument.pitchEnvelope) === null || _c === void 0 ? void 0 : _c.amplitude) ? instrument.pitchEnvelope.attack : totalDuration;
            let nextPLTime = ((_d = instrument.pitchLFO) === null || _d === void 0 ? void 0 : _d.amplitude) ? pitchLFOInterval : totalDuration;
            let nextALTime = ((_e = instrument.ampLFO) === null || _e === void 0 ? void 0 : _e.amplitude) ? ampLFOInterval : totalDuration;
            let time = 0;
            while (time < totalDuration) {
                if (nextAETime <= nextPETime && nextAETime <= nextPLTime && nextAETime <= nextALTime) {
                    time = nextAETime;
                    timePoints.push(nextAETime);
                    if (time < instrument.ampEnvelope.attack + instrument.ampEnvelope.decay && instrument.ampEnvelope.attack + instrument.ampEnvelope.decay < gateLength) {
                        nextAETime = instrument.ampEnvelope.attack + instrument.ampEnvelope.decay;
                    }
                    else if (time < gateLength) {
                        nextAETime = gateLength;
                    }
                    else {
                        nextAETime = totalDuration;
                    }
                }
                else if (nextPETime <= nextPLTime && nextPETime <= nextALTime && nextPETime < totalDuration) {
                    time = nextPETime;
                    timePoints.push(nextPETime);
                    if (time < instrument.pitchEnvelope.attack + instrument.pitchEnvelope.decay && instrument.pitchEnvelope.attack + instrument.pitchEnvelope.decay < gateLength) {
                        nextPETime = instrument.pitchEnvelope.attack + instrument.pitchEnvelope.decay;
                    }
                    else if (time < gateLength) {
                        nextPETime = gateLength;
                    }
                    else if (time < gateLength + instrument.pitchEnvelope.release) {
                        nextPETime = Math.min(totalDuration, gateLength + instrument.pitchEnvelope.release);
                    }
                    else {
                        nextPETime = totalDuration;
                    }
                }
                else if (nextPLTime <= nextALTime && nextPLTime < totalDuration) {
                    time = nextPLTime;
                    timePoints.push(nextPLTime);
                    nextPLTime += pitchLFOInterval;
                }
                else if (nextALTime < totalDuration) {
                    time = nextALTime;
                    timePoints.push(nextALTime);
                    nextALTime += ampLFOInterval;
                }
                else if (time < gateLength) {
                    time = gateLength;
                    timePoints.push(gateLength);
                }
                else {
                    time = totalDuration;
                    timePoints.push(totalDuration);
                }
                if (time >= totalDuration) {
                    break;
                }
                if (nextAETime <= time) {
                    if (time < instrument.ampEnvelope.attack + instrument.ampEnvelope.decay && instrument.ampEnvelope.attack + instrument.ampEnvelope.decay < gateLength) {
                        nextAETime = instrument.ampEnvelope.attack + instrument.ampEnvelope.decay;
                    }
                    else if (time < gateLength) {
                        nextAETime = gateLength;
                    }
                    else {
                        nextAETime = totalDuration;
                    }
                }
                if (nextPETime <= time) {
                    if (time < instrument.pitchEnvelope.attack + instrument.pitchEnvelope.decay && instrument.pitchEnvelope.attack + instrument.pitchEnvelope.decay < gateLength) {
                        nextPETime = instrument.pitchEnvelope.attack + instrument.pitchEnvelope.decay;
                    }
                    else if (time < gateLength) {
                        nextPETime = gateLength;
                    }
                    else if (time < gateLength + instrument.pitchEnvelope.release) {
                        nextPETime = Math.min(totalDuration, gateLength + instrument.pitchEnvelope.release);
                    }
                    else {
                        nextPETime = totalDuration;
                    }
                }
                while (nextALTime <= time) {
                    nextALTime += ampLFOInterval;
                }
                while (nextPLTime <= time) {
                    nextPLTime += pitchLFOInterval;
                }
            }
            let prevAmp = instrumentVolumeAtTime(instrument, gateLength, 0, volume) | 0;
            let prevPitch = instrumentPitchAtTime(instrument, noteFrequency, gateLength, 0) | 0;
            let prevTime = 0;
            let nextAmp;
            let nextPitch;
            const out = new Uint8Array(BUFFER_SIZE * (timePoints.length + 1));
            let ptr = 0;
            for (let i = 1; i < timePoints.length; i++) {
                if (timePoints[i] - prevTime < 5) {
                    continue;
                }
                nextAmp = instrumentVolumeAtTime(instrument, gateLength, timePoints[i], volume) | 0;
                nextPitch = instrumentPitchAtTime(instrument, noteFrequency, gateLength, timePoints[i]) | 0;
                ptr = addNote(out, ptr, (timePoints[i] - prevTime) | 0, prevAmp, nextAmp, instrument.waveform, prevPitch, nextPitch);
                prevAmp = nextAmp;
                prevPitch = nextPitch;
                prevTime = timePoints[i];
            }
            // if the amp is still open, roll it off to prevent clipping
            if (prevAmp) {
                ptr = addNote(out, ptr, 10, prevAmp, 0, instrument.waveform, prevPitch, prevPitch);
            }
            return out;
        }
        music.renderInstrument = renderInstrument;
        function renderDrumInstrument(sound, volume) {
            let prevAmp = sound.startVolume;
            let prevFreq = sound.startFrequency;
            const scaleVolume = (value) => (value / 1024) * volume;
            let out = new Uint8Array((sound.steps.length + 1) * BUFFER_SIZE);
            for (let i = 0; i < sound.steps.length; i++) {
                addNote(out, i * BUFFER_SIZE, sound.steps[i].duration, scaleVolume(prevAmp), scaleVolume(sound.steps[i].volume), sound.steps[i].waveform, prevFreq, sound.steps[i].frequency);
                prevAmp = sound.steps[i].volume;
                prevFreq = sound.steps[i].frequency;
            }
            addNote(out, sound.steps.length * BUFFER_SIZE, 10, scaleVolume(prevAmp), 0, sound.steps[sound.steps.length - 1].waveform, prevFreq, prevFreq);
            return out;
        }
        music.renderDrumInstrument = renderDrumInstrument;
        function instrumentPitchAtTime(instrument, noteFrequency, gateLength, time) {
            var _a, _b;
            let mod = 0;
            if ((_a = instrument.pitchEnvelope) === null || _a === void 0 ? void 0 : _a.amplitude) {
                mod += envelopeValueAtTime(instrument.pitchEnvelope, time, gateLength);
            }
            if ((_b = instrument.pitchLFO) === null || _b === void 0 ? void 0 : _b.amplitude) {
                mod += lfoValueAtTime(instrument.pitchLFO, time);
            }
            return Math.max(noteFrequency + mod, 0);
        }
        function instrumentVolumeAtTime(instrument, gateLength, time, maxVolume) {
            var _a;
            let mod = 0;
            if (instrument.ampEnvelope.amplitude) {
                mod += envelopeValueAtTime(instrument.ampEnvelope, time, gateLength);
            }
            if ((_a = instrument.ampLFO) === null || _a === void 0 ? void 0 : _a.amplitude) {
                mod += lfoValueAtTime(instrument.ampLFO, time);
            }
            return ((Math.max(Math.min(mod, instrument.ampEnvelope.amplitude), 0) / 1024) * maxVolume) | 0;
        }
        function envelopeValueAtTime(envelope, time, gateLength) {
            if (time > gateLength) {
                const releaseStartLevel = envelopeValueAtTime(envelope, gateLength, gateLength);
                if (time - gateLength > envelope.release)
                    return 0;
                else {
                    return releaseStartLevel - (releaseStartLevel / envelope.release) * (time - gateLength);
                }
            }
            else if (time < envelope.attack) {
                return (envelope.amplitude / envelope.attack) * time;
            }
            else if (time < envelope.attack + envelope.decay) {
                return envelope.amplitude - ((envelope.amplitude - ((envelope.sustain / 1024) * envelope.amplitude)) / envelope.decay) * (time - envelope.attack);
            }
            else {
                return (envelope.sustain / 1024) * envelope.amplitude;
            }
        }
        function lfoValueAtTime(lfo, time) {
            return Math.cos(((time / 1000) * lfo.frequency) * 2 * Math.PI) * lfo.amplitude;
        }
        function addNote(sndInstr, sndInstrPtr, ms, beg, end, soundWave, hz, endHz) {
            if (ms > 0) {
                sndInstr[sndInstrPtr] = soundWave;
                sndInstr[sndInstrPtr + 1] = 0;
                set16BitNumber(sndInstr, sndInstrPtr + 2, hz);
                set16BitNumber(sndInstr, sndInstrPtr + 4, ms);
                set16BitNumber(sndInstr, sndInstrPtr + 6, (beg * 255) >> 6);
                set16BitNumber(sndInstr, sndInstrPtr + 8, (end * 255) >> 6);
                set16BitNumber(sndInstr, sndInstrPtr + 10, endHz);
                sndInstrPtr += BUFFER_SIZE;
            }
            sndInstr[sndInstrPtr] = 0;
            return sndInstrPtr;
        }
        function set16BitNumber(buf, offset, value) {
            const temp = new Uint8Array(2);
            new Uint16Array(temp.buffer)[0] = value | 0;
            buf[offset] = temp[0];
            buf[offset + 1] = temp[1];
        }
        function get16BitNumber(buf, offset) {
            const temp = new Uint8Array(2);
            temp[0] = buf[offset];
            temp[1] = buf[offset + 1];
            return new Uint16Array(temp.buffer)[0];
        }
        function decodeSong(buf) {
            const res = {
                beatsPerMinute: get16BitNumber(buf, 1),
                beatsPerMeasure: buf[3],
                ticksPerBeat: buf[4],
                measures: buf[5],
                tracks: []
            };
            const numTracks = buf[6];
            let current = 7;
            for (let i = 0; i < numTracks; i++) {
                const [track, pointer] = decodeTrack(buf, current);
                current = pointer;
                res.tracks.push(track);
            }
            while (current < buf.length) {
                current = decodeTrackVelocity(buf, res.tracks, current);
            }
            return res;
        }
        music.decodeSong = decodeSong;
        function decodeInstrument(buf, offset) {
            return {
                waveform: buf[offset],
                ampEnvelope: {
                    attack: get16BitNumber(buf, offset + 1),
                    decay: get16BitNumber(buf, offset + 3),
                    sustain: get16BitNumber(buf, offset + 5),
                    release: get16BitNumber(buf, offset + 7),
                    amplitude: get16BitNumber(buf, offset + 9),
                },
                pitchEnvelope: {
                    attack: get16BitNumber(buf, offset + 11),
                    decay: get16BitNumber(buf, offset + 13),
                    sustain: get16BitNumber(buf, offset + 15),
                    release: get16BitNumber(buf, offset + 17),
                    amplitude: get16BitNumber(buf, offset + 19),
                },
                ampLFO: {
                    frequency: buf[offset + 21],
                    amplitude: get16BitNumber(buf, offset + 22)
                },
                pitchLFO: {
                    frequency: buf[offset + 24],
                    amplitude: get16BitNumber(buf, offset + 25)
                },
                octave: buf[offset + 27]
            };
        }
        function decodeTrack(buf, offset) {
            if (buf[offset + 1]) {
                return decodeDrumTrack(buf, offset);
            }
            return decodeMelodicTrack(buf, offset);
        }
        function decodeTrackVelocity(buf, tracks, offset) {
            const trackId = buf[offset];
            const track = tracks.find(t => t.id === trackId);
            if (!track)
                return buf.length;
            for (let i = 0; i < track.notes.length; i++) {
                track.notes[i].velocity = buf[offset + i + 1];
            }
            return offset + track.notes.length + 1;
        }
        function decodeDrumInstrument(buf, offset) {
            const res = {
                startFrequency: get16BitNumber(buf, offset + 1),
                startVolume: get16BitNumber(buf, offset + 3),
                steps: []
            };
            for (let i = 0; i < buf[offset]; i++) {
                const start = offset + 5 + i * 7;
                res.steps.push({
                    waveform: buf[start],
                    frequency: get16BitNumber(buf, start + 1),
                    volume: get16BitNumber(buf, start + 3),
                    duration: get16BitNumber(buf, start + 5)
                });
            }
            return res;
        }
        function decodeNoteEvent(buf, offset, instrumentOctave, isDrumTrack) {
            const res = {
                startTick: get16BitNumber(buf, offset),
                endTick: get16BitNumber(buf, offset + 2),
                notes: []
            };
            for (let i = 0; i < buf[offset + 4]; i++) {
                res.notes.push(decodeNote(buf[offset + 5 + i], instrumentOctave, isDrumTrack));
            }
            return res;
        }
        function decodeNote(note, instrumentOctave, isDrumTrack) {
            const flags = note >> 6;
            const result = {
                note: isDrumTrack ? note : ((note & 0x3f) + (instrumentOctave - 2) * 12),
                enharmonicSpelling: "normal"
            };
            if (flags === 1) {
                result.enharmonicSpelling = "flat";
            }
            else if (flags === 2) {
                result.enharmonicSpelling = "sharp";
            }
            return result;
        }
        function decodeMelodicTrack(buf, offset) {
            const res = {
                id: buf[offset],
                instrument: decodeInstrument(buf, offset + 4),
                notes: []
            };
            const noteStart = offset + 4 + get16BitNumber(buf, offset + 2);
            const noteLength = get16BitNumber(buf, noteStart);
            let currentOffset = noteStart + 2;
            while (currentOffset < noteStart + 2 + noteLength) {
                res.notes.push(decodeNoteEvent(buf, currentOffset, res.instrument.octave, false));
                currentOffset += 5 + res.notes[res.notes.length - 1].notes.length;
            }
            return [res, currentOffset];
        }
        function decodeDrumTrack(buf, offset) {
            const res = {
                id: buf[offset],
                instrument: { ampEnvelope: { attack: 0, decay: 0, sustain: 0, release: 0, amplitude: 0 }, waveform: 0 },
                notes: [],
                drums: []
            };
            const drumByteLength = get16BitNumber(buf, offset + 2);
            let currentOffset = offset + 4;
            while (currentOffset < offset + 4 + drumByteLength) {
                res.drums.push(decodeDrumInstrument(buf, currentOffset));
                currentOffset += 5 + 7 * res.drums[res.drums.length - 1].steps.length;
            }
            const noteLength = get16BitNumber(buf, currentOffset);
            currentOffset += 2;
            while (currentOffset < offset + 4 + drumByteLength + noteLength) {
                res.notes.push(decodeNoteEvent(buf, currentOffset, 0, true));
                currentOffset += 5 + res.notes[res.notes.length - 1].notes.length;
            }
            return [res, currentOffset];
        }
    })(music = pxsim.music || (pxsim.music = {}));
})(pxsim || (pxsim = {}));
/**
 * Adapted from lancaster-university/codal-microbit-v2
 * https://github.com/lancaster-university/codal-microbit-v2/blob/master/source/SoundEmojiSynthesizer.cpp
 */
var pxsim;
(function (pxsim) {
    var codal;
    (function (codal) {
        var music;
        (function (music) {
            // https://github.com/lancaster-university/codal-microbit-v2/blob/master/inc/SoundEmojiSynthesizer.h#L30
            music.EMOJI_SYNTHESIZER_SAMPLE_RATE = 44100;
            music.EMOJI_SYNTHESIZER_TONE_WIDTH_F = 1024;
            music.EMOJI_SYNTHESIZER_TONE_WIDTH = 1024;
            music.EMOJI_SYNTHESIZER_BUFFER_SIZE = 512;
            music.EMOJI_SYNTHESIZER_TONE_EFFECT_PARAMETERS = 2;
            music.EMOJI_SYNTHESIZER_TONE_EFFECTS = 3;
            music.EMOJI_SYNTHESIZER_STATUS_ACTIVE = 0x1;
            music.EMOJI_SYNTHESIZER_STATUS_OUTPUT_SILENCE_AS_EMPTY = 0x2;
            music.EMOJI_SYNTHESIZER_STATUS_STOPPING = 0x4;
            class SoundEmojiSynthesizer {
                constructor(id, sampleRate = music.EMOJI_SYNTHESIZER_SAMPLE_RATE) {
                    this.samplesPerStep = [];
                    this.status = 0;
                    this.effectPointer = 0;
                    this.position = 0;
                    this.bufferSize = music.EMOJI_SYNTHESIZER_BUFFER_SIZE;
                    this.sampleRate = sampleRate;
                    this.samplesToWrite = 0;
                    this.samplesWritten = 0;
                    this.sampleRange = 1023;
                    this.orMask = 0;
                    this.effectPointer = -1;
                    this.volume = 1;
                }
                get effect() {
                    return this.effectBuffer[this.effectPointer];
                }
                play(sound) {
                    this.effectBuffer = sound;
                    this.effectPointer = -1;
                    this.nextSoundEffect();
                }
                nextSoundEffect() {
                    const hadEffect = this.effect != null;
                    if (this.status & music.EMOJI_SYNTHESIZER_STATUS_STOPPING) {
                        this.effectPointer = null;
                        this.effectBuffer = [];
                    }
                    // If a sequence of SoundEffects are being played, attempt to move on to the next.
                    // If not, select the first in the buffer.
                    if (this.effect)
                        this.effectPointer++;
                    else
                        this.effectPointer = 0;
                    // Validate that we have a valid sound effect. If not, record that we have nothing to play.
                    if (this.effectPointer >= this.effectBuffer.length) {
                        // if we have an effect with a negative duration, reset the buffer (unless there is an update pending)
                        this.effectPointer = 0;
                        if (this.effect.duration >= 0) {
                            this.effectPointer = -1;
                            this.effectBuffer = [];
                            this.samplesWritten = 0;
                            this.samplesToWrite = 0;
                            this.position = 0;
                            return hadEffect;
                        }
                    }
                    // We have a valid buffer. Set up our synthesizer to the requested parameters.
                    this.samplesToWrite = this.determineSampleCount(this.effect.duration);
                    this.frequency = this.effect.frequency;
                    this.volume = this.effect.volume;
                    this.samplesWritten = 0;
                    // validate and initialise per effect rendering state.
                    for (let i = 0; i < music.EMOJI_SYNTHESIZER_TONE_EFFECTS; i++) {
                        this.effect.effects[i].step = 0;
                        this.effect.effects[i].steps = Math.max(this.effect.effects[i].steps, 1);
                        this.samplesPerStep[i] = Math.floor(this.samplesToWrite / this.effect.effects[i].steps);
                    }
                    return false;
                }
                pull() {
                    let done = false;
                    let sample;
                    let bufferEnd;
                    while (!done) {
                        if (this.samplesWritten == this.samplesToWrite || this.status & music.EMOJI_SYNTHESIZER_STATUS_STOPPING) {
                            let renderComplete = this.nextSoundEffect();
                            // If we have just completed active playout of an effect, and there are no more effects scheduled,
                            // unblock any fibers that may be waiting to play a sound effect.
                            if (this.samplesToWrite == 0 || this.status & music.EMOJI_SYNTHESIZER_STATUS_STOPPING) {
                                done = true;
                                if (renderComplete || this.status & music.EMOJI_SYNTHESIZER_STATUS_STOPPING) {
                                    this.status &= ~music.EMOJI_SYNTHESIZER_STATUS_STOPPING;
                                    // Event(id, DEVICE_SOUND_EMOJI_SYNTHESIZER_EVT_DONE);
                                    // lock.notify();
                                }
                            }
                        }
                        // If we have something to do, ensure our buffers are created.
                        // We defer creation to avoid unnecessary heap allocation when generating silence.
                        if (((this.samplesWritten < this.samplesToWrite) || !(this.status & music.EMOJI_SYNTHESIZER_STATUS_OUTPUT_SILENCE_AS_EMPTY)) && sample == null) {
                            this.buffer = new Array(this.bufferSize);
                            sample = 0;
                            bufferEnd = this.buffer.length;
                        }
                        // Generate some samples with the current this.effect parameters.
                        while (this.samplesWritten < this.samplesToWrite) {
                            let skip = ((music.EMOJI_SYNTHESIZER_TONE_WIDTH_F * this.frequency) / this.sampleRate);
                            let gain = (this.sampleRange * this.volume) / 1024;
                            let offset = 512 - (512 * gain);
                            let effectStepEnd = [];
                            for (let i = 0; i < music.EMOJI_SYNTHESIZER_TONE_EFFECTS; i++) {
                                effectStepEnd[i] = (this.samplesPerStep[i] * (this.effect.effects[i].step));
                                if (this.effect.effects[i].step == this.effect.effects[i].steps - 1)
                                    effectStepEnd[i] = this.samplesToWrite;
                            }
                            let stepEndPosition = effectStepEnd[0];
                            for (let i = 1; i < music.EMOJI_SYNTHESIZER_TONE_EFFECTS; i++)
                                stepEndPosition = Math.min(stepEndPosition, effectStepEnd[i]);
                            // Write samples until the end of the next this.effect-step
                            while (this.samplesWritten < stepEndPosition) {
                                // Stop processing when we've filled the requested this.buffer
                                if (sample == bufferEnd) {
                                    // downStream.pullRequest();
                                    return this.buffer;
                                }
                                // Synthesize a sample
                                let s = this.effect.tone.tonePrint(this.effect.tone.parameter, Math.max(this.position, 0));
                                // Apply volume scaling and OR mask (if specified).
                                this.buffer[sample] = (((s * gain) + offset)); // | this.orMask;
                                // Move on our pointers.
                                sample++;
                                this.samplesWritten++;
                                this.position += skip;
                                // Keep our toneprint pointer in range
                                while (this.position > music.EMOJI_SYNTHESIZER_TONE_WIDTH_F)
                                    this.position -= music.EMOJI_SYNTHESIZER_TONE_WIDTH_F;
                            }
                            // Invoke the this.effect function for any effects that are due.
                            for (let i = 0; i < music.EMOJI_SYNTHESIZER_TONE_EFFECTS; i++) {
                                if (this.samplesWritten == effectStepEnd[i]) {
                                    if (this.effect.effects[i].step < this.effect.effects[i].steps) {
                                        if (this.effect.effects[i].effect)
                                            this.effect.effects[i].effect(this, this.effect.effects[i]);
                                        this.effect.effects[i].step++;
                                    }
                                }
                            }
                        }
                    }
                    // if we have no data to send, return an empty this.buffer (if requested)
                    if (sample == null) {
                        this.buffer = [];
                    }
                    else {
                        // Pad the output this.buffer with silence if necessary.
                        const silence = (this.sampleRange * 0.5); // | this.orMask;
                        while (sample < bufferEnd) {
                            this.buffer[sample] = silence;
                            sample++;
                        }
                    }
                    // Issue a Pull Request so that we are always receiver driven, and we're done.
                    // downStream.pullRequest();
                    return this.buffer;
                }
                determineSampleCount(playoutTime) {
                    if (playoutTime < 0)
                        playoutTime = -playoutTime;
                    const seconds = playoutTime / 1000;
                    return Math.floor(this.sampleRate * seconds);
                }
                totalDuration() {
                    let duration = 0;
                    for (const effect of this.effectBuffer)
                        duration += effect.duration;
                    return duration;
                }
            }
            music.SoundEmojiSynthesizer = SoundEmojiSynthesizer;
        })(music = codal.music || (codal.music = {}));
    })(codal = pxsim.codal || (pxsim.codal = {}));
})(pxsim || (pxsim = {}));
/**
 * Adapted from lancaster-university/codal-core
 * https://github.com/lancaster-university/codal-core/blob/master/source/streams/Synthesizer.cpp#L54
 */
var pxsim;
(function (pxsim) {
    var codal;
    (function (codal) {
        var music;
        (function (music) {
            var Synthesizer;
            (function (Synthesizer) {
                const sineTone = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 11, 11, 12, 13, 13, 14, 15, 16, 16, 17, 18, 19, 20, 21, 22, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 45, 46, 47, 49, 50, 51, 53, 54, 56, 57, 58, 60, 61, 63, 64, 66, 68, 69, 71, 72, 74, 76, 77, 79, 81, 82, 84, 86, 87, 89, 91, 93, 95, 96, 98, 100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 141, 143, 145, 147, 149, 152, 154, 156, 158, 161, 163, 165, 167, 170, 172, 175, 177, 179, 182, 184, 187, 189, 191, 194, 196, 199, 201, 204, 206, 209, 211, 214, 216, 219, 222, 224, 227, 229, 232, 235, 237, 240, 243, 245, 248, 251, 253, 256, 259, 262, 264, 267, 270, 273, 275, 278, 281, 284, 287, 289, 292, 295, 298, 301, 304, 307, 309, 312, 315, 318, 321, 324, 327, 330, 333, 336, 339, 342, 345, 348, 351, 354, 357, 360, 363, 366, 369, 372, 375, 378, 381, 384, 387, 390, 393, 396, 399, 402, 405, 408, 411, 414, 417, 420, 424, 427, 430, 433, 436, 439, 442, 445, 448, 452, 455, 458, 461, 464, 467, 470, 473, 477, 480, 483, 486, 489, 492, 495, 498, 502, 505, 508, 511, 514, 517, 520, 524, 527, 530, 533, 536, 539, 542, 545, 549, 552, 555, 558, 561, 564, 567, 570, 574, 577, 580, 583, 586, 589, 592, 595, 598, 602, 605, 608, 611, 614, 617, 620, 623, 626, 629, 632, 635, 638, 641, 644, 647, 650, 653, 656, 659, 662, 665, 668, 671, 674, 677, 680, 683, 686, 689, 692, 695, 698, 701, 704, 707, 710, 713, 715, 718, 721, 724, 727, 730, 733, 735, 738, 741, 744, 747, 749, 752, 755, 758, 760, 763, 766, 769, 771, 774, 777, 779, 782, 785, 787, 790, 793, 795, 798, 800, 803, 806, 808, 811, 813, 816, 818, 821, 823, 826, 828, 831, 833, 835, 838, 840, 843, 845, 847, 850, 852, 855, 857, 859, 861, 864, 866, 868, 870, 873, 875, 877, 879, 881, 884, 886, 888, 890, 892, 894, 896, 898, 900, 902, 904, 906, 908, 910, 912, 914, 916, 918, 920, 922, 924, 926, 927, 929, 931, 933, 935, 936, 938, 940, 941, 943, 945, 946, 948, 950, 951, 953, 954, 956, 958, 959, 961, 962, 964, 965, 966, 968, 969, 971, 972, 973, 975, 976, 977, 979, 980, 981, 982, 984, 985, 986, 987, 988, 989, 990, 992, 993, 994, 995, 996, 997, 998, 999, 1000, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1006, 1007, 1008, 1009, 1009, 1010, 1011, 1011, 1012, 1013, 1013, 1014, 1014, 1015, 1015, 1016, 1016, 1017, 1017, 1018, 1018, 1019, 1019, 1019, 1020, 1020, 1020, 1021, 1021, 1021, 1021, 1022, 1022, 1022, 1022, 1022, 1022, 1022, 1022, 1022, 1022, 1023, 1022];
                const TONE_WIDTH = 1024;
                function SineTone(arg, position) {
                    position |= 0;
                    let off = TONE_WIDTH - position;
                    if (off < TONE_WIDTH / 2)
                        position = off;
                    return sineTone[position];
                }
                Synthesizer.SineTone = SineTone;
                function SawtoothTone(arg, position) {
                    return position;
                }
                Synthesizer.SawtoothTone = SawtoothTone;
                function TriangleTone(arg, position) {
                    return position < 512 ? position * 2 : (1023 - position) * 2;
                }
                Synthesizer.TriangleTone = TriangleTone;
                function NoiseTone(arg, position) {
                    // deterministic, semi-random noise
                    let mult = arg[0];
                    if (mult == 0)
                        mult = 7919;
                    return (position * mult) & 1023;
                }
                Synthesizer.NoiseTone = NoiseTone;
                function SquareWaveTone(arg, position) {
                    return position < 512 ? 1023 : 0;
                }
                Synthesizer.SquareWaveTone = SquareWaveTone;
            })(Synthesizer = music.Synthesizer || (music.Synthesizer = {}));
        })(music = codal.music || (codal.music = {}));
    })(codal = pxsim.codal || (pxsim.codal = {}));
})(pxsim || (pxsim = {}));
/**
 * Adapted from lancaster-university/codal-microbit-v2
 * https://github.com/lancaster-university/codal-microbit-v2/blob/master/source/SoundSynthesizerEffects.cpp
 */
var pxsim;
(function (pxsim) {
    var codal;
    (function (codal) {
        var music;
        (function (music) {
            var SoundSynthesizerEffects;
            (function (SoundSynthesizerEffects) {
                /*
                 * Definitions of standard progressions.
                 */
                /**
                 * Root Frequency Interpolation Effect Functions
                 */
                function noInterpolation(synth, context) {
                }
                SoundSynthesizerEffects.noInterpolation = noInterpolation;
                // Linear interpolate function.
                // parameter[0]: end frequency
                function linearInterpolation(synth, context) {
                    let interval = (context.parameter[0] - synth.effect.frequency) / context.steps;
                    synth.frequency = synth.effect.frequency + interval * context.step;
                }
                SoundSynthesizerEffects.linearInterpolation = linearInterpolation;
                // Linear interpolate function.
                // parameter[0]: end frequency
                function logarithmicInterpolation(synth, context) {
                    synth.frequency = synth.effect.frequency + (Math.log10(Math.max(context.step, 0.1)) * (context.parameter[0] - synth.effect.frequency) / 1.95);
                }
                SoundSynthesizerEffects.logarithmicInterpolation = logarithmicInterpolation;
                // Curve interpolate function
                // parameter[0]: end frequency
                function curveInterpolation(synth, context) {
                    synth.frequency = (Math.sin(context.step * 3.12159 / 180.0) * (context.parameter[0] - synth.effect.frequency) + synth.effect.frequency);
                }
                SoundSynthesizerEffects.curveInterpolation = curveInterpolation;
                // Cosine interpolate function
                // parameter[0]: end frequency
                function slowVibratoInterpolation(synth, context) {
                    synth.frequency = Math.sin(context.step / 10) * context.parameter[0] + synth.effect.frequency;
                }
                SoundSynthesizerEffects.slowVibratoInterpolation = slowVibratoInterpolation;
                //warble function
                // parameter[0]: end frequency
                function warbleInterpolation(synth, context) {
                    synth.frequency = (Math.sin(context.step) * (context.parameter[0] - synth.effect.frequency) + synth.effect.frequency);
                }
                SoundSynthesizerEffects.warbleInterpolation = warbleInterpolation;
                // Vibrato function
                // parameter[0]: end frequency
                function vibratoInterpolation(synth, context) {
                    synth.frequency = synth.effect.frequency + Math.sin(context.step) * context.parameter[0];
                }
                SoundSynthesizerEffects.vibratoInterpolation = vibratoInterpolation;
                // Exponential rising function
                // parameter[0]: end frequency
                function exponentialRisingInterpolation(synth, context) {
                    synth.frequency = synth.effect.frequency + Math.sin(0.01745329 * context.step) * context.parameter[0];
                }
                SoundSynthesizerEffects.exponentialRisingInterpolation = exponentialRisingInterpolation;
                // Exponential falling function
                function exponentialFallingInterpolation(synth, context) {
                    synth.frequency = synth.effect.frequency + Math.cos(0.01745329 * context.step) * context.parameter[0];
                }
                SoundSynthesizerEffects.exponentialFallingInterpolation = exponentialFallingInterpolation;
                // Argeppio functions
                function appregrioAscending(synth, context) {
                    synth.frequency = music.MusicalProgressions.calculateFrequencyFromProgression(synth.effect.frequency, context.parameter_p[0], context.step);
                }
                SoundSynthesizerEffects.appregrioAscending = appregrioAscending;
                function appregrioDescending(synth, context) {
                    synth.frequency = music.MusicalProgressions.calculateFrequencyFromProgression(synth.effect.frequency, context.parameter_p[0], context.steps - context.step - 1);
                }
                SoundSynthesizerEffects.appregrioDescending = appregrioDescending;
                /**
                 * Frequency Delta effects
                 */
                // Frequency vibrato function
                // parameter[0]: vibrato frequency multiplier
                function frequencyVibratoEffect(synth, context) {
                    if (context.step == 0)
                        return;
                    if (context.step % 2 == 0)
                        synth.frequency /= context.parameter[0];
                    else
                        synth.frequency *= context.parameter[0];
                }
                SoundSynthesizerEffects.frequencyVibratoEffect = frequencyVibratoEffect;
                // Volume vibrato function
                // parameter[0]: vibrato volume multiplier
                function volumeVibratoEffect(synth, context) {
                    if (context.step == 0)
                        return;
                    if (context.step % 2 == 0)
                        synth.volume /= context.parameter[0];
                    else
                        synth.volume *= context.parameter[0];
                }
                SoundSynthesizerEffects.volumeVibratoEffect = volumeVibratoEffect;
                /**
                 * Volume Delta effects
                 */
                /** Simple ADSR enveleope effect.
                 * parameter[0]: Centre volume
                 * parameter[1]: End volume
                 * effect.volume: start volume
                 */
                function adsrVolumeEffect(synth, context) {
                    let halfSteps = context.steps * 0.5;
                    if (context.step <= halfSteps) {
                        let delta = (context.parameter[0] - synth.effect.volume) / halfSteps;
                        synth.volume = synth.effect.volume + context.step * delta;
                    }
                    else {
                        let delta = (context.parameter[1] - context.parameter[0]) / halfSteps;
                        synth.volume = context.parameter[0] + (context.step - halfSteps) * delta;
                    }
                }
                SoundSynthesizerEffects.adsrVolumeEffect = adsrVolumeEffect;
                /**
                 * Simple volume ramp effect
                 * parameter[0]: End volume
                 * effect.volume: start volume
                 */
                function volumeRampEffect(synth, context) {
                    let delta = (context.parameter[0] - synth.effect.volume) / context.steps;
                    synth.volume = synth.effect.volume + context.step * delta;
                }
                SoundSynthesizerEffects.volumeRampEffect = volumeRampEffect;
            })(SoundSynthesizerEffects = music.SoundSynthesizerEffects || (music.SoundSynthesizerEffects = {}));
        })(music = codal.music || (codal.music = {}));
    })(codal = pxsim.codal || (pxsim.codal = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var codal;
    (function (codal) {
        var music;
        (function (music) {
            let WaveShape;
            (function (WaveShape) {
                WaveShape[WaveShape["Sine"] = 0] = "Sine";
                WaveShape[WaveShape["Sawtooth"] = 1] = "Sawtooth";
                WaveShape[WaveShape["Triangle"] = 2] = "Triangle";
                WaveShape[WaveShape["Square"] = 3] = "Square";
                WaveShape[WaveShape["Noise"] = 4] = "Noise";
            })(WaveShape = music.WaveShape || (music.WaveShape = {}));
            let InterpolationEffect;
            (function (InterpolationEffect) {
                InterpolationEffect[InterpolationEffect["None"] = 0] = "None";
                InterpolationEffect[InterpolationEffect["Linear"] = 1] = "Linear";
                InterpolationEffect[InterpolationEffect["Curve"] = 2] = "Curve";
                InterpolationEffect[InterpolationEffect["ExponentialRising"] = 5] = "ExponentialRising";
                InterpolationEffect[InterpolationEffect["ExponentialFalling"] = 6] = "ExponentialFalling";
                InterpolationEffect[InterpolationEffect["ArpeggioRisingMajor"] = 8] = "ArpeggioRisingMajor";
                InterpolationEffect[InterpolationEffect["ArpeggioRisingMinor"] = 10] = "ArpeggioRisingMinor";
                InterpolationEffect[InterpolationEffect["ArpeggioRisingDiminished"] = 12] = "ArpeggioRisingDiminished";
                InterpolationEffect[InterpolationEffect["ArpeggioRisingChromatic"] = 14] = "ArpeggioRisingChromatic";
                InterpolationEffect[InterpolationEffect["ArpeggioRisingWholeTone"] = 16] = "ArpeggioRisingWholeTone";
                InterpolationEffect[InterpolationEffect["ArpeggioFallingMajor"] = 9] = "ArpeggioFallingMajor";
                InterpolationEffect[InterpolationEffect["ArpeggioFallingMinor"] = 11] = "ArpeggioFallingMinor";
                InterpolationEffect[InterpolationEffect["ArpeggioFallingDiminished"] = 13] = "ArpeggioFallingDiminished";
                InterpolationEffect[InterpolationEffect["ArpeggioFallingChromatic"] = 15] = "ArpeggioFallingChromatic";
                InterpolationEffect[InterpolationEffect["ArpeggioFallingWholeTone"] = 17] = "ArpeggioFallingWholeTone";
                InterpolationEffect[InterpolationEffect["Logarithmic"] = 18] = "Logarithmic";
            })(InterpolationEffect = music.InterpolationEffect || (music.InterpolationEffect = {}));
            let Effect;
            (function (Effect) {
                Effect[Effect["None"] = 0] = "None";
                Effect[Effect["Vibrato"] = 1] = "Vibrato";
                Effect[Effect["Tremolo"] = 2] = "Tremolo";
                Effect[Effect["Warble"] = 3] = "Warble";
            })(Effect = music.Effect || (music.Effect = {}));
            class Sound {
                constructor() {
                    this.src = "000000000000000000000000000000000000000000000000000000000000000000000000";
                }
                get wave() {
                    return this.getValue(0, 1);
                }
                set wave(value) {
                    this.setValue(0, constrain(value, 0, 4), 1);
                }
                get volume() {
                    return this.getValue(1, 4);
                }
                set volume(value) {
                    this.setValue(1, constrain(value, 0, 1023), 4);
                }
                get frequency() {
                    return this.getValue(5, 4);
                }
                set frequency(value) {
                    this.setValue(5, value, 4);
                }
                get duration() {
                    return this.getValue(9, 4);
                }
                set duration(value) {
                    this.setValue(9, value, 4);
                }
                get shape() {
                    return this.getValue(13, 2);
                }
                set shape(value) {
                    this.setValue(13, value, 2);
                }
                get endFrequency() {
                    return this.getValue(18, 4);
                }
                set endFrequency(value) {
                    this.setValue(18, value, 4);
                }
                get endVolume() {
                    return this.getValue(26, 4);
                }
                set endVolume(value) {
                    this.setValue(26, constrain(value, 0, 1023), 4);
                }
                get steps() {
                    return this.getValue(30, 4);
                }
                set steps(value) {
                    this.setValue(30, value, 4);
                }
                get fx() {
                    return this.getValue(34, 2);
                }
                set fx(value) {
                    this.setValue(34, constrain(value, 0, 3), 2);
                }
                get fxParam() {
                    return this.getValue(36, 4);
                }
                set fxParam(value) {
                    this.setValue(36, value, 4);
                }
                get fxnSteps() {
                    return this.getValue(40, 4);
                }
                set fxnSteps(value) {
                    this.setValue(40, value, 4);
                }
                get frequencyRandomness() {
                    return this.getValue(44, 4);
                }
                set frequencyRandomness(value) {
                    this.setValue(44, value, 4);
                }
                get endFrequencyRandomness() {
                    return this.getValue(48, 4);
                }
                set endFrequencyRandomness(value) {
                    this.setValue(48, value, 4);
                }
                get volumeRandomness() {
                    return this.getValue(52, 4);
                }
                set volumeRandomness(value) {
                    this.setValue(52, value, 4);
                }
                get endVolumeRandomness() {
                    return this.getValue(56, 4);
                }
                set endVolumeRandomness(value) {
                    this.setValue(56, value, 4);
                }
                get durationRandomness() {
                    return this.getValue(60, 4);
                }
                set durationRandomness(value) {
                    this.setValue(60, value, 4);
                }
                get fxParamRandomness() {
                    return this.getValue(64, 4);
                }
                set fxParamRandomness(value) {
                    this.setValue(64, value, 4);
                }
                get fxnStepsRandomness() {
                    return this.getValue(68, 4);
                }
                set fxnStepsRandomness(value) {
                    this.setValue(68, value, 4);
                }
                copy() {
                    const result = new Sound();
                    result.src = this.src.slice(0);
                    return result;
                }
                setValue(offset, value, length) {
                    value = constrain(value | 0, 0, Math.pow(10, length) - 1);
                    this.src = this.src.substr(0, offset) + formatNumber(value, length) + this.src.substr(offset + length);
                }
                getValue(offset, length) {
                    return parseInt(this.src.substr(offset, length));
                }
            }
            music.Sound = Sound;
            function formatNumber(num, length) {
                let result = num + "";
                while (result.length < length)
                    result = "0" + result;
                return result;
            }
            let playing = false;
            let soundQueue;
            let cancellationToken = {
                cancelled: false
            };
            function isSoundExpPlaying() {
                return playing;
            }
            music.isSoundExpPlaying = isSoundExpPlaying;
            function __playSoundExpression(notes, waitTillDone, volume = 0.03) {
                if (!soundQueue)
                    soundQueue = [];
                const cb = pxsim.getResume();
                const soundPromise = new Promise((resolve, reject) => {
                    soundQueue.push({
                        notes,
                        volume,
                        onStarted: () => {
                            if (!waitTillDone)
                                cb();
                        },
                        onFinished: resolve,
                        onCancelled: resolve
                    });
                });
                if (!playing) {
                    playNextSoundAsync();
                }
                if (waitTillDone) {
                    soundPromise.then(cb);
                }
            }
            music.__playSoundExpression = __playSoundExpression;
            async function playNextSoundAsync() {
                if (soundQueue.length) {
                    playing = true;
                    const sound = soundQueue.shift();
                    let currentToken = cancellationToken;
                    try {
                        sound.onStarted();
                        await playSoundExpressionAsync(sound.notes, () => currentToken.cancelled, undefined, sound.volume);
                        if (currentToken.cancelled) {
                            sound.onCancelled();
                        }
                        else {
                            sound.onFinished();
                        }
                    }
                    catch (_a) {
                        sound.onCancelled();
                    }
                    playNextSoundAsync();
                }
                else {
                    playing = false;
                }
            }
            function clearSoundQueue() {
                soundQueue = [];
                cancellationToken.cancelled = true;
                cancellationToken = {
                    cancelled: false
                };
            }
            music.clearSoundQueue = clearSoundQueue;
            function playSoundExpressionAsync(notes, isCancelled, onPull, volume = 0.03) {
                const synth = new music.SoundEmojiSynthesizer(0);
                const soundEffects = parseSoundEffects(notes);
                synth.play(soundEffects);
                let cancelled = false;
                return Promise.race([
                    delayAsync(synth.totalDuration())
                        .then(() => {
                        // If safari didn't allow the sound to play for some reason,
                        // it will get delayed until the user does something that
                        // unmutes it. make sure we cancel it so that it doesn't
                        // play long after it was supposed to
                        cancelled = true;
                    }),
                    pxsim.AudioContextManager.playPCMBufferStreamAsync(() => {
                        if (!synth.effect)
                            return undefined;
                        const buff = synth.pull();
                        if (onPull)
                            onPull({ frequency: synth.frequency, volume: synth.volume });
                        const arr = new Float32Array(buff.length);
                        for (let i = 0; i < buff.length; i++) {
                            // Buffer is (0, 1023) we need to map it to (-1, 1)
                            arr[i] = ((buff[i] - 512) / 512);
                        }
                        return arr;
                    }, synth.sampleRate, volume, () => cancelled || (isCancelled && isCancelled()))
                ]);
            }
            music.playSoundExpressionAsync = playSoundExpressionAsync;
            function __stopSoundExpressions() {
                clearSoundQueue();
                pxsim.AudioContextManager.stopAll();
            }
            music.__stopSoundExpressions = __stopSoundExpressions;
            /**
             * Adapted from lancaster-university/codal-microbit-v2
             * https://github.com/lancaster-university/codal-microbit-v2/blob/master/source/SoundExpressions.cpp
             */
            function parseSoundEffects(notes) {
                // https://github.com/lancaster-university/codal-microbit-v2/blob/master/source/SoundExpressions.cpp#L57
                // 72 characters of sound data comma separated
                const charsPerEffect = 72;
                const effectCount = Math.floor((notes.length + 1) / (charsPerEffect + 1));
                const expectedLength = effectCount * (charsPerEffect + 1) - 1;
                if (notes.length != expectedLength) {
                    return [];
                }
                const soundEffects = [];
                for (let i = 0; i < effectCount; ++i) {
                    const start = i * charsPerEffect + i;
                    if (start > 0 && notes[start - 1] != ',') {
                        return [];
                    }
                    const effect = blankSoundEffect();
                    if (!parseSoundExpression(notes.substr(start), effect)) {
                        return [];
                    }
                    soundEffects.push(effect);
                }
                return soundEffects;
            }
            function parseSoundExpression(soundChars, fx) {
                // https://github.com/lancaster-university/codal-microbit-v2/blob/master/source/SoundExpressions.cpp#L115
                // Encoded as a sequence of zero padded decimal strings.
                // This encoding is worth reconsidering if we can!
                // The ADSR effect (and perhaps others in future) has two parameters which cannot be expressed.
                // 72 chars total
                //  [0] 0-4 wave
                let wave = parseInt(soundChars.substr(0, 1));
                //  [1] 0000-1023 volume
                let effectVolume = parseInt(soundChars.substr(1, 4));
                //  [5] 0000-9999 frequency
                let frequency = parseInt(soundChars.substr(5, 4));
                //  [9] 0000-9999 duration
                let duration = parseInt(soundChars.substr(9, 4));
                // [13] 00 shape (specific known values)
                let shape = parseInt(soundChars.substr(13, 2));
                // [15] XXX unused/bug. This was startFrequency but we use frequency above.
                // [18] 0000-9999 end frequency
                let endFrequency = parseInt(soundChars.substr(18, 4));
                // [22] XXXX unused. This was start volume but we use volume above.
                // [26] 0000-1023 end volume
                let endVolume = parseInt(soundChars.substr(26, 4));
                // [30] 0000-9999 steps
                let steps = parseInt(soundChars.substr(30, 4));
                // [34] 00-03 fx choice
                let fxChoice = parseInt(soundChars.substr(34, 2));
                // [36] 0000-9999 fxParam
                let fxParam = parseInt(soundChars.substr(36, 4));
                // [40] 0000-9999 fxnSteps
                let fxnSteps = parseInt(soundChars.substr(40, 4));
                // Details that encoded randomness to be applied when frame is used:
                // Can the randomness cause any parameters to go out of range?
                // [44] 0000-9999 frequency random
                frequency = applyRandom(frequency, parseInt(soundChars.substr(44, 4)));
                // [48] 0000-9999 end frequency random
                endFrequency = applyRandom(endFrequency, parseInt(soundChars.substr(48, 4)));
                // [52] 0000-9999 volume random
                effectVolume = applyRandom(effectVolume, parseInt(soundChars.substr(52, 4)));
                // [56] 0000-9999 end volume random
                endVolume = applyRandom(endVolume, parseInt(soundChars.substr(56, 4)));
                // [60] 0000-9999 duration random
                duration = applyRandom(duration, parseInt(soundChars.substr(60, 4)));
                // [64] 0000-9999 fxParamRandom
                fxParam = applyRandom(fxParam, parseInt(soundChars.substr(64, 4)));
                // [68] 0000-9999 fxnStepsRandom
                fxnSteps = applyRandom(fxnSteps, parseInt(soundChars.substr(68, 4)));
                if (frequency == -1 || endFrequency == -1 || effectVolume == -1 || endVolume == -1 || duration == -1 || fxParam == -1 || fxnSteps == -1) {
                    return false;
                }
                let volumeScaleFactor = 1;
                switch (wave) {
                    case 0:
                        fx.tone.tonePrint = music.Synthesizer.SineTone;
                        break;
                    case 1:
                        fx.tone.tonePrint = music.Synthesizer.SawtoothTone;
                        break;
                    case 2:
                        fx.tone.tonePrint = music.Synthesizer.TriangleTone;
                        break;
                    case 3:
                        fx.tone.tonePrint = music.Synthesizer.SquareWaveTone;
                        break;
                    case 4:
                        fx.tone.tonePrint = music.Synthesizer.NoiseTone;
                        break;
                }
                fx.frequency = frequency;
                fx.duration = duration;
                fx.effects[0].steps = steps;
                switch (shape) {
                    case 0:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.noInterpolation;
                        break;
                    case 1:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.linearInterpolation;
                        fx.effects[0].parameter[0] = endFrequency;
                        break;
                    case 2:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.curveInterpolation;
                        fx.effects[0].parameter[0] = endFrequency;
                        break;
                    case 5:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.exponentialRisingInterpolation;
                        fx.effects[0].parameter[0] = endFrequency;
                        break;
                    case 6:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.exponentialFallingInterpolation;
                        fx.effects[0].parameter[0] = endFrequency;
                        break;
                    case 8: // various ascending scales - see next switch
                    case 10:
                    case 12:
                    case 14:
                    case 16:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.appregrioAscending;
                        break;
                    case 9: // various descending scales - see next switch
                    case 11:
                    case 13:
                    case 15:
                    case 17:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.appregrioDescending;
                        break;
                    case 18:
                        fx.effects[0].effect = music.SoundSynthesizerEffects.logarithmicInterpolation;
                        fx.effects[0].parameter[0] = endFrequency;
                        break;
                }
                // Scale
                switch (shape) {
                    case 8:
                    case 9:
                        fx.effects[0].parameter_p[0] = music.MusicalProgressions.majorScale;
                        break;
                    case 10:
                    case 11:
                        fx.effects[0].parameter_p[0] = music.MusicalProgressions.minorScale;
                        break;
                    case 12:
                    case 13:
                        fx.effects[0].parameter_p[0] = music.MusicalProgressions.diminished;
                        break;
                    case 14:
                    case 15:
                        fx.effects[0].parameter_p[0] = music.MusicalProgressions.chromatic;
                        break;
                    case 16:
                    case 17:
                        fx.effects[0].parameter_p[0] = music.MusicalProgressions.wholeTone;
                        break;
                }
                // Volume envelope
                let effectVolumeFloat = CLAMP(0, effectVolume, 1023) / 1023.0;
                let endVolumeFloat = CLAMP(0, endVolume, 1023) / 1023.0;
                fx.volume = volumeScaleFactor * effectVolumeFloat;
                fx.effects[1].effect = music.SoundSynthesizerEffects.volumeRampEffect;
                fx.effects[1].steps = 36;
                fx.effects[1].parameter[0] = volumeScaleFactor * endVolumeFloat;
                // Vibrato effect
                // Steps need to be spread across duration evenly.
                let normalizedFxnSteps = Math.round(fx.duration / 10000 * fxnSteps);
                switch (fxChoice) {
                    case 1:
                        fx.effects[2].steps = normalizedFxnSteps;
                        fx.effects[2].effect = music.SoundSynthesizerEffects.frequencyVibratoEffect;
                        fx.effects[2].parameter[0] = fxParam;
                        break;
                    case 2:
                        fx.effects[2].steps = normalizedFxnSteps;
                        fx.effects[2].effect = music.SoundSynthesizerEffects.volumeVibratoEffect;
                        fx.effects[2].parameter[0] = fxParam;
                        break;
                    case 3:
                        fx.effects[2].steps = normalizedFxnSteps;
                        fx.effects[2].effect = music.SoundSynthesizerEffects.warbleInterpolation;
                        fx.effects[2].parameter[0] = fxParam;
                        break;
                }
                return true;
            }
            music.parseSoundExpression = parseSoundExpression;
            function random(max) {
                return Math.floor(Math.random() * max);
            }
            function CLAMP(min, value, max) {
                return Math.min(max, Math.max(min, value));
            }
            function applyRandom(value, rand) {
                if (value < 0 || rand < 0) {
                    return -1;
                }
                const delta = random(rand * 2 + 1) - rand;
                return Math.abs(value + delta);
            }
            function blankSoundEffect() {
                const res = {
                    frequency: 0,
                    volume: 1,
                    duration: 0,
                    tone: {
                        tonePrint: undefined,
                        parameter: [0]
                    },
                    effects: []
                };
                for (let i = 0; i < music.EMOJI_SYNTHESIZER_TONE_EFFECTS; i++) {
                    res.effects.push({
                        effect: undefined,
                        step: 0,
                        steps: 0,
                        parameter: [],
                        parameter_p: []
                    });
                }
                return res;
            }
            function delayAsync(millis) {
                return new Promise(resolve => setTimeout(resolve, millis));
            }
            function constrain(val, min, max) {
                return Math.min(Math.max(val, min), max);
            }
        })(music = codal.music || (codal.music = {}));
    })(codal = pxsim.codal || (pxsim.codal = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var AudioContextManager;
    (function (AudioContextManager) {
        let DistanceModelValue;
        (function (DistanceModelValue) {
            DistanceModelValue[DistanceModelValue["Linear"] = 0] = "Linear";
            DistanceModelValue[DistanceModelValue["Inverse"] = 1] = "Inverse";
            DistanceModelValue[DistanceModelValue["Exponential"] = 2] = "Exponential";
        })(DistanceModelValue = AudioContextManager.DistanceModelValue || (AudioContextManager.DistanceModelValue = {}));
        class SpatialAudioPlayer {
            constructor(context, destination) {
                this.context = context;
                this.id = SpatialAudioPlayer.nextId++;
                SpatialAudioPlayer.allPlayers.push(this);
                this.panner = new PannerNode(context, {
                    panningModel: 'HRTF',
                    distanceModel: "linear",
                });
                // Set initial position/orientation using the compat helpers
                // (Firefox doesn't support AudioParam-based position/orientation properties)
                setPannerPosition(this.panner, 0, 0, 0);
                setPannerOrientation(this.panner, 0, 0, -1);
                this.panner.connect(destination);
            }
            static disposeAll() {
                while (SpatialAudioPlayer.allPlayers.length) {
                    SpatialAudioPlayer.allPlayers[0].dispose();
                }
            }
            static getPlayerById(id) {
                for (const player of SpatialAudioPlayer.allPlayers) {
                    if (player.id === id)
                        return player;
                }
                return undefined;
            }
            setPosition(x, y, z) {
                setPannerPosition(this.panner, x, y, z);
            }
            setOrientation(x, y, z) {
                setPannerOrientation(this.panner, x, y, z);
            }
            setCone(innerAngle, outerAngle, outerGain) {
                this.panner.coneInnerAngle = innerAngle;
                this.panner.coneOuterAngle = outerAngle;
                this.panner.coneOuterGain = outerGain;
            }
            setRollOff(refDistance, maxDistance, rolloffFactor) {
                this.panner.refDistance = refDistance;
                this.panner.maxDistance = maxDistance;
                this.panner.rolloffFactor = rolloffFactor;
            }
            setDistanceModel(model) {
                switch (model) {
                    case DistanceModelValue.Linear:
                        this.panner.distanceModel = "linear";
                        break;
                    case DistanceModelValue.Inverse:
                        this.panner.distanceModel = "inverse";
                        break;
                    case DistanceModelValue.Exponential:
                        this.panner.distanceModel = "exponential";
                        break;
                }
            }
            get x() { var _a, _b; return (_b = (_a = this.panner.positionX) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0; }
            get y() { var _a, _b; return (_b = (_a = this.panner.positionY) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0; }
            get z() { var _a, _b; return (_b = (_a = this.panner.positionZ) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0; }
            dispose() {
                this.panner.disconnect();
                this.panner = undefined;
                if (this.audioWorkletSource) {
                    this.audioWorkletSource.dispose();
                    this.audioWorkletSource = undefined;
                }
                const idx = SpatialAudioPlayer.allPlayers.indexOf(this);
                if (idx >= 0)
                    SpatialAudioPlayer.allPlayers.splice(idx, 1);
            }
            async playInstructionsAsync(b) {
                await AudioContextManager.AudioWorkletSource.initializeWorklet(this.context);
                if (!this.audioWorkletSource || this.audioWorkletSource.isDisposed()) {
                    this.audioWorkletSource = new AudioContextManager.AudioWorkletSource(this.context, this.panner, true);
                }
                await this.audioWorkletSource.playInstructionsAsync(b);
            }
        }
        SpatialAudioPlayer.nextId = 1;
        SpatialAudioPlayer.allPlayers = [];
        AudioContextManager.SpatialAudioPlayer = SpatialAudioPlayer;
        // Firefox does not support AudioParam-based positionX/Y/Z and orientationX/Y/Z
        // on PannerNode or AudioListener. Fall back to the deprecated setPosition()/setOrientation() methods.
        function setPannerPosition(panner, x, y, z) {
            if (panner.positionX) {
                panner.positionX.setTargetAtTime(x, 0, 0.02);
                panner.positionY.setTargetAtTime(y, 0, 0.02);
                panner.positionZ.setTargetAtTime(z, 0, 0.02);
            }
            else {
                panner.setPosition(x, y, z);
            }
        }
        function setPannerOrientation(panner, x, y, z) {
            if (panner.orientationX) {
                panner.orientationX.setTargetAtTime(x, 0, 0.02);
                panner.orientationY.setTargetAtTime(y, 0, 0.02);
                panner.orientationZ.setTargetAtTime(z, 0, 0.02);
            }
            else {
                panner.setOrientation(x, y, z);
            }
        }
    })(AudioContextManager = pxsim.AudioContextManager || (pxsim.AudioContextManager = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    /**
     * This is adapted from pxt-common-packages/libs/mixer/melody.cpp
     *
     * The source is duplicated in docs/static/audioWorklet/audioWorkletProcessor.js,
     * which only exists to make development easier. You can switch to using the static
     * version by changing the worklet uri to "/static/audioWorklet/audioWorkletProcessor.js"
     * in getWorkletUri().
     */
    const source = `
    const SW_TRIANGLE = 1;
    const SW_SAWTOOTH = 2;
    const SW_SINE = 3;
    const SW_TUNEDNOISE = 4;
    const SW_NOISE = 5;
    const SW_SQUARE_10 = 11;
    const SW_SQUARE_50 = 15;
    const SW_SQUARE_CYCLE_16 = 16;
    const SW_SQUARE_CYCLE_32 = 17;
    const SW_SQUARE_CYCLE_64 = 18;
    const OUTPUT_BITS = 14;

    function instrSoundWave(instructions, index) {
        return instructions[index];
    }

    function instrFrequency(instructions, index) {
        return Math.min(20000, Math.max(20, readInt16(instructions, index + 2)));
    }

    function instrDuration(instructions, index) {
        return Math.min(60000, Math.max(1, readInt16(instructions, index + 4)));
    }

    function instrStartVolume(instructions, index) {
        return Math.min(1023, Math.max(0, readInt16(instructions, index + 6)));
    }

    function instrEndVolume(instructions, index) {
        return Math.min(1023, Math.max(0, readInt16(instructions, index + 8)));
    }

    function instrEndFrequency(instructions, index) {
        return Math.min(20000, Math.max(20, readInt16(instructions, index + 10)));
    }

    function readInt16(instructions, index) {
        return instructions[index] | (instructions[index + 1] << 8);
    }

    let x = 0xf01ba80;
    function noiseTone(sound, position, cycle) {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        return (x & 0xffff) - 0x7fff;
    }

    function sineTone(sound, position, cycle) {
        let p = position;
        if (p >= 512) {
            p -= 512;
        }
        if (p > 256) {
            p = 512 - p;
        }
        // Approximate sin(x * pi / 2) with the odd polynomial y = cx^5 + bx^3 + ax
        // using the constraint y(1) = 1 => a = 1 - b - c
        //   => y = c x^5 + b x^3 + (1 - b - c) * x
        //
        // Do a least-squares fit of this to sin(x * pi / 2) in the range 0..1
        // inclusive, using 21 evenly spaced points. Resulting approximation:
        //
        // sin(x*pi/2) ~= 0.0721435357258*x**5 - 0.642443736562*x**3 + 1.57030020084*x
        // Scale the constants by 32767 to match the desired output range.
        const c = 0.0721435357258 * 32767;
        const b = -0.642443736562 * 32767;
        const a = 1.57030020084 * 32767;
        // Calculate using y = ((c * x^2 + b) * x^2 + a) * x
        //
        // The position p is x * 256, so after each multiply with p we need to
        // shift right by 8 bits to keep the decimal point in the same place.  (The
        // approximation has a negative error near x=1 which helps avoid overflow.)
        const p2 = p * p;
        const u = (c * p2 >> 16) + b;
        const v = (u * p2 >> 16) + a;
        const w = v * p >> 8;
        // The result is within 7/32767 or 0.02%, signal-to-error ratio about 38 dB.
        return position >= 512 ? -w : w;
    }

    function sawtoothTone(sound, position, cycle) {
        return (position << 6) - 0x7fff;
    }

    function triangleTone(sound, position, cycle) {
        return position < 512 ? (position << 7) - 0x7fff : ((1023 - position) << 7) - 0x7fff;
    }

    function squareWaveTone(sound, position, cycle) {
        const wave = instrSoundWave(sound.instructions, sound.currInstr);
        return position < (102 * (wave - SW_SQUARE_10 + 1)) ? -0x7fff : 0x7fff;
    }

    let tunedSeed = 0xf01ba80;
    function tunedNoiseTone(sound, position, cycle) {
        // Generate a square wave filtered by a random bit sequence. Since the generator
        // is called multiple times per wave, use PlayingSound state data to ensure we
        // only generate a random bit once per wave, and then reuse it for future
        // calls for that wave.
        //
        // Use the low 6 bits of generatorState to store the last-used cycle, and
        // random_bit to store the last on/off state. (random_bit is arbitrary as
        // long as it isn't one of the low 6 bits.)
        const random_bit = 0x8000;
        const prev_cycle = sound.generatorState & 0x3f;
        let is_on;
        if (cycle == prev_cycle) {
            is_on = sound.generatorState & random_bit;
        }
        else {
            // see https://en.wikipedia.org/wiki/Xorshift
            tunedSeed ^= tunedSeed << 13;
            tunedSeed ^= tunedSeed >> 17;
            tunedSeed ^= tunedSeed << 5;
            is_on = (tunedSeed & random_bit);
            sound.generatorState = (cycle & 0x3f) | is_on;
        }
        if (!is_on)
            return 0;
        return position < 512 ? -0x7fff : 0x7fff;
    }

    // Bit patterns for use by the cyclic noise tone.
    //
    // The bit pattern is arbitrary, but should have equal numbers of 0 and 1 bits,
    // and should avoid long identical-bit runs for the lower parts. The values below
    // were chosen based on a random permutation of the hex nibbles 0..f and then
    // hand-tweaked by swapping some nibbles. Generated by:
    //
    //   shuf -i 0-15 | perl -ne 's/(\d+)/printf("%x",$1)/e'
    const cycle_bits = [0x2df0eb47, 0xc8165a93];
    const cycle_mask = [0xf, 0x1f, 0x3f];

    function cycleNoiseTone(sound, position, cycle) {
        // Generate a square wave filtered by a short-cycle pseudorandom bit sequence.
        // The bit sequence repeats every 16/32/64 waves.
        //
        // The "cycle" argument corresponds to the sequential number of the generated
        // wave. This is currently a 6-bit value. Since the pseudorandom bit sequences
        // evenly fit into this, there's no need to track generator state.
        const wave = instrSoundWave(sound.instructions, sound.currInstr);
        const cycle_index = wave - SW_SQUARE_CYCLE_16;
        // CLAMP(0, cycle_index, sizeof cycle_bits / sizeof cycle_bits[0])
        cycle &= cycle_mask[cycle_index];
        const is_on = (cycle_bits[cycle >> 5] & (1 << (cycle & 0x1f)));
        if (!is_on)
            return 0;
        return position < 512 ? -0x7fff : 0x7fff;
    }

    function silenceTone(sound, position, cycle) {
        return 0;
    }

    function getWaveFn(wave) {
        switch (wave) {
            case SW_TRIANGLE:
                return triangleTone;
            case SW_SAWTOOTH:
                return sawtoothTone;
            case SW_TUNEDNOISE:
                return tunedNoiseTone;
            case SW_NOISE:
                return noiseTone;
            case SW_SINE:
                return sineTone;
            default:
                if (SW_SQUARE_10 <= wave && wave <= SW_SQUARE_50)
                    return squareWaveTone;
                if (SW_SQUARE_CYCLE_16 <= wave && wave <= SW_SQUARE_CYCLE_64)
                    return cycleNoiseTone;
                else
                    return silenceTone;
        }
    }

    function fillSamples(dst, numsamples, sounds, sampleRate) {
        const samplesPerMS = (sampleRate << 8) / 1000;
        const toneStepMult = (1024.0 * (1 << 16)) / sampleRate;
        let fn;

        for (const snd of sounds) {
            let toneStep = 0;
            let toneDelta = 0;
            let volumeStep = 0;
            let tonePosition = snd.tonePosition;
            let samplesLeft = 0;
            let wave = 0;
            let volume = 0;

            snd.currInstr -= 12;

            for (let j = 0; j < numsamples; ++j) {
                if (samplesLeft == 0) {
                    snd.currInstr += 12;
                    if (snd.currInstr >= snd.instructions.length) {
                        break;
                    }
                    // SoundInstruction copy = *snd.currInstr;
                    // instr = &copy;

                    wave = instrSoundWave(snd.instructions, snd.currInstr);
                    fn = getWaveFn(wave);
                    samplesLeft = (instrDuration(snd.instructions, snd.currInstr) * samplesPerMS >> 8);
                    // make sure the division is signed
                    volumeStep = Math.floor(((instrEndVolume(snd.instructions, snd.currInstr) - instrStartVolume(snd.instructions, snd.currInstr)) << 16) / samplesLeft);
                    if (j == 0 && snd.prevVolume != -1) {
                        // restore previous state
                        samplesLeft = snd.samplesLeftInCurr;
                        volume = snd.prevVolume;
                        toneStep = snd.prevToneStep;
                        toneDelta = snd.prevToneDelta;
                    }
                    else {
                        // LOG("#sampl %d %p", samplesLeft, snd.currInstr);
                        volume = instrStartVolume(snd.instructions, snd.currInstr) << 16;
                        // LOG("%d-%dHz %d-%d vol", instr.frequency, instr.endFrequency,
                        //     instr.startVolume, instr.endVolume);
                        toneStep = Math.floor(toneStepMult * instrFrequency(snd.instructions, snd.currInstr));
                        if (instrFrequency(snd.instructions, snd.currInstr) != instrEndFrequency(snd.instructions, snd.currInstr)) {
                            const endToneStep = (toneStepMult * instrEndFrequency(snd.instructions, snd.currInstr)) | 0;
                            toneDelta = ((endToneStep - toneStep) / samplesLeft) | 0;
                        }
                        else {
                            toneDelta = 0;
                        }
                    }
                }
                let v = fn(snd, (tonePosition >> 16) & 1023, (tonePosition >> 26) & 0xff);
                v = (v * (volume >> 16)) >> (10 + (16 - OUTPUT_BITS));
                // if (v > MAXVAL)
                //    target_panic(123);
                for (const output of dst) {
                    for (const channel of output) {
                        channel[j] = channel[j] + (v / 0xffff);
                    }
                }
                // console.log("v", v);
                tonePosition += toneStep;
                toneStep += toneDelta;
                volume += volumeStep;
                samplesLeft--;
            }

            if (snd.currInstr >= snd.instructions.length) {
                // snd.sound.state = SoundState::Done;
                // snd.sound = NULL;
            }
            else {
                snd.tonePosition = tonePosition;
                if (samplesLeft == 0)
                    samplesLeft++; // avoid infinite loop in next iteration
                snd.samplesLeftInCurr = samplesLeft;
                snd.prevVolume = volume;
                snd.prevToneDelta = toneDelta;
                snd.prevToneStep = toneStep;
            }
        }
    }

    class MixerAudioWorkletProcessor extends AudioWorkletProcessor {
        constructor() {
            super();
            this.sounds = [];
            this.port.onmessage = event => {
                if (event.data.type === "play") {
                    this.sounds.push({
                        startSampleNo: 0,
                        samplesLeftInCurr: 0,
                        tonePosition: 0,
                        prevVolume: -1,
                        prevToneStep: 0,
                        prevToneDelta: 0,
                        generatorState: 0,
                        instructions: event.data.instructions,
                        currInstr: 0,
                        id: event.data.id
                    });
                }
                else if (event.data.type === "cancel") {
                    this.sounds = this.sounds.filter(s => s.id !== event.data.id);
                }
            };
        }

        process(inputs, outputs, parameters) {
            if (this.sounds.length) {
                fillSamples(outputs, outputs[0][0].length, this.sounds, sampleRate);

                for (const sound of this.sounds) {
                    if (sound.currInstr >= sound.instructions.length) {
                        this.port.postMessage({ type: "done", id: sound.id });
                    }
                }
                this.sounds = this.sounds.filter(s => s.currInstr < s.instructions.length);
            }
            return true;
        }
    }
    registerProcessor("pxt-mixer-audio-worklet-processor", MixerAudioWorkletProcessor);
    `;
    function getWorkletUri() {
        const b = new Blob([source], { type: "text/javascript" });
        return URL.createObjectURL(b);
    }
    pxsim.getWorkletUri = getWorkletUri;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    class Button {
        constructor(id) {
            this.id = id;
        }
    }
    pxsim.Button = Button;
    class ButtonPairState {
        constructor(props) {
            this.props = props;
            this.usesButtonAB = false;
            this.aBtn = new Button(this.props.ID_BUTTON_A);
            this.bBtn = new Button(this.props.ID_BUTTON_B);
            this.abBtn = new Button(this.props.ID_BUTTON_AB);
            this.abBtn.virtual = true;
        }
    }
    pxsim.ButtonPairState = ButtonPairState;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    class CompassState {
        constructor() {
            this.usesHeading = false;
            this.heading = 90;
        }
    }
    pxsim.CompassState = CompassState;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    class FileSystemState {
        constructor() {
            this.files = {};
        }
        append(file, content) {
            this.files[file] = (this.files[file] || "") + content;
        }
        remove(file) {
            delete this.files[file];
        }
    }
    pxsim.FileSystemState = FileSystemState;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    class LightSensorState {
        constructor() {
            this.usesLightLevel = false;
            this.lightLevel = 128;
        }
    }
    pxsim.LightSensorState = LightSensorState;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        visuals.mkBoardView = (opts) => {
            const boardVis = opts.visual;
            return new visuals.GenericBoardSvg({
                visualDef: boardVis,
                boardDef: opts.boardDef,
                wireframe: opts.wireframe,
            });
        };
        class BoardHost {
            constructor(view, opts) {
                this.parts = [];
                this.boardView = view;
                this.opts = opts;
                if (!opts.boardDef.pinStyles)
                    opts.boardDef.pinStyles = {};
                this.state = opts.state;
                let activeComponents = opts.partsList;
                let useBreadboardView = 0 < activeComponents.length || opts.forceBreadboardLayout;
                if (useBreadboardView) {
                    this.breadboard = new visuals.Breadboard({
                        wireframe: opts.wireframe,
                    });
                    const bMarg = opts.boardDef.marginWhenBreadboarding || [0, 0, 40, 0];
                    const composition = visuals.composeSVG({
                        el1: this.boardView.getView(),
                        scaleUnit1: this.boardView.getPinDist(),
                        el2: this.breadboard.getSVGAndSize(),
                        scaleUnit2: this.breadboard.getPinDist(),
                        margin: [bMarg[0], bMarg[1], 20, bMarg[3]],
                        middleMargin: bMarg[2],
                        maxWidth: opts.maxWidth,
                        maxHeight: opts.maxHeight,
                    });
                    const under = composition.under;
                    const over = composition.over;
                    this.view = composition.host;
                    const edges = composition.edges;
                    this.fromMBCoord = composition.toHostCoord1;
                    this.fromBBCoord = composition.toHostCoord2;
                    this.partGroup = over;
                    this.partOverGroup = pxsim.svg.child(this.view, "g");
                    this.style = pxsim.svg.child(this.view, "style", {});
                    this.defs = pxsim.svg.child(this.view, "defs", {});
                    this.wireFactory = new visuals.WireFactory(under, over, edges, this.style, this.getLocCoord.bind(this), this.getPinStyle.bind(this));
                    const allocRes = pxsim.allocateDefinitions({
                        boardDef: opts.boardDef,
                        partDefs: opts.partDefs,
                        fnArgs: opts.fnArgs,
                        getBBCoord: this.breadboard.getCoord.bind(this.breadboard),
                        partsList: activeComponents,
                    });
                    if (!allocRes.partsAndWires.length && !opts.forceBreadboardLayout) {
                        // nothing got allocated, so we rollback the changes.
                        useBreadboardView = false;
                    }
                    else {
                        this.addAll(allocRes);
                        if (!allocRes.requiresBreadboard && !opts.forceBreadboardRender)
                            useBreadboardView = false;
                        else if (allocRes.hideBreadboard && this.breadboard)
                            this.breadboard.hide();
                    }
                }
                if (!useBreadboardView) {
                    // delete any kind of left over
                    delete this.breadboard;
                    delete this.wireFactory;
                    delete this.partOverGroup;
                    delete this.partGroup;
                    delete this.style;
                    delete this.defs;
                    delete this.fromBBCoord;
                    delete this.fromMBCoord;
                    // allocate view
                    const el = this.boardView.getView().el;
                    this.view = el;
                    this.partGroup = pxsim.svg.child(this.view, "g");
                    this.partOverGroup = pxsim.svg.child(this.view, "g");
                    if (opts.maxWidth)
                        pxsim.svg.hydrate(this.view, { width: opts.maxWidth });
                    if (opts.maxHeight)
                        pxsim.svg.hydrate(this.view, { height: opts.maxHeight });
                }
                this.state.updateSubscribers.push(() => this.updateState());
            }
            highlightBoardPin(pinNm) {
                this.boardView.highlightPin(pinNm);
            }
            removeEventListeners() {
                if (this.boardView.removeEventListeners) {
                    this.boardView.removeEventListeners();
                }
            }
            highlightBreadboardPin(rowCol) {
                this.breadboard.highlightLoc(rowCol);
            }
            highlightWire(wire) {
                //TODO: move to wiring.ts
                //underboard wires
                wire.wires.forEach(e => {
                    pxsim.U.addClass(e, "highlight");
                    e.style["visibility"] = "visible";
                });
                //un greyed out
                pxsim.U.addClass(wire.endG, "highlight");
            }
            getView() {
                return this.view;
            }
            screenshotAsync(width) {
                // only clone the svg node with class="sim" so that screenshot doesn't include external parts
                const simEl = this.view.classList.contains("sim") ? this.view : this.view.querySelector(".sim");
                const svg = simEl ? simEl.cloneNode(true) : this.view.cloneNode(true);
                svg.setAttribute('width', svg.viewBox.baseVal.width + "");
                svg.setAttribute('height', svg.viewBox.baseVal.height + "");
                const xml = new XMLSerializer().serializeToString(svg);
                const data = "data:image/svg+xml,"
                    + encodeURIComponent(xml.replace(/\s+/g, ' ').replace(/"/g, "'"));
                return new Promise((resolve, reject) => {
                    const img = document.createElement("img");
                    img.onload = () => {
                        const cvs = document.createElement("canvas");
                        cvs.width = img.width;
                        cvs.height = img.height;
                        // check if a width or a height was specified
                        if (width > 0) {
                            cvs.width = width;
                            cvs.height = (img.height * width / img.width) | 0;
                        }
                        else if (cvs.width < 200) {
                            cvs.width *= 2;
                            cvs.height *= 2;
                        }
                        else if (cvs.width > 480) {
                            cvs.width /= 2;
                            cvs.height /= 2;
                        }
                        const ctx = cvs.getContext("2d");
                        ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
                        resolve(ctx.getImageData(0, 0, cvs.width, cvs.height));
                    };
                    img.onerror = e => {
                        pxsim.log(e);
                        resolve(undefined);
                    };
                    img.src = data;
                });
            }
            updateState() {
                this.parts.forEach(c => c.updateState());
            }
            getBBCoord(rowCol) {
                let bbCoord = this.breadboard.getCoord(rowCol);
                return this.fromBBCoord(bbCoord);
            }
            getPinCoord(pin) {
                let boardCoord = this.boardView.getCoord(pin);
                if (!boardCoord) {
                    pxsim.error(`Unable to find coord for pin: ${pin}`);
                    return undefined;
                }
                return this.fromMBCoord(boardCoord);
            }
            getLocCoord(loc) {
                let coord;
                if (loc.type === "breadboard") {
                    let rowCol = loc;
                    coord = this.getBBCoord(rowCol);
                }
                else {
                    let pinNm = loc.pin;
                    coord = this.getPinCoord(pinNm);
                }
                if (!coord)
                    pxsim.debug("Unknown location: " + name);
                return coord;
            }
            getPinStyle(loc) {
                if (loc.type == "breadboard")
                    return "female";
                else
                    return this.opts.boardDef.pinStyles[loc.pin] || "female";
            }
            addPart(partInst) {
                let part = null;
                if (partInst.simulationBehavior) {
                    //TODO: seperate simulation behavior from builtin visual
                    let builtinBehavior = partInst.simulationBehavior;
                    let cnstr = this.state.builtinVisuals[builtinBehavior];
                    let stateFn = this.state.builtinParts[builtinBehavior];
                    part = cnstr();
                    part.init(this.state.bus, stateFn, this.view, partInst.params);
                }
                else {
                    let vis = partInst.visual;
                    part = new visuals.GenericPart(vis);
                }
                this.parts.push(part);
                this.partGroup.appendChild(part.element);
                if (part.overElement)
                    this.partOverGroup.appendChild(part.overElement);
                if (part.defs)
                    part.defs.forEach(d => this.defs.appendChild(d));
                this.style.textContent += part.style || "";
                let colIdx = partInst.startColumnIdx;
                let rowIdx = partInst.startRowIdx;
                let row = visuals.getRowName(rowIdx);
                let col = visuals.getColumnName(colIdx);
                let xOffset = partInst.bbFit.xOffset / partInst.visual.pinDistance;
                let yOffset = partInst.bbFit.yOffset / partInst.visual.pinDistance;
                let rowCol = {
                    type: "breadboard",
                    row: row,
                    col: col,
                    xOffset: xOffset,
                    yOffset: yOffset
                };
                let coord = this.getBBCoord(rowCol);
                part.moveToCoord(coord);
                let getCmpClass = (type) => `sim-${type}-cmp`;
                let cls = getCmpClass(partInst.name);
                pxsim.U.addClass(part.element, cls);
                pxsim.U.addClass(part.element, "sim-cmp");
                part.updateTheme();
                part.updateState();
                return part;
            }
            addWire(inst) {
                return this.wireFactory.addWire(inst.start, inst.end, inst.color);
            }
            addAll(allocRes) {
                allocRes.partsAndWires.forEach(pAndWs => {
                    const wires = pAndWs.wires;
                    const wiresOk = wires && wires.every(w => this.wireFactory.checkWire(w.start, w.end));
                    if (wiresOk) // try to add all the wires
                        wires.forEach(w => allocRes.wires.push(this.addWire(w)));
                    let part = pAndWs.part;
                    if (part && (!wires || wiresOk))
                        allocRes.parts.push(this.addPart(part));
                });
                // at least one wire
                allocRes.requiresBreadboard = !!allocRes.wires.length
                    || !!allocRes.parts.length;
            }
        }
        visuals.BoardHost = BoardHost;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        // The distance between the center of two pins. This is the constant on which everything else is based.
        const PIN_DIST = 15;
        // CSS styling for the breadboard
        const BLUE = "#1AA5D7";
        const RED = "#DD4BA0";
        const BREADBOARD_CSS = `
        /* bread board */
        .sim-bb-background {
            fill:#E0E0E0;
        }
        .sim-bb-pin {
            fill:#999;
        }
        .sim-bb-pin-hover {
            visibility: hidden;
            pointer-events: all;
            stroke-width: ${PIN_DIST / 2}px;
            stroke: transparent;
            fill: #777;
        }
        .sim-bb-pin-hover:hover {
            visibility: visible;
            fill:#444;
        }
        .sim-bb-group-wire {
            stroke: #999;
            stroke-width: ${PIN_DIST / 4}px;
            visibility: hidden;
        }
        .sim-bb-pin-group {
            pointer-events: all;
        }
        .sim-bb-label,
        .sim-bb-label-hover {
            font-family:"Lucida Console", Monaco, monospace;
            fill:#555;
            pointer-events: all;
            stroke-width: 0;
            cursor: default;
        }
        .sim-bb-label-hover {
            visibility: hidden;
            fill:#000;
            font-weight: bold;
        }
        .sim-bb-bar {
            stroke-width: 0;
        }
        .sim-bb-blue {
            fill:${BLUE};
            stroke:${BLUE}
        }
        .sim-bb-red {
            fill:${RED};
            stroke:${RED};
        }
        .sim-bb-pin-group:hover .sim-bb-pin-hover,
        .sim-bb-pin-group:hover .sim-bb-group-wire,
        .sim-bb-pin-group:hover .sim-bb-label-hover {
            visibility: visible;
        }
        .sim-bb-pin-group:hover .sim-bb-label {
            visibility: hidden;
        }
        /* outline mode */
        .sim-bb-outline .sim-bb-background {
            stroke-width: ${PIN_DIST / 7}px;
            fill: #FFF;
            stroke: #000;
        }
        .sim-bb-outline .sim-bb-mid-channel {
            fill: #FFF;
            stroke: #888;
            stroke-width: 2px;
        }
        /* grayed out */
        .grayed .sim-bb-background {
            stroke-width: ${PIN_DIST / 5}px;
        }
        .grayed .sim-bb-red,
        .grayed .sim-bb-blue {
            fill: #BBB;
        }
        .grayed .sim-bb-bar {
            fill: #FFF;
        }
        .grayed .sim-bb-pin {
            fill: #000;
            stroke: #FFF;
            stroke-width: 3px;
        }
        .grayed .sim-bb-label {
            fill: none;
        }
        .grayed .sim-bb-background {
            stroke-width: ${PIN_DIST / 2}px;
            stroke: #555;
        }
        .grayed .sim-bb-group-wire {
            stroke: #DDD;
        }
        .grayed .sim-bb-channel {
            visibility: hidden;
        }
        /* highlighted */
        .sim-bb-label.highlight {
            visibility: hidden;
        }
        .sim-bb-label-hover.highlight {
            visibility: visible;
        }
        .sim-bb-blue.highlight {
            fill:${BLUE};
        }
        .sim-bb-red.highlight {
            fill:${RED};
        }
        .sim-bb-bar.highlight {
            stroke-width: 0px;
        }
        `;
        // Pin rows and coluns
        visuals.BREADBOARD_MID_ROWS = 10;
        visuals.BREADBOARD_MID_COLS = 30;
        const MID_ROW_GAPS = [4, 4];
        const MID_ROW_AND_GAPS = visuals.BREADBOARD_MID_ROWS + MID_ROW_GAPS.length;
        const BAR_ROWS = 2;
        const BAR_COLS = 25;
        const POWER_ROWS = BAR_ROWS * 2;
        const POWER_COLS = BAR_COLS * 2;
        const BAR_COL_GAPS = [4, 9, 14, 19];
        const BAR_COL_AND_GAPS = BAR_COLS + BAR_COL_GAPS.length;
        // Essential dimensions
        const WIDTH = PIN_DIST * (visuals.BREADBOARD_MID_COLS + 3);
        const HEIGHT = PIN_DIST * (MID_ROW_AND_GAPS + POWER_ROWS + 5.5);
        const MID_RATIO = 2.0 / 3.0;
        const BAR_RATIO = (1.0 - MID_RATIO) * 0.5;
        const MID_HEIGHT = HEIGHT * MID_RATIO;
        const BAR_HEIGHT = HEIGHT * BAR_RATIO;
        // Pin grids
        const MID_GRID_WIDTH = (visuals.BREADBOARD_MID_COLS - 1) * PIN_DIST;
        const MID_GRID_HEIGHT = (MID_ROW_AND_GAPS - 1) * PIN_DIST;
        const MID_GRID_X = (WIDTH - MID_GRID_WIDTH) / 2.0;
        const MID_GRID_Y = BAR_HEIGHT + (MID_HEIGHT - MID_GRID_HEIGHT) / 2.0;
        const BAR_GRID_HEIGHT = (BAR_ROWS - 1) * PIN_DIST;
        const BAR_GRID_WIDTH = (BAR_COL_AND_GAPS - 1) * PIN_DIST;
        const BAR_TOP_GRID_X = (WIDTH - BAR_GRID_WIDTH) / 2.0;
        const BAR_TOP_GRID_Y = (BAR_HEIGHT - BAR_GRID_HEIGHT) / 2.0;
        const BAR_BOT_GRID_X = BAR_TOP_GRID_X;
        const BAR_BOT_GRID_Y = BAR_TOP_GRID_Y + BAR_HEIGHT + MID_HEIGHT;
        // Individual pins
        const PIN_HOVER_SCALAR = 1.3;
        const PIN_WIDTH = PIN_DIST / 2.5;
        const PIN_ROUNDING = PIN_DIST / 7.5;
        // Labels
        const PIN_LBL_SIZE = PIN_DIST * 0.7;
        const PIN_LBL_HOVER_SCALAR = 1.3;
        const PLUS_LBL_SIZE = PIN_DIST * 1.7;
        const MINUS_LBL_SIZE = PIN_DIST * 2;
        const POWER_LBL_OFFSET = PIN_DIST * 0.8;
        const MINUS_LBL_EXTRA_OFFSET = PIN_DIST * 0.07;
        const LBL_ROTATION = -90;
        // Channels
        const CHANNEL_HEIGHT = PIN_DIST * 1.0;
        const SMALL_CHANNEL_HEIGHT = PIN_DIST * 0.05;
        // Background
        const BACKGROUND_ROUNDING = PIN_DIST * 0.3;
        // Row and column helpers
        const alphabet = "abcdefghij".split("").reverse();
        function getColumnName(colIdx) { return `${colIdx + 1}`; }
        visuals.getColumnName = getColumnName;
        ;
        function getRowName(rowIdx) { return alphabet[rowIdx]; }
        visuals.getRowName = getRowName;
        ;
        ;
        ;
        function mkGrid(opts) {
            let xOff = opts.xOffset || 0;
            let yOff = opts.yOffset || 0;
            let allPins = [];
            let grid = pxsim.svg.elt("g");
            let colIdxOffset = opts.colStartIdx || 0;
            let rowIdxOffset = opts.rowStartIdx || 0;
            let copyArr = (arr) => arr ? arr.slice(0, arr.length) : [];
            let removeAll = (arr, e) => {
                let res = 0;
                let idx;
                /* eslint-disable no-cond-assign */
                while (0 <= (idx = arr.indexOf(e))) {
                    /* eslint-enable no-cond-assign */
                    arr.splice(idx, 1);
                    res += 1;
                }
                return res;
            };
            let rowGaps = 0;
            let rowIdxsWithGap = copyArr(opts.rowIdxsWithGap);
            for (let i = 0; i < opts.rowCount; i++) {
                let colGaps = 0;
                let colIdxsWithGap = copyArr(opts.colIdxsWithGap);
                let cy = yOff + i * opts.pinDist + rowGaps * opts.pinDist;
                let rowIdx = i + rowIdxOffset;
                for (let j = 0; j < opts.colCount; j++) {
                    let cx = xOff + j * opts.pinDist + colGaps * opts.pinDist;
                    let colIdx = j + colIdxOffset;
                    const addEl = (pin) => {
                        pxsim.svg.hydrate(pin.el, pin.el.tagName == "circle"
                            ? { cx, cy }
                            : { x: cx - pin.w * 0.5, y: cy - pin.h * 0.5 });
                        grid.appendChild(pin.el);
                        return pin.el;
                    };
                    let el = addEl(opts.mkPin());
                    let hoverEl = addEl(opts.mkHoverPin());
                    let row = opts.getRowName(rowIdx);
                    let col = opts.getColName(colIdx);
                    let group = opts.getGroupName ? opts.getGroupName(rowIdx, colIdx) : null;
                    let gridPin = { el: el, hoverEl: hoverEl, cx: cx, cy: cy, row: row, col: col, group: group };
                    allPins.push(gridPin);
                    //column gaps
                    colGaps += removeAll(colIdxsWithGap, colIdx);
                }
                //row gaps
                rowGaps += removeAll(rowIdxsWithGap, rowIdx);
            }
            return { g: grid, allPins: allPins };
        }
        visuals.mkGrid = mkGrid;
        function mkBBPin() {
            let el = pxsim.svg.elt("rect");
            let width = PIN_WIDTH;
            pxsim.svg.hydrate(el, {
                class: "sim-bb-pin",
                rx: PIN_ROUNDING,
                ry: PIN_ROUNDING,
                width: width,
                height: width
            });
            return { el: el, w: width, h: width, x: 0, y: 0 };
        }
        function mkBBHoverPin() {
            let el = pxsim.svg.elt("rect");
            let width = PIN_WIDTH * PIN_HOVER_SCALAR;
            pxsim.svg.hydrate(el, {
                class: "sim-bb-pin-hover",
                rx: PIN_ROUNDING,
                ry: PIN_ROUNDING,
                width: width,
                height: width,
            });
            return { el: el, w: width, h: width, x: 0, y: 0 };
        }
        ;
        function mkBBLabel(cx, cy, size, rotation, txt, group, extraClasses) {
            //lbl
            let el = visuals.mkTxt(cx, cy, size, rotation, txt);
            pxsim.U.addClass(el, "sim-bb-label");
            if (extraClasses)
                extraClasses.forEach(c => pxsim.U.addClass(el, c));
            //hover lbl
            let hoverEl = visuals.mkTxt(cx, cy, size * PIN_LBL_HOVER_SCALAR, rotation, txt);
            pxsim.U.addClass(hoverEl, "sim-bb-label-hover");
            if (extraClasses)
                extraClasses.forEach(c => pxsim.U.addClass(hoverEl, c));
            let lbl = { el: el, hoverEl: hoverEl, txt: txt, group: group };
            return lbl;
        }
        ;
        class Breadboard {
            constructor(opts) {
                //truth
                this.allPins = [];
                this.allLabels = [];
                this.allPowerBars = [];
                //quick lookup caches
                this.rowColToPin = {};
                this.rowColToLbls = {};
                this.buildDom();
                if (opts.wireframe)
                    pxsim.U.addClass(this.bb, "sim-bb-outline");
            }
            hide() {
                this.bb.style.display = 'none';
            }
            updateLocation(x, y) {
                pxsim.svg.hydrate(this.bb, {
                    x: `${x}px`,
                    y: `${y}px`,
                });
            }
            getPin(row, col) {
                let colToPin = this.rowColToPin[row];
                if (!colToPin)
                    return null;
                let pin = colToPin[col];
                if (!pin)
                    return null;
                return pin;
            }
            getCoord(rowCol) {
                let { row, col, xOffset, yOffset } = rowCol;
                let pin = this.getPin(row, col);
                if (!pin)
                    return null;
                let xOff = (xOffset || 0) * PIN_DIST;
                let yOff = (yOffset || 0) * PIN_DIST;
                return [pin.cx + xOff, pin.cy + yOff];
            }
            getPinDist() {
                return PIN_DIST;
            }
            buildDom() {
                this.bb = pxsim.svg.elt("svg", {
                    "version": "1.0",
                    "viewBox": `0 0 ${WIDTH} ${HEIGHT}`,
                    "class": `sim-bb`,
                    "width": WIDTH + "px",
                    "height": HEIGHT + "px",
                });
                this.styleEl = pxsim.svg.child(this.bb, "style", {});
                this.styleEl.textContent += BREADBOARD_CSS;
                this.defs = pxsim.svg.child(this.bb, "defs", {});
                //background
                pxsim.svg.child(this.bb, "rect", { class: "sim-bb-background", width: WIDTH, height: HEIGHT, rx: BACKGROUND_ROUNDING, ry: BACKGROUND_ROUNDING });
                //mid channel
                let channelGid = "sim-bb-channel-grad";
                let channelGrad = pxsim.svg.elt("linearGradient");
                pxsim.svg.hydrate(channelGrad, { id: channelGid, x1: "0%", y1: "0%", x2: "0%", y2: "100%" });
                this.defs.appendChild(channelGrad);
                let channelDark = "#AAA";
                let channelLight = "#CCC";
                let stop1 = pxsim.svg.child(channelGrad, "stop", { offset: "0%", style: `stop-color: ${channelDark};` });
                let stop2 = pxsim.svg.child(channelGrad, "stop", { offset: "20%", style: `stop-color: ${channelLight};` });
                let stop3 = pxsim.svg.child(channelGrad, "stop", { offset: "80%", style: `stop-color: ${channelLight};` });
                let stop4 = pxsim.svg.child(channelGrad, "stop", { offset: "100%", style: `stop-color: ${channelDark};` });
                const mkChannel = (cy, h, cls) => {
                    let channel = pxsim.svg.child(this.bb, "rect", { class: `sim-bb-channel ${cls || ""}`, y: cy - h / 2, width: WIDTH, height: h });
                    channel.setAttribute("fill", `url(#${channelGid})`);
                    return channel;
                };
                mkChannel(BAR_HEIGHT + MID_HEIGHT / 2, CHANNEL_HEIGHT, "sim-bb-mid-channel");
                mkChannel(BAR_HEIGHT, SMALL_CHANNEL_HEIGHT, "sim-bb-sml-channel");
                mkChannel(BAR_HEIGHT + MID_HEIGHT, SMALL_CHANNEL_HEIGHT, "sim-bb-sml-channel");
                //-----pins
                const getMidTopOrBot = (rowIdx) => rowIdx < visuals.BREADBOARD_MID_ROWS / 2.0 ? "b" : "t";
                const getBarTopOrBot = (colIdx) => colIdx < POWER_COLS / 2.0 ? "b" : "t";
                const getMidGroupName = (rowIdx, colIdx) => {
                    let botOrTop = getMidTopOrBot(rowIdx);
                    let colNm = getColumnName(colIdx);
                    return `${botOrTop}${colNm}`;
                };
                const getBarRowName = (rowIdx) => rowIdx === 0 ? "-" : "+";
                const getBarGroupName = (rowIdx, colIdx) => {
                    let botOrTop = getBarTopOrBot(colIdx);
                    let rowName = getBarRowName(rowIdx);
                    return `${rowName}${botOrTop}`;
                };
                //mid grid
                let midGridRes = mkGrid({
                    xOffset: MID_GRID_X,
                    yOffset: MID_GRID_Y,
                    rowCount: visuals.BREADBOARD_MID_ROWS,
                    colCount: visuals.BREADBOARD_MID_COLS,
                    pinDist: PIN_DIST,
                    mkPin: mkBBPin,
                    mkHoverPin: mkBBHoverPin,
                    getRowName: getRowName,
                    getColName: getColumnName,
                    getGroupName: getMidGroupName,
                    rowIdxsWithGap: MID_ROW_GAPS,
                });
                let midGridG = midGridRes.g;
                this.allPins = this.allPins.concat(midGridRes.allPins);
                //bot bar
                let botBarGridRes = mkGrid({
                    xOffset: BAR_BOT_GRID_X,
                    yOffset: BAR_BOT_GRID_Y,
                    rowCount: BAR_ROWS,
                    colCount: BAR_COLS,
                    pinDist: PIN_DIST,
                    mkPin: mkBBPin,
                    mkHoverPin: mkBBHoverPin,
                    getRowName: getBarRowName,
                    getColName: getColumnName,
                    getGroupName: getBarGroupName,
                    colIdxsWithGap: BAR_COL_GAPS,
                });
                let botBarGridG = botBarGridRes.g;
                this.allPins = this.allPins.concat(botBarGridRes.allPins);
                //top bar
                let topBarGridRes = mkGrid({
                    xOffset: BAR_TOP_GRID_X,
                    yOffset: BAR_TOP_GRID_Y,
                    rowCount: BAR_ROWS,
                    colCount: BAR_COLS,
                    colStartIdx: BAR_COLS,
                    pinDist: PIN_DIST,
                    mkPin: mkBBPin,
                    mkHoverPin: mkBBHoverPin,
                    getRowName: getBarRowName,
                    getColName: getColumnName,
                    getGroupName: getBarGroupName,
                    colIdxsWithGap: BAR_COL_GAPS.map(g => g + BAR_COLS),
                });
                let topBarGridG = topBarGridRes.g;
                this.allPins = this.allPins.concat(topBarGridRes.allPins);
                //tooltip
                this.allPins.forEach(pin => {
                    let { el, row, col, hoverEl } = pin;
                    let title = `(${row},${col})`;
                    pxsim.svg.hydrate(el, { title: title });
                    pxsim.svg.hydrate(hoverEl, { title: title });
                });
                //catalog pins
                this.allPins.forEach(pin => {
                    let colToPin = this.rowColToPin[pin.row];
                    if (!colToPin)
                        colToPin = this.rowColToPin[pin.row] = {};
                    colToPin[pin.col] = pin;
                });
                //-----labels
                const mkBBLabelAtPin = (row, col, xOffset, yOffset, txt, group) => {
                    let size = PIN_LBL_SIZE;
                    let rotation = LBL_ROTATION;
                    let loc = this.getCoord({ type: "breadboard", row: row, col: col });
                    let [cx, cy] = loc;
                    let t = mkBBLabel(cx + xOffset, cy + yOffset, size, rotation, txt, group);
                    return t;
                };
                //columns
                for (let colIdx = 0; colIdx < visuals.BREADBOARD_MID_COLS; colIdx++) {
                    let colNm = getColumnName(colIdx);
                    //top
                    let rowTIdx = 0;
                    let rowTNm = getRowName(rowTIdx);
                    let groupT = getMidGroupName(rowTIdx, colIdx);
                    let lblT = mkBBLabelAtPin(rowTNm, colNm, 0, -PIN_DIST, colNm, groupT);
                    this.allLabels.push(lblT);
                    //bottom
                    let rowBIdx = visuals.BREADBOARD_MID_ROWS - 1;
                    let rowBNm = getRowName(rowBIdx);
                    let groupB = getMidGroupName(rowBIdx, colIdx);
                    let lblB = mkBBLabelAtPin(rowBNm, colNm, 0, +PIN_DIST, colNm, groupB);
                    this.allLabels.push(lblB);
                }
                //rows
                for (let rowIdx = 0; rowIdx < visuals.BREADBOARD_MID_ROWS; rowIdx++) {
                    let rowNm = getRowName(rowIdx);
                    //top
                    let colTIdx = 0;
                    let colTNm = getColumnName(colTIdx);
                    let lblT = mkBBLabelAtPin(rowNm, colTNm, -PIN_DIST, 0, rowNm);
                    this.allLabels.push(lblT);
                    //top
                    let colBIdx = visuals.BREADBOARD_MID_COLS - 1;
                    let colBNm = getColumnName(colBIdx);
                    let lblB = mkBBLabelAtPin(rowNm, colBNm, +PIN_DIST, 0, rowNm);
                    this.allLabels.push(lblB);
                }
                //+- labels
                let botPowerLabels = [
                    //BL
                    mkBBLabel(0 + POWER_LBL_OFFSET + MINUS_LBL_EXTRA_OFFSET, BAR_HEIGHT + MID_HEIGHT + POWER_LBL_OFFSET, MINUS_LBL_SIZE, LBL_ROTATION, `-`, getBarGroupName(0, 0), [`sim-bb-blue`]),
                    mkBBLabel(0 + POWER_LBL_OFFSET, BAR_HEIGHT + MID_HEIGHT + BAR_HEIGHT - POWER_LBL_OFFSET, PLUS_LBL_SIZE, LBL_ROTATION, `+`, getBarGroupName(1, 0), [`sim-bb-red`]),
                    //BR
                    mkBBLabel(WIDTH - POWER_LBL_OFFSET + MINUS_LBL_EXTRA_OFFSET, BAR_HEIGHT + MID_HEIGHT + POWER_LBL_OFFSET, MINUS_LBL_SIZE, LBL_ROTATION, `-`, getBarGroupName(0, BAR_COLS - 1), [`sim-bb-blue`]),
                    mkBBLabel(WIDTH - POWER_LBL_OFFSET, BAR_HEIGHT + MID_HEIGHT + BAR_HEIGHT - POWER_LBL_OFFSET, PLUS_LBL_SIZE, LBL_ROTATION, `+`, getBarGroupName(1, BAR_COLS - 1), [`sim-bb-red`]),
                ];
                this.allLabels = this.allLabels.concat(botPowerLabels);
                let topPowerLabels = [
                    //TL
                    mkBBLabel(0 + POWER_LBL_OFFSET + MINUS_LBL_EXTRA_OFFSET, 0 + POWER_LBL_OFFSET, MINUS_LBL_SIZE, LBL_ROTATION, `-`, getBarGroupName(0, BAR_COLS), [`sim-bb-blue`]),
                    mkBBLabel(0 + POWER_LBL_OFFSET, BAR_HEIGHT - POWER_LBL_OFFSET, PLUS_LBL_SIZE, LBL_ROTATION, `+`, getBarGroupName(1, BAR_COLS), [`sim-bb-red`]),
                    //TR
                    mkBBLabel(WIDTH - POWER_LBL_OFFSET + MINUS_LBL_EXTRA_OFFSET, 0 + POWER_LBL_OFFSET, MINUS_LBL_SIZE, LBL_ROTATION, `-`, getBarGroupName(0, POWER_COLS - 1), [`sim-bb-blue`]),
                    mkBBLabel(WIDTH - POWER_LBL_OFFSET, BAR_HEIGHT - POWER_LBL_OFFSET, PLUS_LBL_SIZE, LBL_ROTATION, `+`, getBarGroupName(1, POWER_COLS - 1), [`sim-bb-red`]),
                ];
                this.allLabels = this.allLabels.concat(topPowerLabels);
                //catalog lbls
                let lblNmToLbls = {};
                this.allLabels.forEach(lbl => {
                    let { el, txt } = lbl;
                    let lbls = lblNmToLbls[txt] = lblNmToLbls[txt] || [];
                    lbls.push(lbl);
                });
                const isPowerPin = (pin) => pin.row === "-" || pin.row === "+";
                this.allPins.forEach(pin => {
                    let { row, col, group } = pin;
                    let colToLbls = this.rowColToLbls[row] || (this.rowColToLbls[row] = {});
                    let lbls = colToLbls[col] || (colToLbls[col] = []);
                    if (isPowerPin(pin)) {
                        //power pins
                        let isBot = Number(col) <= BAR_COLS;
                        if (isBot)
                            botPowerLabels.filter(l => l.group == pin.group).forEach(l => lbls.push(l));
                        else
                            topPowerLabels.filter(l => l.group == pin.group).forEach(l => lbls.push(l));
                    }
                    else {
                        //mid pins
                        let rowLbls = lblNmToLbls[row];
                        rowLbls.forEach(l => lbls.push(l));
                        let colLbls = lblNmToLbls[col];
                        colLbls.forEach(l => lbls.push(l));
                    }
                });
                //-----blue & red lines
                const lnLen = BAR_GRID_WIDTH + PIN_DIST * 1.5;
                const lnThickness = PIN_DIST / 5.0;
                const lnYOff = PIN_DIST * 0.6;
                const lnXOff = (lnLen - BAR_GRID_WIDTH) / 2.0;
                const mkPowerLine = (x, y, group, cls) => {
                    let ln = pxsim.svg.elt("rect");
                    pxsim.svg.hydrate(ln, {
                        class: `sim-bb-bar ${cls}`,
                        x: x,
                        y: y - lnThickness / 2.0,
                        width: lnLen,
                        height: lnThickness
                    });
                    let bar = { el: ln, group: group };
                    return bar;
                };
                let barLines = [
                    //top
                    mkPowerLine(BAR_BOT_GRID_X - lnXOff, BAR_BOT_GRID_Y - lnYOff, getBarGroupName(0, POWER_COLS - 1), "sim-bb-blue"),
                    mkPowerLine(BAR_BOT_GRID_X - lnXOff, BAR_BOT_GRID_Y + PIN_DIST + lnYOff, getBarGroupName(1, POWER_COLS - 1), "sim-bb-red"),
                    //bot
                    mkPowerLine(BAR_TOP_GRID_X - lnXOff, BAR_TOP_GRID_Y - lnYOff, getBarGroupName(0, 0), "sim-bb-blue"),
                    mkPowerLine(BAR_TOP_GRID_X - lnXOff, BAR_TOP_GRID_Y + PIN_DIST + lnYOff, getBarGroupName(1, 0), "sim-bb-red"),
                ];
                this.allPowerBars = this.allPowerBars.concat(barLines);
                //attach power bars
                this.allPowerBars.forEach(b => this.bb.appendChild(b.el));
                //-----electrically connected groups
                //make groups
                let allGrpNms = this.allPins.map(p => p.group).filter((g, i, a) => a.indexOf(g) == i);
                let groups = allGrpNms.map(grpNm => {
                    let g = pxsim.svg.elt("g");
                    return g;
                });
                groups.forEach(g => pxsim.U.addClass(g, "sim-bb-pin-group"));
                groups.forEach((g, i) => pxsim.U.addClass(g, `group-${allGrpNms[i]}`));
                let grpNmToGroup = {};
                allGrpNms.forEach((g, i) => grpNmToGroup[g] = groups[i]);
                //group pins and add connecting wire
                let grpNmToPins = {};
                this.allPins.forEach((p, i) => {
                    let g = p.group;
                    let pins = grpNmToPins[g] || (grpNmToPins[g] = []);
                    pins.push(p);
                });
                //connecting wire
                allGrpNms.forEach(grpNm => {
                    let pins = grpNmToPins[grpNm];
                    let [xs, ys] = [pins.map(p => p.cx), pins.map(p => p.cy)];
                    let minFn = (arr) => arr.reduce((a, b) => a < b ? a : b);
                    let maxFn = (arr) => arr.reduce((a, b) => a > b ? a : b);
                    let [minX, maxX, minY, maxY] = [minFn(xs), maxFn(xs), minFn(ys), maxFn(ys)];
                    let wire = pxsim.svg.elt("rect");
                    let width = Math.max(maxX - minX, 0.0001 /*rects with no width aren't displayed*/);
                    let height = Math.max(maxY - minY, 0.0001);
                    pxsim.svg.hydrate(wire, { x: minX, y: minY, width: width, height: height });
                    pxsim.U.addClass(wire, "sim-bb-group-wire");
                    let g = grpNmToGroup[grpNm];
                    g.appendChild(wire);
                });
                //group pins
                this.allPins.forEach(p => {
                    let g = grpNmToGroup[p.group];
                    g.appendChild(p.el);
                    g.appendChild(p.hoverEl);
                });
                //group lbls
                let miscLblGroup = pxsim.svg.elt("g");
                pxsim.svg.hydrate(miscLblGroup, { class: "sim-bb-group-misc" });
                groups.push(miscLblGroup);
                this.allLabels.forEach(l => {
                    if (l.group) {
                        let g = grpNmToGroup[l.group];
                        g.appendChild(l.el);
                        g.appendChild(l.hoverEl);
                    }
                    else {
                        miscLblGroup.appendChild(l.el);
                        miscLblGroup.appendChild(l.hoverEl);
                    }
                });
                //attach to bb
                groups.forEach(g => this.bb.appendChild(g)); //attach to breadboard
            }
            getSVGAndSize() {
                return { el: this.bb, y: 0, x: 0, w: WIDTH, h: HEIGHT };
            }
            highlightLoc(rowCol) {
                let { row, col } = rowCol;
                let pin = this.rowColToPin[row][col];
                let { cx, cy } = pin;
                let lbls = this.rowColToLbls[row][col];
                const highlightLbl = (lbl) => {
                    pxsim.U.addClass(lbl.el, "highlight");
                    pxsim.U.addClass(lbl.hoverEl, "highlight");
                };
                lbls.forEach(highlightLbl);
            }
        }
        visuals.Breadboard = Breadboard;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        visuals.BOARD_SYTLE = `
        .noselect {
            -webkit-touch-callout: none; /* iOS Safari */
            -webkit-user-select: none;   /* Chrome/Safari/Opera */
            -khtml-user-select: none;    /* Konqueror */
            -moz-user-select: none;      /* Firefox */
            -ms-user-select: none;       /* Internet Explorer/Microsoft Edge */
            user-select: none;           /* Non-prefixed version, currently
                                            not supported by any browser */
        }

        .sim-board-pin {
            fill:#999;
            stroke:#000;
            stroke-width:${visuals.PIN_DIST / 3.0}px;
        }
        .sim-board-pin-lbl {
            fill: #333;
        }
        .gray-cover {
            fill:#FFF;
            opacity: 0.3;
            stroke-width:0;
            visibility: hidden;
        }
        .sim-board-pin-hover {
            visibility: hidden;
            pointer-events: all;
            stroke-width:${visuals.PIN_DIST / 6.0}px;
        }
        .sim-board-pin-hover:hover {
            visibility: visible;
        }
        .sim-board-pin-lbl {
            visibility: hidden;
        }
        .sim-board-outline .sim-board-pin-lbl {
            visibility: visible;
        }
        .sim-board-pin-lbl {
            fill: #555;
        }
        .sim-board-pin-lbl-hover {
            fill: red;
        }
        .sim-board-outline .sim-board-pin-lbl-hover {
            fill: black;
        }
        .sim-board-pin-lbl,
        .sim-board-pin-lbl-hover {
            font-family:"Lucida Console", Monaco, monospace;
            pointer-events: all;
            stroke-width: 0;
        }
        .sim-board-pin-lbl-hover {
            visibility: hidden;
        }
        .sim-board-outline .sim-board-pin-hover:hover + .sim-board-pin-lbl,
        .sim-board-pin-lbl.highlight {
            visibility: hidden;
        }
        .sim-board-outline .sim-board-pin-hover:hover + * + .sim-board-pin-lbl-hover,
        .sim-board-pin-lbl-hover.highlight {
            visibility: visible;
        }
        /* Graying out */
        .grayed .sim-board-pin-lbl:not(.highlight) {
            fill: #AAA;
        }
        .grayed .sim-board-pin:not(.highlight) {
            fill:#BBB;
            stroke:#777;
        }
        .grayed .gray-cover {
            visibility: inherit;
        }
        .grayed .sim-cmp:not(.notgrayed) {
            opacity: 0.3;
        }
        /* Highlighting */
        .sim-board-pin-lbl.highlight {
            fill: #000;
            font-weight: bold;
        }
        .sim-board-pin.highlight {
            fill:#999;
            stroke:#000;
        }
        `;
        const PIN_LBL_SIZE = visuals.PIN_DIST * 0.7;
        const PIN_LBL_HOVER_SIZE = PIN_LBL_SIZE * 1.5;
        const SQUARE_PIN_WIDTH = visuals.PIN_DIST * 0.66666;
        const SQUARE_PIN_HOVER_WIDTH = visuals.PIN_DIST * 0.66666 + visuals.PIN_DIST / 3.0;
        let nextBoardId = 0;
        class GenericBoardSvg {
            constructor(props) {
                this.props = props;
                // pins & labels
                //(truth)
                this.allPins = [];
                this.allLabels = [];
                //(cache)
                this.pinNmToLbl = {};
                this.pinNmToPin = {};
                //TODO: handle wireframe mode
                this.id = nextBoardId++;
                let visDef = props.visualDef;
                let imgHref = props.wireframe && visDef.outlineImage ? visDef.outlineImage : visDef.image;
                let boardImgAndSize = visuals.mkImageSVG({
                    image: imgHref,
                    width: visDef.width,
                    height: visDef.height,
                    imageUnitDist: visDef.pinDist,
                    targetUnitDist: visuals.PIN_DIST
                });
                let scaleFn = visuals.mkScaleFn(visDef.pinDist, visuals.PIN_DIST);
                this.width = boardImgAndSize.w;
                this.height = boardImgAndSize.h;
                let img = boardImgAndSize.el;
                this.element = pxsim.svg.elt("svg");
                pxsim.svg.hydrate(this.element, {
                    "version": "1.0",
                    "viewBox": `0 0 ${this.width} ${this.height}`,
                    "class": `sim sim-board-id-${this.id}`,
                    "x": "0px",
                    "y": "0px"
                });
                if (props.wireframe)
                    pxsim.U.addClass(this.element, "sim-board-outline");
                this.style = pxsim.svg.child(this.element, "style", {});
                this.style.textContent += visuals.BOARD_SYTLE;
                this.defs = pxsim.svg.child(this.element, "defs", {});
                this.g = pxsim.svg.elt("g");
                this.element.appendChild(this.g);
                // main board
                this.g.appendChild(img);
                this.background = img;
                pxsim.svg.hydrate(img, { class: "sim-board" });
                // does not look great
                //let backgroundCover = this.mkGrayCover(0, 0, this.width, this.height);
                //this.g.appendChild(backgroundCover);
                // ----- pins
                const mkRoundPin = () => {
                    let el = pxsim.svg.elt("circle");
                    let width = SQUARE_PIN_WIDTH;
                    pxsim.svg.hydrate(el, {
                        class: "sim-board-pin",
                        r: width / 2,
                    });
                    return { el: el, w: width, h: width, x: 0, y: 0 };
                };
                const mkRoundHoverPin = () => {
                    let el = pxsim.svg.elt("circle");
                    let width = SQUARE_PIN_HOVER_WIDTH;
                    pxsim.svg.hydrate(el, {
                        class: "sim-board-pin-hover",
                        r: width / 2
                    });
                    return { el: el, w: width, h: width, x: 0, y: 0 };
                };
                const mkSquarePin = () => {
                    let el = pxsim.svg.elt("rect");
                    let width = SQUARE_PIN_WIDTH;
                    pxsim.svg.hydrate(el, {
                        class: "sim-board-pin",
                        width: width,
                        height: width,
                    });
                    return { el: el, w: width, h: width, x: 0, y: 0 };
                };
                const mkSquareHoverPin = () => {
                    let el = pxsim.svg.elt("rect");
                    let width = SQUARE_PIN_HOVER_WIDTH;
                    pxsim.svg.hydrate(el, {
                        class: "sim-board-pin-hover",
                        width: width,
                        height: width
                    });
                    return { el: el, w: width, h: width, x: 0, y: 0 };
                };
                const mkPinBlockGrid = (pinBlock, blockIdx) => {
                    let xOffset = scaleFn(pinBlock.x) + visuals.PIN_DIST / 2.0;
                    let yOffset = scaleFn(pinBlock.y) + visuals.PIN_DIST / 2.0;
                    let rowCount = 1;
                    let colCount = pinBlock.labels.length;
                    let getColName = (colIdx) => pinBlock.labels[colIdx];
                    let getRowName = () => `${blockIdx + 1}`;
                    let getGroupName = () => pinBlock.labels.join(" ");
                    let gridRes = visuals.mkGrid({
                        xOffset: xOffset,
                        yOffset: yOffset,
                        rowCount: rowCount,
                        colCount: colCount,
                        pinDist: visuals.PIN_DIST,
                        mkPin: visDef.useCrocClips ? mkRoundPin : mkSquarePin,
                        mkHoverPin: visDef.useCrocClips ? mkRoundHoverPin : mkSquareHoverPin,
                        getRowName: getRowName,
                        getColName: getColName,
                        getGroupName: getGroupName,
                    });
                    let pins = gridRes.allPins;
                    let pinsG = gridRes.g;
                    pxsim.U.addClass(gridRes.g, "sim-board-pin-group");
                    return gridRes;
                };
                let pinBlocks = visDef.pinBlocks.map(mkPinBlockGrid);
                let pinToBlockDef = [];
                pinBlocks.forEach((blk, blkIdx) => blk.allPins.forEach((p, pIdx) => {
                    this.allPins.push(p);
                    pinToBlockDef.push(visDef.pinBlocks[blkIdx]);
                }));
                //tooltip
                this.allPins.forEach(p => {
                    let tooltip = p.col;
                    pxsim.svg.hydrate(p.el, { title: tooltip });
                    pxsim.svg.hydrate(p.hoverEl, { title: tooltip });
                });
                //catalog pins
                this.allPins.forEach(p => {
                    this.pinNmToPin[p.col] = p;
                });
                // ----- labels
                const mkLabelTxtEl = (pinX, pinY, size, txt, pos) => {
                    //TODO: extract constants
                    let lblY;
                    let lblX;
                    if (pos === "below") {
                        let lblLen = size * 0.25 * txt.length;
                        lblX = pinX;
                        lblY = pinY + 12 + lblLen;
                    }
                    else {
                        let lblLen = size * 0.32 * txt.length;
                        lblX = pinX;
                        lblY = pinY - 11 - lblLen;
                    }
                    let el = visuals.mkTxt(lblX, lblY, size, -90, txt);
                    return el;
                };
                const mkLabel = (pinX, pinY, txt, pos) => {
                    let el = mkLabelTxtEl(pinX, pinY, PIN_LBL_SIZE, txt, pos);
                    pxsim.U.addClass(el, "sim-board-pin-lbl");
                    let hoverEl = mkLabelTxtEl(pinX, pinY, PIN_LBL_HOVER_SIZE, txt, pos);
                    pxsim.U.addClass(hoverEl, "sim-board-pin-lbl-hover");
                    let label = { el: el, hoverEl: hoverEl, txt: txt };
                    return label;
                };
                this.allLabels = this.allPins.map((p, pIdx) => {
                    let blk = pinToBlockDef[pIdx];
                    return mkLabel(p.cx, p.cy, p.col, blk.labelPosition || "above");
                });
                //catalog labels
                this.allPins.forEach((pin, pinIdx) => {
                    let lbl = this.allLabels[pinIdx];
                    this.pinNmToLbl[pin.col] = lbl;
                });
                //attach pins & labels
                this.allPins.forEach((p, idx) => {
                    let lbl = this.allLabels[idx];
                    //pins and labels must be adjacent for hover CSS
                    this.g.appendChild(p.el);
                    this.g.appendChild(p.hoverEl);
                    this.g.appendChild(lbl.el);
                    this.g.appendChild(lbl.hoverEl);
                });
            }
            findPin(pinNm) {
                let pin = this.pinNmToPin[pinNm];
                if (!pin && this.props.boardDef.gpioPinMap) {
                    pinNm = this.props.boardDef.gpioPinMap[pinNm];
                    if (pinNm)
                        pin = this.pinNmToPin[pinNm];
                }
                return pin;
            }
            findPinLabel(pinNm) {
                let pin = this.pinNmToLbl[pinNm];
                if (!pin && this.props.boardDef.gpioPinMap) {
                    pinNm = this.props.boardDef.gpioPinMap[pinNm];
                    if (pinNm)
                        pin = this.pinNmToLbl[pinNm];
                }
                return pin;
            }
            getCoord(pinNm) {
                let pin = this.findPin(pinNm);
                if (!pin)
                    return null;
                return [pin.cx, pin.cy];
            }
            mkGrayCover(x, y, w, h) {
                let rect = pxsim.svg.elt("rect");
                pxsim.svg.hydrate(rect, { x: x, y: y, width: w, height: h, class: "gray-cover" });
                return rect;
            }
            getView() {
                return { el: this.element, w: this.width, h: this.height, x: 0, y: 0 };
            }
            getPinDist() {
                return visuals.PIN_DIST;
            }
            highlightPin(pinNm) {
                let lbl = this.findPinLabel(pinNm);
                let pin = this.findPin(pinNm);
                if (lbl && pin) {
                    pxsim.U.addClass(lbl.el, "highlight");
                    pxsim.U.addClass(lbl.hoverEl, "highlight");
                    pxsim.U.addClass(pin.el, "highlight");
                    pxsim.U.addClass(pin.hoverEl, "highlight");
                }
            }
        }
        visuals.GenericBoardSvg = GenericBoardSvg;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        function mkGenericPartSVG(partVisual) {
            let imgAndSize = visuals.mkImageSVG({
                image: partVisual.image,
                width: partVisual.width,
                height: partVisual.height,
                imageUnitDist: partVisual.pinDistance,
                targetUnitDist: visuals.PIN_DIST
            });
            return imgAndSize;
        }
        visuals.mkGenericPartSVG = mkGenericPartSVG;
        class GenericPart {
            constructor(partVisual) {
                this.style = "";
                this.defs = [];
                let imgAndSize = mkGenericPartSVG(partVisual);
                let img = imgAndSize.el;
                this.element = pxsim.svg.elt("g");
                this.element.appendChild(img);
            }
            moveToCoord(xy) {
                visuals.translateEl(this.element, xy);
            }
            //unused
            init(bus, state, svgEl) { }
            updateState() { }
            updateTheme() { }
        }
        visuals.GenericPart = GenericPart;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        const WIRE_WIDTH = visuals.PIN_DIST / 2.5;
        const BB_WIRE_SMOOTH = 0.7;
        const INSTR_WIRE_SMOOTH = 0.8;
        const WIRE_PART_CURVE_OFF = 15;
        const WIRE_PART_LENGTH = 100;
        visuals.WIRES_CSS = `
        .sim-bb-wire {
            fill:none;
            stroke-linecap: round;
            stroke-width:${WIRE_WIDTH}px;
            pointer-events: none;
        }
        .sim-bb-wire-end {
            stroke:#333;
            fill:#333;
        }
        .sim-bb-wire-bare-end {
            fill: #ccc;
        }
        .sim-bb-wire-hover {
            stroke-width: ${WIRE_WIDTH}px;
            visibility: hidden;
            stroke-dasharray: ${visuals.PIN_DIST / 10.0},${visuals.PIN_DIST / 1.5};
            /*stroke-opacity: 0.4;*/
        }
        .grayed .sim-bb-wire-ends-g:not(.highlight) .sim-bb-wire-end {
            stroke: #777;
            fill: #777;
        }
        .grayed .sim-bb-wire:not(.highlight) {
            stroke: #CCC;
        }
        .sim-bb-wire-ends-g:hover .sim-bb-wire-end {
            stroke: red;
            fill: red;
        }
        .sim-bb-wire-ends-g:hover .sim-bb-wire-bare-end {
            stroke: #FFF;
            fill: #FFF;
        }
        `;
        function cssEncodeColor(color) {
            //HACK/TODO: do real CSS encoding.
            return color
                .replace(/\#/g, "-")
                .replace(/\(/g, "-")
                .replace(/\)/g, "-")
                .replace(/\,/g, "-")
                .replace(/\./g, "-")
                .replace(/\s/g, "");
        }
        let WireEndStyle;
        (function (WireEndStyle) {
            WireEndStyle[WireEndStyle["BBJumper"] = 0] = "BBJumper";
            WireEndStyle[WireEndStyle["OpenJumper"] = 1] = "OpenJumper";
            WireEndStyle[WireEndStyle["Croc"] = 2] = "Croc";
        })(WireEndStyle = visuals.WireEndStyle || (visuals.WireEndStyle = {}));
        function mkWirePart(cp, clr, croc = false) {
            let g = pxsim.svg.elt("g");
            let [cx, cy] = cp;
            let offset = WIRE_PART_CURVE_OFF;
            let p1 = [cx - offset, cy - WIRE_PART_LENGTH / 2];
            let p2 = [cx + offset, cy + WIRE_PART_LENGTH / 2];
            clr = visuals.mapWireColor(clr);
            let e1;
            if (croc)
                e1 = mkCrocEnd(p1, true, clr);
            else
                e1 = mkOpenJumperEnd(p1, true, clr);
            let s = mkWirePartSeg(p1, p2, clr);
            let e2 = mkOpenJumperEnd(p2, false, clr);
            g.appendChild(s.el);
            g.appendChild(e1.el);
            g.appendChild(e2.el);
            let l = Math.min(e1.x, e2.x);
            let r = Math.max(e1.x + e1.w, e2.x + e2.w);
            let t = Math.min(e1.y, e2.y);
            let b = Math.max(e1.y + e1.h, e2.y + e2.h);
            return { el: g, x: l, y: t, w: r - l, h: b - t };
        }
        visuals.mkWirePart = mkWirePart;
        function mkCurvedWireSeg(p1, p2, smooth, clrClass) {
            const coordStr = (xy) => { return `${xy[0]}, ${xy[1]}`; };
            let [x1, y1] = p1;
            let [x2, y2] = p2;
            let yLen = (y2 - y1);
            let c1 = [x1, y1 + yLen * smooth];
            let c2 = [x2, y2 - yLen * smooth];
            let w = pxsim.svg.mkPath("sim-bb-wire", `M${coordStr(p1)} C${coordStr(c1)} ${coordStr(c2)} ${coordStr(p2)}`);
            pxsim.U.addClass(w, `wire-stroke-${clrClass}`);
            return w;
        }
        function mkWirePartSeg(p1, p2, clr) {
            //TODO: merge with mkCurvedWireSeg
            const coordStr = (xy) => { return `${xy[0]}, ${xy[1]}`; };
            let [x1, y1] = p1;
            let [x2, y2] = p2;
            let yLen = (y2 - y1);
            let c1 = [x1, y1 + yLen * .8];
            let c2 = [x2, y2 - yLen * .8];
            let e = pxsim.svg.mkPath("sim-bb-wire", `M${coordStr(p1)} C${coordStr(c1)} ${coordStr(c2)} ${coordStr(p2)}`);
            e.style["stroke"] = clr;
            return { el: e, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x1 - x2), h: Math.abs(y1 - y2) };
        }
        function mkWireSeg(p1, p2, clrClass) {
            const coordStr = (xy) => { return `${xy[0]}, ${xy[1]}`; };
            let w = pxsim.svg.mkPath("sim-bb-wire", `M${coordStr(p1)} L${coordStr(p2)}`);
            pxsim.U.addClass(w, `wire-stroke-${clrClass}`);
            return w;
        }
        function mkBBJumperEnd(p, clrClass) {
            const endW = visuals.PIN_DIST / 4;
            let w = pxsim.svg.elt("circle");
            let x = p[0];
            let y = p[1];
            let r = WIRE_WIDTH / 2 + endW / 2;
            pxsim.svg.hydrate(w, { cx: x, cy: y, r: r, class: "sim-bb-wire-end" });
            pxsim.U.addClass(w, `wire-fill-${clrClass}`);
            w.style["stroke-width"] = `${endW}px`;
            return w;
        }
        function mkOpenJumperEnd(p, top, clr) {
            let k = visuals.PIN_DIST * 0.24;
            let plasticLength = k * 10;
            let plasticWidth = k * 2;
            let metalLength = k * 6;
            let metalWidth = k;
            const strokeWidth = visuals.PIN_DIST / 4.0;
            let [cx, cy] = p;
            let o = top ? -1 : 1;
            let g = pxsim.svg.elt("g");
            let el = pxsim.svg.elt("rect");
            let h1 = plasticLength;
            let w1 = plasticWidth;
            let x1 = cx - w1 / 2;
            let y1 = cy - (h1 / 2);
            pxsim.svg.hydrate(el, { x: x1, y: y1, width: w1, height: h1, rx: 0.5, ry: 0.5, class: "sim-bb-wire-end" });
            el.style["stroke-width"] = `${strokeWidth}px`;
            let el2 = pxsim.svg.elt("rect");
            let h2 = metalLength;
            let w2 = metalWidth;
            let cy2 = cy + o * (h1 / 2 + h2 / 2);
            let x2 = cx - w2 / 2;
            let y2 = cy2 - (h2 / 2);
            pxsim.svg.hydrate(el2, { x: x2, y: y2, width: w2, height: h2, class: "sim-bb-wire-bare-end" });
            el2.style["fill"] = `#bbb`;
            g.appendChild(el2);
            g.appendChild(el);
            return { el: g, x: x1 - strokeWidth, y: Math.min(y1, y2), w: w1 + strokeWidth * 2, h: h1 + h2 };
        }
        function mkSmallMBPinEnd(p, top, clr) {
            //HACK
            //TODO: merge with mkOpenJumperEnd()
            let k = visuals.PIN_DIST * 0.24;
            let plasticLength = k * 4;
            let plasticWidth = k * 1.2;
            let metalLength = k * 10;
            let metalWidth = k;
            const strokeWidth = visuals.PIN_DIST / 4.0;
            let [cx, cy] = p;
            let yOffset = 10;
            let o = top ? -1 : 1;
            let g = pxsim.svg.elt("g");
            let el = pxsim.svg.elt("rect");
            let h1 = plasticLength;
            let w1 = plasticWidth;
            let x1 = cx - w1 / 2;
            let y1 = cy + yOffset - (h1 / 2);
            pxsim.svg.hydrate(el, { x: x1, y: y1, width: w1, height: h1, rx: 0.5, ry: 0.5, class: "sim-bb-wire-end" });
            el.style["stroke-width"] = `${strokeWidth}px`;
            let el2 = pxsim.svg.elt("rect");
            let h2 = metalLength;
            let w2 = metalWidth;
            let cy2 = cy + yOffset + o * (h1 / 2 + h2 / 2);
            let x2 = cx - w2 / 2;
            let y2 = cy2 - (h2 / 2);
            pxsim.svg.hydrate(el2, { x: x2, y: y2, width: w2, height: h2, class: "sim-bb-wire-bare-end" });
            el2.style["fill"] = `#bbb`;
            g.appendChild(el2);
            g.appendChild(el);
            return { el: g, x: x1 - strokeWidth, y: Math.min(y1, y2), w: w1 + strokeWidth * 2, h: h1 + h2 };
        }
        function mkCrocEnd(p, top, clr) {
            //TODO: merge with mkOpenJumperEnd()
            let k = visuals.PIN_DIST * 0.24;
            const plasticWidth = k * 4;
            const plasticLength = k * 10.0;
            const metalWidth = k * 3.5;
            const metalHeight = k * 3.5;
            const pointScalar = .15;
            const baseScalar = .3;
            const taperScalar = .7;
            const strokeWidth = visuals.PIN_DIST / 4.0;
            let [cx, cy] = p;
            let o = top ? -1 : 1;
            let g = pxsim.svg.elt("g");
            let el = pxsim.svg.elt("polygon");
            let h1 = plasticLength;
            let w1 = plasticWidth;
            let x1 = cx - w1 / 2;
            let y1 = cy - (h1 / 2);
            let mkPnt = (xy) => `${xy[0]},${xy[1]}`;
            let mkPnts = (...xys) => xys.map(xy => mkPnt(xy)).join(" ");
            const topScalar = top ? pointScalar : baseScalar;
            const midScalar = top ? taperScalar : (1 - taperScalar);
            const botScalar = top ? baseScalar : pointScalar;
            pxsim.svg.hydrate(el, {
                points: mkPnts([x1 + w1 * topScalar, y1], //TL
                [x1 + w1 * (1 - topScalar), y1], //TR
                [x1 + w1, y1 + h1 * midScalar], //MR
                [x1 + w1 * (1 - botScalar), y1 + h1], //BR
                [x1 + w1 * botScalar, y1 + h1], //BL
                [x1, y1 + h1 * midScalar]) //ML
            });
            pxsim.svg.hydrate(el, { rx: 0.5, ry: 0.5, class: "sim-bb-wire-end" });
            el.style["stroke-width"] = `${strokeWidth}px`;
            let el2 = pxsim.svg.elt("rect");
            let h2 = metalWidth;
            let w2 = metalHeight;
            let cy2 = cy + o * (h1 / 2 + h2 / 2);
            let x2 = cx - w2 / 2;
            let y2 = cy2 - (h2 / 2);
            pxsim.svg.hydrate(el2, { x: x2, y: y2, width: w2, height: h2, class: "sim-bb-wire-bare-end" });
            g.appendChild(el2);
            g.appendChild(el);
            return { el: g, x: x1 - strokeWidth, y: Math.min(y1, y2), w: w1 + strokeWidth * 2, h: h1 + h2 };
        }
        //TODO: make this stupid class obsolete
        class WireFactory {
            constructor(underboard, overboard, boardEdges, styleEl, getLocCoord, getPinStyle) {
                this.nextWireId = 0;
                this.styleEl = styleEl;
                this.styleEl.textContent += visuals.WIRES_CSS;
                this.underboard = underboard;
                this.overboard = overboard;
                this.boardEdges = boardEdges;
                this.getLocCoord = getLocCoord;
                this.getPinStyle = getPinStyle;
            }
            indexOfMin(vs) {
                let minIdx = 0;
                let min = vs[0];
                for (let i = 1; i < vs.length; i++) {
                    if (vs[i] < min) {
                        min = vs[i];
                        minIdx = i;
                    }
                }
                return minIdx;
            }
            closestEdgeIdx(p) {
                let dists = this.boardEdges.map(e => Math.abs(p[1] - e));
                let edgeIdx = this.indexOfMin(dists);
                return edgeIdx;
            }
            closestEdge(p) {
                return this.boardEdges[this.closestEdgeIdx(p)];
            }
            drawWire(pin1, pin2, color) {
                let wires = [];
                let g = pxsim.svg.child(this.overboard, "g", { class: "sim-bb-wire-group" });
                const closestPointOffBoard = (p) => {
                    const offset = visuals.PIN_DIST / 2;
                    let e = this.closestEdge(p);
                    let y;
                    if (e - p[1] < 0)
                        y = e - offset;
                    else
                        y = e + offset;
                    return [p[0], y];
                };
                let wireId = this.nextWireId++;
                let clrClass = cssEncodeColor(color);
                let end1 = mkBBJumperEnd(pin1, clrClass);
                let end2 = mkBBJumperEnd(pin2, clrClass);
                let endG = pxsim.svg.child(g, "g", { class: "sim-bb-wire-ends-g" });
                endG.appendChild(end1);
                endG.appendChild(end2);
                let edgeIdx1 = this.closestEdgeIdx(pin1);
                let edgeIdx2 = this.closestEdgeIdx(pin2);
                if (edgeIdx1 == edgeIdx2) {
                    let seg = mkWireSeg(pin1, pin2, clrClass);
                    g.appendChild(seg);
                    wires.push(seg);
                }
                else {
                    let offP1 = closestPointOffBoard(pin1);
                    let offP2 = closestPointOffBoard(pin2);
                    let offSeg1 = mkWireSeg(pin1, offP1, clrClass);
                    let offSeg2 = mkWireSeg(pin2, offP2, clrClass);
                    let midSeg;
                    let midSegHover;
                    let isBetweenMiddleTwoEdges = (edgeIdx1 == 1 || edgeIdx1 == 2) && (edgeIdx2 == 1 || edgeIdx2 == 2);
                    if (isBetweenMiddleTwoEdges) {
                        midSeg = mkCurvedWireSeg(offP1, offP2, BB_WIRE_SMOOTH, clrClass);
                        midSegHover = mkCurvedWireSeg(offP1, offP2, BB_WIRE_SMOOTH, clrClass);
                    }
                    else {
                        midSeg = mkWireSeg(offP1, offP2, clrClass);
                        midSegHover = mkWireSeg(offP1, offP2, clrClass);
                    }
                    pxsim.U.addClass(midSegHover, "sim-bb-wire-hover");
                    g.appendChild(offSeg1);
                    wires.push(offSeg1);
                    g.appendChild(offSeg2);
                    wires.push(offSeg2);
                    this.underboard.appendChild(midSeg);
                    wires.push(midSeg);
                    g.appendChild(midSegHover);
                    wires.push(midSegHover);
                    //set hover mechanism
                    let wireIdClass = `sim-bb-wire-id-${wireId}`;
                    const setId = (e) => pxsim.U.addClass(e, wireIdClass);
                    setId(endG);
                    setId(midSegHover);
                    this.styleEl.textContent += `
                    .${wireIdClass}:hover ~ .${wireIdClass}.sim-bb-wire-hover {
                        visibility: visible;
                    }`;
                }
                // wire colors
                let colorCSS = `
                .wire-stroke-${clrClass} {
                    stroke: ${visuals.mapWireColor(color)};
                }
                .wire-fill-${clrClass} {
                    fill: ${visuals.mapWireColor(color)};
                }
                `;
                this.styleEl.textContent += colorCSS;
                return { endG: endG, end1: end1, end2: end2, wires: wires };
            }
            drawWireWithCrocs(pin1, pin2, color, smallPin = false) {
                //TODO: merge with drawWire()
                const PIN_Y_OFF = 40;
                const CROC_Y_OFF = -17;
                let wires = [];
                let g = pxsim.svg.child(this.overboard, "g", { class: "sim-bb-wire-group" });
                const closestPointOffBoard = (p) => {
                    const offset = visuals.PIN_DIST / 2;
                    let e = this.closestEdge(p);
                    let y;
                    if (e - p[1] < 0)
                        y = e - offset;
                    else
                        y = e + offset;
                    return [p[0], y];
                };
                let wireId = this.nextWireId++;
                let clrClass = cssEncodeColor(color);
                let end1 = mkBBJumperEnd(pin1, clrClass);
                let pin2orig = pin2;
                let [x2, y2] = pin2;
                pin2 = [x2, y2 + PIN_Y_OFF]; //HACK
                [x2, y2] = pin2;
                let endCoord2 = [x2, y2 + CROC_Y_OFF];
                let end2AndSize;
                if (smallPin)
                    end2AndSize = mkSmallMBPinEnd(endCoord2, true, color);
                else
                    end2AndSize = mkCrocEnd(endCoord2, true, color);
                let end2 = end2AndSize.el;
                let endG = pxsim.svg.child(g, "g", { class: "sim-bb-wire-ends-g" });
                endG.appendChild(end1);
                //endG.appendChild(end2);
                let edgeIdx1 = this.closestEdgeIdx(pin1);
                let edgeIdx2 = this.closestEdgeIdx(pin2orig);
                if (edgeIdx1 == edgeIdx2) {
                    let seg = mkWireSeg(pin1, pin2, clrClass);
                    g.appendChild(seg);
                    wires.push(seg);
                }
                else {
                    let offP1 = closestPointOffBoard(pin1);
                    //let offP2 = closestPointOffBoard(pin2orig);
                    let offSeg1 = mkWireSeg(pin1, offP1, clrClass);
                    //let offSeg2 = mkWireSeg(pin2, offP2, clrClass);
                    let midSeg;
                    let midSegHover;
                    let isBetweenMiddleTwoEdges = (edgeIdx1 == 1 || edgeIdx1 == 2) && (edgeIdx2 == 1 || edgeIdx2 == 2);
                    if (isBetweenMiddleTwoEdges) {
                        midSeg = mkCurvedWireSeg(offP1, pin2, BB_WIRE_SMOOTH, clrClass);
                        midSegHover = mkCurvedWireSeg(offP1, pin2, BB_WIRE_SMOOTH, clrClass);
                    }
                    else {
                        midSeg = mkWireSeg(offP1, pin2, clrClass);
                        midSegHover = mkWireSeg(offP1, pin2, clrClass);
                    }
                    pxsim.U.addClass(midSegHover, "sim-bb-wire-hover");
                    g.appendChild(offSeg1);
                    wires.push(offSeg1);
                    // g.appendChild(offSeg2);
                    // wires.push(offSeg2);
                    this.underboard.appendChild(midSeg);
                    wires.push(midSeg);
                    //g.appendChild(midSegHover);
                    //wires.push(midSegHover);
                    //set hover mechanism
                    let wireIdClass = `sim-bb-wire-id-${wireId}`;
                    const setId = (e) => pxsim.U.addClass(e, wireIdClass);
                    setId(endG);
                    setId(midSegHover);
                    this.styleEl.textContent += `
                    .${wireIdClass}:hover ~ .${wireIdClass}.sim-bb-wire-hover {
                        visibility: visible;
                    }`;
                }
                endG.appendChild(end2); //HACK
                // wire colors
                let colorCSS = `
                .wire-stroke-${clrClass} {
                    stroke: ${visuals.mapWireColor(color)};
                }
                .wire-fill-${clrClass} {
                    fill: ${visuals.mapWireColor(color)};
                }
                `;
                this.styleEl.textContent += colorCSS;
                return { endG: endG, end1: end1, end2: end2, wires: wires };
            }
            checkWire(start, end) {
                let startLoc = this.getLocCoord(start);
                let endLoc = this.getLocCoord(end);
                return !!startLoc && !!endLoc;
            }
            addWire(start, end, color) {
                let startLoc = this.getLocCoord(start);
                let endLoc = this.getLocCoord(end);
                if (!startLoc || !endLoc) {
                    pxsim.debug(`unable to allocate wire for ${start} or ${end}`);
                    return undefined;
                }
                //let startStyle = this.getPinStyle(start);
                let endStyle = this.getPinStyle(end);
                let wireEls;
                if (end.type == "dalboard" && endStyle == "croc") {
                    wireEls = this.drawWireWithCrocs(startLoc, endLoc, color);
                }
                else {
                    wireEls = this.drawWire(startLoc, endLoc, color);
                }
                return wireEls;
            }
        }
        visuals.WireFactory = WireFactory;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
