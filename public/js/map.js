const mapElement = document.getElementById("map");
if (mapElement && mapElement.dataset.token && window.mapboxgl) {
    const defaultCoordinates = [77.209, 28.6139];
    let geometry;
    try {
        geometry = JSON.parse(mapElement.dataset.geometry || "null");
    } catch {
        geometry = null;
    }
    const coordinates = geometry?.type === "Point" &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length === 2 &&
        geometry.coordinates.every(Number.isFinite) &&
        geometry.coordinates[0] >= -180 &&
        geometry.coordinates[0] <= 180 &&
        geometry.coordinates[1] >= -90 &&
        geometry.coordinates[1] <= 90
        ? geometry.coordinates
        : defaultCoordinates;

    mapboxgl.accessToken = mapElement.dataset.token;
    const map = new mapboxgl.Map({
        container: mapElement,
        style: "mapbox://styles/mapbox/streets-v12",
        center: coordinates,
        zoom: 12,
    });
    map.addControl(new mapboxgl.NavigationControl());

    const markerElement = document.createElement("div");
    markerElement.className = "custom-map-marker";
    markerElement.setAttribute("aria-hidden", "true");
    markerElement.innerHTML = '<i class="fa-solid fa-house icon-default"></i><i class="fa-regular fa-compass icon-hover"></i>';

    const popupContent = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = mapElement.dataset.title || "Listing location";
    const privacyNote = document.createElement("p");
    privacyNote.textContent = "This marker shows an approximate location.";
    popupContent.append(title, privacyNote);

    const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: false,
        closeOnClick: false,
        className: "airbnb-popup",
    }).setDOMContent(popupContent);
    const marker = new mapboxgl.Marker(markerElement)
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map);

    markerElement.addEventListener("mouseenter", () => popup.addTo(map));
    markerElement.addEventListener("mouseleave", () => popup.remove());

    map.on("load", () => {
        map.addSource("approximate-listing-location", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: { type: "Point", coordinates },
                properties: {},
            },
        });
        map.addLayer({
            id: "approximate-listing-location-circle",
            type: "circle",
            source: "approximate-listing-location",
            paint: {
                "circle-radius": 65,
                "circle-color": "#fe424d",
                "circle-opacity": 0.2,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fe424d",
                "circle-stroke-opacity": 0.4,
            },
        });
    });
}
