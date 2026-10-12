document.querySelectorAll("[data-booking-form]").forEach((form) => {
    const checkButton = form.querySelector("[data-check-availability]");
    const submitButton = form.querySelector("[data-create-booking]");
    const message = form.querySelector("[data-booking-message]");
    const priceEstimate = form.querySelector("[data-price-estimate]");
    const unavailableMessage = form.querySelector("[data-unavailable-message]");
    const unavailableRangesList = form.querySelector("[data-unavailable-ranges]");
    const checkIn = form.querySelector('[name="booking[checkIn]"]');
    const checkOut = form.querySelector('[name="booking[checkOut]"]');
    const guests = form.querySelector('[name="booking[guests]"]');
    if (!checkButton || !submitButton || !message || !priceEstimate
        || !unavailableMessage || !unavailableRangesList || !checkIn || !checkOut || !guests) return;

    let estimateController;
    let rangeController;
    let estimateTimer;
    let lastEstimateKey;

    const selectionKey = () => [checkIn.value, checkOut.value, guests.value].join("|");

    const clearEstimate = () => {
        estimateController?.abort();
        lastEstimateKey = undefined;
        message.textContent = "";
        message.classList.remove("is-error", "is-success");
        priceEstimate.textContent = "";
        priceEstimate.hidden = true;
        submitButton.disabled = true;
        checkButton.disabled = false;
        checkButton.textContent = "Check availability";
    };

    const formatPrice = (priceSnapshot) => (priceSnapshot.subtotalMinor / 100).toLocaleString("en-IN", {
        style: "currency",
        currency: priceSnapshot.currency,
    });

    const displayUnavailableRanges = (ranges) => {
        unavailableRangesList.replaceChildren();
        if (ranges.length === 0) {
            unavailableMessage.textContent = "No unavailable ranges are listed in this 12-month window.";
            return;
        }

        unavailableMessage.textContent = "Your stay cannot overlap these unavailable ranges:";
        ranges.slice(0, 12).forEach((range) => {
            const item = document.createElement("li");
            item.textContent = `${range.checkIn} to ${range.checkOut} (check-out date excluded)`;
            unavailableRangesList.append(item);
        });
        if (ranges.length > 12) {
            const remaining = document.createElement("li");
            remaining.textContent = `${ranges.length - 12} more unavailable ranges`;
            unavailableRangesList.append(remaining);
        }
    };

    const loadUnavailableRanges = async () => {
        rangeController?.abort();
        rangeController = new AbortController();
        const url = new URL(form.dataset.availabilityListUrl, window.location.origin);
        if (checkIn.value) url.searchParams.set("from", checkIn.value);
        unavailableMessage.textContent = "Loading unavailable ranges…";
        unavailableRangesList.replaceChildren();
        try {
            const response = await fetch(url, { signal: rangeController.signal });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Unavailable dates could not be loaded.");
            displayUnavailableRanges(result.unavailableRanges);
        } catch (error) {
            if (error.name === "AbortError") return;
            unavailableMessage.textContent = "Unavailable dates could not be loaded. Check availability before requesting a hold.";
        }
    };

    const hasValidSelection = () => checkIn.value
        && checkOut.value
        && guests.value
        && checkIn.checkValidity()
        && checkOut.checkValidity()
        && guests.checkValidity()
        && checkOut.value > checkIn.value;

    const checkAvailability = async ({ reportValidity = false } = {}) => {
        if (reportValidity && !form.reportValidity()) return false;
        if (!hasValidSelection()) {
            message.textContent = "Choose a valid check-in, check-out, and guest count to check availability.";
            message.classList.add("is-error");
            return false;
        }

        estimateController?.abort();
        estimateController = new AbortController();
        const requestedSelection = selectionKey();
        checkButton.disabled = true;
        checkButton.textContent = "Checking dates…";
        submitButton.disabled = true;
        message.textContent = "Checking availability and updating the estimate…";
        message.classList.remove("is-error", "is-success");

        try {
            const response = await fetch(form.dataset.availabilityUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
                },
                body: new URLSearchParams(new FormData(form)),
                signal: estimateController.signal,
            });
            const result = await response.json();
            if (requestedSelection !== selectionKey()) return false;
            if (result.priceSnapshot) {
                priceEstimate.textContent = `Estimated price: ${formatPrice(result.priceSnapshot)}`;
                priceEstimate.hidden = false;
            }
            if (!response.ok || !result.available) {
                message.textContent = result.message || "Those dates are unavailable. Please choose different dates.";
                message.classList.add("is-error");
                return false;
            }

            lastEstimateKey = requestedSelection;
            message.textContent = "Dates are available. The final date hold checks availability again.";
            message.classList.add("is-success");
            submitButton.disabled = false;
            return true;
        } catch (error) {
            if (error.name === "AbortError") return false;
            message.textContent = "Availability could not be checked. Please try again.";
            message.classList.add("is-error");
            return false;
        } finally {
            if (requestedSelection === selectionKey()) {
                checkButton.disabled = false;
                checkButton.textContent = "Check availability";
            }
        }
    };

    const updateCheckOutMinimum = () => {
        const minimum = checkIn.value
            ? new Date(`${checkIn.value}T00:00:00.000Z`).toISOString().slice(0, 10)
            : checkIn.min;
        const earliestCheckout = checkIn.value
            ? new Date(new Date(`${minimum}T00:00:00.000Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
            : minimum;
        checkOut.min = earliestCheckout;
        if (checkOut.value && checkOut.value < earliestCheckout) checkOut.value = "";
    };

    const selectionChanged = (input) => {
        clearTimeout(estimateTimer);
        clearEstimate();
        if (input === checkIn) {
            updateCheckOutMinimum();
            loadUnavailableRanges();
        }
        if (hasValidSelection()) {
            estimateTimer = setTimeout(() => checkAvailability(), 200);
        } else {
            message.textContent = "Select check-in, check-out, and guests to see availability and an estimate.";
        }
    };

    checkButton.addEventListener("click", () => checkAvailability({ reportValidity: true }));
    checkIn.addEventListener("change", () => selectionChanged(checkIn));
    checkOut.addEventListener("change", () => selectionChanged(checkOut));
    guests.addEventListener("input", () => selectionChanged(guests));
    guests.addEventListener("change", () => selectionChanged(guests));
    updateCheckOutMinimum();
    submitButton.disabled = true;
    loadUnavailableRanges();

    form.addEventListener("submit", (event) => {
        if (lastEstimateKey !== selectionKey()) {
            event.preventDefault();
            checkAvailability({ reportValidity: true });
            return;
        }
        submitButton.disabled = true;
        submitButton.textContent = "Creating your 10-minute hold…";
    });
});
