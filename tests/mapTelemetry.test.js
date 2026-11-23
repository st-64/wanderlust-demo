const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const securityHeaders = require("../utils/securityHeaders.js");
const config = require("../config.js");

test("map setup disables Mapbox telemetry before construction and keeps map features", () => {
    const mapElement = {
        dataset: {
            token: "pk.test-token",
            geometry: JSON.stringify({
                type: "Point",
                coordinates: [-73.9857, 40.7484],
            }),
            title: "Test listing",
        },
    };
    const calls = {
        controls: [],
        elements: [],
        sources: [],
        layers: [],
        marker: null,
        popup: null,
    };
    const mapboxConfig = {};
    Object.defineProperty(mapboxConfig, "EVENTS_URL", {
        configurable: true,
        get: () => "https://events.mapbox.com/events/v2",
    });

    class MockMap {
        constructor(options) {
            calls.mapOptions = options;
            calls.telemetryUrlAtConstruction = mapboxConfig.EVENTS_URL;
        }

        addControl(control) {
            calls.controls.push(control);
        }

        on(eventName, callback) {
            if (eventName === "load") callback();
        }

        addSource(id, source) {
            calls.sources.push({ id, source });
        }

        addLayer(layer) {
            calls.layers.push(layer);
        }
    }

    class MockPopup {
        constructor(options) {
            calls.popup = this;
            this.options = options;
        }

        setDOMContent(content) {
            calls.popup.content = content;
            return this;
        }
    }

    class MockMarker {
        constructor(element) {
            calls.marker = { element };
        }

        setLngLat(coordinates) {
            calls.marker.coordinates = coordinates;
            return this;
        }

        setPopup(popup) {
            calls.marker.popup = popup;
            return this;
        }

        addTo(map) {
            calls.marker.map = map;
            return this;
        }
    }

    const mapboxgl = {
        config: mapboxConfig,
        Map: MockMap,
        NavigationControl: class {},
        Popup: MockPopup,
        Marker: MockMarker,
    };
    const document = {
        getElementById: (id) => id === "map" ? mapElement : null,
        createElement(tagName) {
            const element = {
                tagName,
                attributes: {},
                children: [],
                listeners: {},
                setAttribute(name, value) {
                    this.attributes[name] = value;
                },
                append(...children) {
                    this.children.push(...children);
                },
                addEventListener(name, callback) {
                    this.listeners[name] = callback;
                },
            };
            calls.elements.push(element);
            return element;
        },
    };
    const mapScript = fs.readFileSync(
        path.join(__dirname, "..", "public", "js", "map.js"),
        "utf8"
    );

    vm.runInNewContext(mapScript, { document, window: { mapboxgl }, mapboxgl });

    assert.equal(calls.telemetryUrlAtConstruction, null);
    assert.equal(mapboxgl.accessToken, "pk.test-token");
    assert.equal(calls.mapOptions.style, "mapbox://styles/mapbox/streets-v12");
    assert.equal(calls.mapOptions.center[0], -73.9857);
    assert.equal(calls.mapOptions.center[1], 40.7484);
    assert.equal(calls.controls.length, 1);
    assert.equal(calls.sources[0].id, "approximate-listing-location");
    assert.equal(calls.layers[0].id, "approximate-listing-location-circle");
    assert.equal(calls.marker.coordinates[0], -73.9857);
    assert.equal(calls.marker.coordinates[1], 40.7484);
    assert.equal(calls.marker.popup, calls.popup);
    assert.equal(calls.marker.map instanceof MockMap, true);
    assert.equal(calls.popup.content.children[0].textContent, "Test listing");
});

test("Mapbox assets and style requests remain allowed by the strict CSP", () => {
    const originalMode = config.cspMode;
    const headers = {};
    config.cspMode = "enforce";
    try {
        securityHeaders(
            { secure: false },
            {
                locals: {},
                setHeader(name, value) { headers[name.toLowerCase()] = value; },
            },
            () => {}
        );

        const policy = headers["content-security-policy"];
        assert.match(policy, /script-src[^;]*https:\/\/api\.mapbox\.com/);
        assert.match(policy, /style-src[^;]*https:\/\/api\.mapbox\.com/);
        assert.match(policy, /connect-src[^;]*https:\/\/api\.mapbox\.com/);
        assert.match(policy, /img-src[^;]*https:\/\/api\.mapbox\.com/);
    } finally {
        config.cspMode = originalMode;
    }
});
